const mockScheduleJob = jest.fn((settings, callback) => {
    callback();
});

const mockSendCommand = jest.fn((command, inputs, callback) => {
    callback(null, '12');
});

const mockPutMetricData = jest.fn();

const mockCreateClient = jest.fn(() => ({
    send_command: mockSendCommand,
    quit: jest.fn()
}));

jest.mock('node-schedule', () => ({
    scheduleJob: mockScheduleJob
}));

jest.mock('redis', () => ({
    createClient: mockCreateClient
}));

jest.mock('aws-sdk', () => ({
    CloudWatch: class CloudWatch {
        putMetricData(params, callback) {
            mockPutMetricData(params, callback);
        }
    },
    config: { update: jest.fn() }
}));

const cronFunctions = require('./cronFunctions');

describe('cronFunctions', () => {
    const config = {
        redisUrl: 'testUrl',
        publications: [
            {
                homepage: 'publication1'
            },
            {
                homepage: 'publication2'
            }
        ]
    };

    it('should set a scheduled timer that runs every minute', () => {
        cronFunctions.init(config);
        expect(mockScheduleJob.mock.calls[0][0]).toEqual('*/1 * * * *');
    });

    it('should send the SCARD command to each publication in the settings', () => {

        cronFunctions.init(config);
        expect(mockSendCommand.mock.calls[0][0]).toEqual('SCARD');
        expect(mockSendCommand.mock.calls[0][1]).toEqual(['publication1']);
        expect(mockSendCommand.mock.calls[1][0]).toEqual('SCARD');
        expect(mockSendCommand.mock.calls[1][1]).toEqual(['publication2']);
    });

    it('should put the correct metric data on cloudwatch', () => {
        cronFunctions.init(config);

        expect(mockPutMetricData.mock.calls[0][0]).toMatchObject({
            MetricData: [
                {
                    MetricName: 'publication1_user_count',
                    Unit: 'Count',
                    Value: 12
                }
            ],
            Namespace: 'WebPush'
        });
        expect(mockPutMetricData.mock.calls[1][0]).toMatchObject({
            MetricData: [
                {
                    MetricName: 'publication2_user_count',
                    Unit: 'Count',
                    Value: 12
                }
            ],
            Namespace: 'WebPush'
        });
    });
});
