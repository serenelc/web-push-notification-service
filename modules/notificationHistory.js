const AWS = require('aws-sdk');
const { parse } = require('json2csv');
const config = require('config');

const backUp = (publication, pushContent, { responses, email, duration=0 }={}) => {
    const db = new AWS.DynamoDB({ apiVersion: '2012-10-08' });
    const timeStamp = Date.now().toString();
    const { body, url, silent } = pushContent;
    const id = Buffer.from(`${body}${url}${publication}${timeStamp}`).toString('base64');
    const stringifiedResponses = JSON.stringify(responses);

    const params = {
        TableName: config.logTable,
        Item: {
            ID: { S: id },
            Publication: { S: publication },
            Body: { S: body },
            Url: { S: url },
            Email: { S: email },
            Silent: { BOOL: silent },
            Responses: { S: stringifiedResponses },
            Timestamp: { N: timeStamp },
            SendDuration: { N: duration.toString() }
        }
    };

    db.putItem(params, (err, data) => {
        if (err) {
            console.log('Error', err);
        } else {
            console.log('Notification logged to dynamo', data);
        }
    });
};

const formatAsCSV = (json) => {
    const opts = {
        fields: ["Timestamp", "Publication", "Body", "Email", "Url", "Successful Deliveries", "Silent"]
    };
    try {
        const convertDBResponseToObj = json.Items.map(record => AWS.DynamoDB.Converter.unmarshall(record)).map(record => ({
            ...record,
            "Timestamp": new Date(parseInt(record.Timestamp)).toLocaleString('en-GB'),
            "Successful Deliveries": JSON.parse(record.Responses)[201],
            "Silent": record.Silent ? "Silent" : "-"
        }));
        return parse(convertDBResponseToObj, opts);
    } catch (err) {
        return "error generating CSV";
    }
};

const getHistory = (publication, currentKey, pageLimit) => {
    const db = new AWS.DynamoDB({ apiVersion: '2012-10-08' });

    const defaultParams = {
        TableName: config.logTable,
        IndexName: 'SortIndex',
        ExpressionAttributeValues: {
            ':publication': { S: publication }
        },
        KeyConditionExpression: 'Publication = :publication',
        ExpressionAttributeNames: {
            "#ts": "Timestamp",
            "#url": "Url"
        },
        ProjectionExpression: 'Publication, #ts, Body, #url, Responses, Email, SendDuration, Silent',
        ScanIndexForward: false
    };

    const params = pageLimit ? Object.assign(defaultParams, pageLimit) : defaultParams;

    if (currentKey) {
        const lastEvaluatedKey = JSON.parse(Buffer.from(currentKey, 'base64').toString('ascii'));
        params.ExclusiveStartKey = lastEvaluatedKey;
    }

    return new Promise((resolve, reject) => {
        db.query(params, function (err, data) {
            if (err) {
                reject(err);
            } else {
                resolve(data);
            }
        });
    });

};

module.exports = { backUp, getHistory, formatAsCSV };