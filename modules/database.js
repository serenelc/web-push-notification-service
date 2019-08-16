const Joi = require('joi');
const webpush = require('web-push');
const parameterStore = require('./parameterStore');
const redis = require('redis');
const AWS = require('aws-sdk');
const config = require('config');
const hl = require('highland');
const { pushToCloudwatch } = require('./cronFunctions');
const metricsNamespace = 'WebPushDiagnostics';
const RECEIPT_INTERVAL = 5000;
const metricsResolution = 1;

AWS.config.update({ region: 'eu-west-1' });

let parameters = {};
parameterStore.init().then((storedParameters) => {
    parameters = storedParameters;
}).catch((err) => {
    console.log(err);
});

const getSubscriberCount = publication => {
    const client = redis.createClient({ url: config.redisURL });

    return new Promise((resolve, reject) => {
        client.send_command('SCARD', [publication], (err, result) => {
            if (err) {
                console.log('Scan error: ', err);
                reject(err);
            } else {
                resolve(result.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ","));
            }
            client.quit();
        });
    });
};

const subscriptionFormatIsCorrect = (pushSubscription, callback) => {
    const keysSchema = Joi.object().keys({
        p256dh: Joi.string().max(150).required(),
        auth: Joi.string().max(30).required()
    });

    const pushSubscriptionSchema = Joi.object().keys({
        endpoint: Joi.string().required(),
        expirationTime: Joi.any(),
        keys: keysSchema
    });

    Joi.validate(pushSubscription, pushSubscriptionSchema, callback);
    return null;
};

const restoreFromBackup = () => {

    console.warn('RESTORING DB FROM BACKUP');

    const db = new AWS.DynamoDB({ apiVersion: '2012-10-08' });

    const params = {
        TableName: config.backupTable,
        ProjectionExpression: 'Publication, Subscription'
    };

    db.scan(params, function scanComplete(err, data) {
        if (err) {
            console.log('Error', err);
        } else {
            console.info(`DB scan complete: ${data.LastEvaluatedKey}`);

            if (data.LastEvaluatedKey) {
                params.ExclusiveStartKey = data.LastEvaluatedKey;
                db.scan(params, scanComplete);
            }

            const client = redis.createClient({ url: config.redisURL });

            console.info(`Restoring ${data.Items.length} items`);

            data.Items.forEach((element) => {
                const publication = element.Publication.S;
                const subscription = element.Subscription.S;

                client.sadd(publication, subscription, (err, success) => {
                    if (err) {
                        console.error(`Error restoring ${publication}: ${subscription}: ${err}`);
                    } else {
                        console.info(`Successful restore (${success})`);
                    }
                });
            });
            client.quit();
        }
    });
};

const backupToDynamo = (publication, subscription) => {
    const db = new AWS.DynamoDB({ apiVersion: '2012-10-08' });

    const params = {
        TableName: config.backupTable,
        Item: {
            Publication: { S: publication },
            Subscription: { S: subscription }
        }
    };
    return new Promise((resolve, reject) => {
        db.putItem(params, (err, data) => {
            if (err) {
                console.error('Error', err);
                reject(err);
            } else {
                console.error('User added to dynamo', data);
                resolve();
            }
        });
    });
};

const deleteFromDynamo = (publication, subscription) => {
    const db = new AWS.DynamoDB({ apiVersion: '2012-10-08' });
    const params = {
        Key: {
            Subscription: {
                S: subscription
            }
        },
        TableName: config.backupTable
    };
    db.deleteItem(params, (err, data) => {
        if (err) {
            console.log(err, err.stack);
        } else {
            console.log('Removed unsubscribed user from dynamo', data);
        }
    });
};

const deleteOldSubs = (publication, value) => {
    const client = redis.createClient({ url: config.redisURL });
    client.send_command('SREM', [publication, value], () => console.log('Removed unsubscribed user from redis'));
    client.quit();
    deleteFromDynamo(publication, value);
};

const sscan = (client, publication, cursor) => {
    return new Promise((resolve, reject) => {
        client.send_command('SSCAN', [publication, cursor], (scanErr, result) => {
            if (scanErr) {
                console.log('Scan error: ', scanErr);
                reject(scanErr);
            }
            resolve(result);
        });
    });
};

const sendAll = (client, publication, pushMessage) => {
    webpush.setGCMAPIKey(parameters.gcmAPIKey);
    webpush.setVapidDetails(
        'mailto:mirrornews@mirror.co.uk',
        config.publicKey,
        parameters.privateVapidKey,
    );

    const responses = {};
    const sentNotifications = [];
    const logReceipts = config.publications.find(el => el.homepage === publication).logReceipts;
    const receipts = {
        success: [],
        failure: [],
        complete: false
    };

    const receiptReader = setInterval(() => {

        if (receipts.complete) {
            clearInterval(receiptReader);
        }

        const success = receipts.success.length;
        const failure = receipts.failure.length;

        if (success > 0) {
            receipts.success.length = 0;
            pushToCloudwatch(publication, success, 'notification_delivered', { metricsNamespace, metricsResolution });
        }
        if (failure > 0) {
            receipts.failure.length = 0;
            pushToCloudwatch(publication, failure, 'notification_failed', { metricsNamespace, metricsResolution });
        }

    }, RECEIPT_INTERVAL);

    const setStream = hl();
    setStream.write('0');

    return new Promise(resolve => {
        setStream
            .flatMap(currentCursor => hl(sscan(client, publication, currentCursor)))
            .map(result => {
                const newCursor = result[0].toString();
                const values = result[1];

                if (newCursor !== '0') {
                    setStream.write(newCursor);
                } else {
                    setStream.write(hl.nil);
                }
                return values;
            })
            .flatten()
            .each(value => {
                const pushSubscription = JSON.parse(value.toString());

                const sentNotification = webpush.sendNotification(pushSubscription, pushMessage, { TTL: config.notificationTTL })
                    .then(notificationObject => {
                        if (!responses[notificationObject.statusCode]) {
                            responses[notificationObject.statusCode] = 0;
                        }
                        responses[notificationObject.statusCode]+= 1;
                        if (logReceipts) {
                            receipts.success.push(notificationObject);
                        }
                    })
                    .catch(notificationErr => {
                        if (!responses[notificationErr.statusCode]) {
                            responses[notificationErr.statusCode] = 0;
                        }
                        responses[notificationErr.statusCode]+= 1;
                        if (notificationErr.statusCode && notificationErr.statusCode.toString().startsWith('4')) {
                            deleteOldSubs(publication, value);
                        } else {
                            console.log(notificationErr);
                        }
                        if (logReceipts) {
                            receipts.failure.push(notificationErr);
                        }
                    });

                sentNotifications.push(sentNotification);
            })
            .done(() => {
                receipts.complete = true;
                Promise.all(sentNotifications).then(() => {
                    client.quit();
                    resolve(responses);
                });
            });
    });
};

module.exports = {
    subscriptionFormatIsCorrect,
    sendAll,
    backupToDynamo,
    restoreFromBackup,
    getSubscriberCount
};
