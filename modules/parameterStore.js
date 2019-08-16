const AWS = require('aws-sdk');

const init = () => {
    const parameters = {};
    const parameterPath = '/webPush/';
    const pathRegEx = new RegExp(`${parameterPath}(.*)`);
    const ssm = new AWS.SSM({ region: 'eu-west-1' });

    return new Promise((resolve, reject) => {
        ssm.getParametersByPath({
            Path: parameterPath,
            Recursive: true,
            WithDecryption: true
        }, (err, data) => {
            if (data) {
                if (data.Parameters) {
                    data.Parameters.forEach((parameter) => {
                        const name = parameter.Name.match(pathRegEx)[1];
                        parameters[name] = parameter.Value;
                    });
                    resolve(parameters);
                }
            }
            reject(err);
        });
    });
};

module.exports = { init };
