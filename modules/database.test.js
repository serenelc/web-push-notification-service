const mockPutItem = jest.fn();
const mockSadd = jest.fn();
const mockDeleteItem = jest.fn();
const mockSendNotification= jest.fn();
const mockSendCommand = jest.fn();

const mockScan = (params, callback) => {
    const callBackData = {
        Items: [
            {
                Publication: {
                    S: 'testPublication0'
                },
                Subscription: {
                    S: 'testSubscription0'
                }
            },
            {
                Publication: {
                    S: 'testPublication1'
                },
                Subscription: {
                    S: 'testSubscription1'
                }
            }
        ]
    };
    callback(null, callBackData);
};

const mockOverrideSendCommand = (command, action, callback) => {
    if (command === 'SSCAN') {
        const cursor = action[1];

        if (cursor === '0') {
            callback(null, ['1', ['{"pushSub": "0"}', '{"pushSub": "1"}']]);
        }
        callback(null, ['0', ['{"pushSub": "2"}', '{"pushSub": "3"}']]);
    }
};

jest.mock('aws-sdk', () => ({
    config: { update: jest.fn() },
    SSM: class SSM {
        getParametersByPath() {}
    },
    DynamoDB: class DynamoDB {
        putItem(params, callback) {
            mockPutItem(params, callback);
        }
        deleteItem(params, callback) {
            mockDeleteItem(params, callback);
        }
        scan(params, callback) {
            mockScan(params, callback);
        }
    },
    CloudWatch: class CloudWatch {
        putMetricData(params, callback) {
            mockPutMetricData(params, callback);
        }
    }
}));

jest.mock('redis', () => ({
    createClient: () => ({
        quit: () => {},
        sadd: (set, value) => {
            mockSadd(set, value);
        },
        send_command: (command, action, callback) => {
            mockOverrideSendCommand(command, action, callback);
            mockSendCommand(command, action, callback);
        }
    })
}));

jest.mock('web-push', () => ({
    setGCMAPIKey: jest.fn(),
    setVapidDetails: jest.fn(),
    sendNotification: mockSendNotification
}));

jest.mock('config', () => ({
    notificationTTL: 12345,
    backupTable: 'webPushBackup',
    logTable: 'webPushLogs',
    publications: {
        find: () => ({})
    }
})
);

const redis = require('redis');

const {
    subscriptionFormatIsCorrect,
    sendAll,
    backupToDynamo,
    restoreFromBackup
} = require('./database');

describe('modules/database', () => {
    describe('subscriptionFormatIsCorrect', () => {
        it('should return no error if the subscription format is correct', () => {
            const testJson = {
                endpoint: 'testEndpoint',
                expirationTime: new Date().getTime(),
                keys: {
                    p256dh: 'testp256dh',
                    auth: 'testAuth'
                }
            };

            subscriptionFormatIsCorrect(testJson, (err) => {
                expect(err).toBeNull();
            });
        });

        it('should return an error if the subscription format is not correct', () => {
            const testJson = {};

            subscriptionFormatIsCorrect(testJson, (err) => {
                expect(err).toBeTruthy();
            });
        });

        it('should return an error if the subscription format is null', () => {
            const testJson = null;

            subscriptionFormatIsCorrect(testJson, (err) => {
                expect(err).toBeTruthy();
            });
        });
    });

    describe('sendAll', () => {
        let responses;

        beforeAll(() => {
            mockSendNotification
                .mockReturnValueOnce(Promise.reject({ statusCode: 410 }))
                .mockReturnValueOnce(Promise.reject({ statusCode: 410 }))
                .mockReturnValueOnce(Promise.reject({ statusCode: 410 }))
                .mockReturnValueOnce(Promise.resolve({ statusCode: 210 }));

            const client = redis.createClient();
            responses = sendAll(client, 'testPublication', 'testMessage');
        });

        it('should generate a stream of entries from redis', () => {

            responses.then(() => {
                expect(mockSendNotification.mock.calls[0][0]).toEqual({ 'pushSub': '0' });
                expect(mockSendNotification.mock.calls[1][0]).toEqual({ 'pushSub': '1' });
                expect(mockSendNotification.mock.calls[2][0]).toEqual({ 'pushSub': '2' });
            });
        });

        it('should delete entry from dynamo and redis if a 410 is received', () => {
            responses.then(() => {
                expect(mockSendNotification.mock.calls[0][0]).toEqual({ 'pushSub': '0' });
                expect(mockSendNotification.mock.calls[1][0]).toEqual({ 'pushSub': '1' });
                expect(mockSendNotification.mock.calls[2][0]).toEqual({ 'pushSub': '2' });

                expect(mockSendCommand.mock.calls[1][0]).toBe('SREM');
                expect(mockSendCommand.mock.calls[1][1]).toEqual(['testPublication', '{"pushSub": "0"}']);

                expect(mockSendCommand.mock.calls[2][0]).toBe('SREM');
                expect(mockSendCommand.mock.calls[2][1]).toEqual(['testPublication', '{"pushSub": "1"}']);

                expect(mockSendCommand.mock.calls[3][0]).toBe('SREM');
                expect(mockSendCommand.mock.calls[3][1]).toEqual(['testPublication', '{"pushSub": "2"}']);
            });
        });

        it('should set the correct expiry on notifications', () => {
            responses.then(() => {
                expect(mockSendNotification.mock.calls[0][2]).toEqual({ 'TTL': 12345 });
            });
        });

        it('should set the correct expiry on notifications', () => {
            responses.then(statusCodes => {
                expect(statusCodes).toEqual({ 210: 1, 410: 3 });
            });
        });

    });

    describe('backupToDynamo', () => {
        it('should submit the correct request to dynamoDB', () => {
            backupToDynamo('testPublication', 'testSubscription');
            const expectedRequest ={
                Item: {
                    Publication: {
                        S: 'testPublication'
                    },
                    Subscription: {
                        S: 'testSubscription'
                    }
                },
                TableName: 'webPushBackup'
            };

            expect(mockPutItem.mock.calls[0][0]).toEqual(expectedRequest);
        });
    });

    describe('restoreFromBackup', () => {
        it('should iterate through the dynamodb elements and add them to redis', () => {
            restoreFromBackup();
            expect(mockSadd.mock.calls[0][0]).toEqual('testPublication0');
            expect(mockSadd.mock.calls[0][1]).toEqual('testSubscription0');
            expect(mockSadd.mock.calls[1][0]).toEqual('testPublication1');
            expect(mockSadd.mock.calls[1][1]).toEqual('testSubscription1');
        });
    });
});