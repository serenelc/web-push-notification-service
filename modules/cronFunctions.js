const schedule = require('node-schedule');
const AWS = require('aws-sdk');
AWS.config.update({ region: 'eu-west-1' });
const cloudwatch = new AWS.CloudWatch();
const redis = require('redis');

const pushToCloudwatch = (publicationName, value, metric, { metricsNamespace='WebPush', metricsResolution=60 } = {}) => {
    const params = {
        MetricData: [
            {
                MetricName: `${publicationName}_${metric}`,
                Value: value,
                Timestamp: new Date,
                Unit: 'Count',
                StorageResolution: metricsResolution
            }
        ],
        Namespace: metricsNamespace
    };

    cloudwatch.putMetricData(params, (err) => {
        if (err) {
            console.log(err);
        }
    });
};

const init = (config) => {
    schedule.scheduleJob('*/1 * * * *', function () {
        config.publications.forEach(({ homepage }) => {
            const client = redis.createClient({ url: config.redisURL });

            client.send_command('SCARD', [homepage], (err, result) => {
                if (err) {
                    console.log('Scan error: ', err);
                } else {
                    const userCount = parseInt(result);

                    pushToCloudwatch(homepage, userCount, 'user_count');
                }
                client.quit();
            });
        });
    });
};

module.exports = { init, pushToCloudwatch };
