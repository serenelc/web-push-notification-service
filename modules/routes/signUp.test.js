const { validateAndSubmitToDatabase } = require('./signUp');

describe("routes/signUp", () => {
    let mockRes, subscription;

    beforeAll(() => {
        mockRes = {
            status: jest.fn((status) => {
                const send = jest.fn((error) => ({ status, error }));
                return { send };
            })
        };
        subscription = {
            publication: "localhost",
            subscription: {
                endpoint: "https://fcm.googleapis.com/fcm/send/fLuA0IepgSY:APA91bE2hnkvXeJHZGgor3SX1fokZJEcP7o2cvMLamWfwi_DNDxe-869V4CM0DxgXcqoOfzFJZ_3yyFju3OUtHvZJG0TsKIncGklgeIPPsAQyGU-IHVsUU4xT-2LHId8WPsvepAi5gr_",
                expirationTime: null,
                keys: {
                    p256dh: "BP8-5B_6dDt9f9SIpZrUqxfC0w3yMQtIWgEHy026qqRL4ZSjYcXJcfGbjnZoDDwXCYbP-xtYipe93uqULc4yV4A",
                    auth: "1J0y_UhImV6aFDM29nbCvA"
                }
            }
        };
    });
    it("should return correct reponse for invalid subscription", () => {
        const { publication, ...invalidSubscription } = subscription;
        const validationError = "Validation Error";
        validateAndSubmitToDatabase(mockRes, publication, invalidSubscription)(validationError);
        
        const status = mockRes.status.mock.calls[0][0];
        expect(status).toEqual(400);

        const response = mockRes.status.mock.results[0].value.send.mock.calls[0][0];
        expect(response).toEqual("Sign Up Error: Validation Error");
    });

    it("should return correct response for an invalid publication", () => {
        const publication = "localhost:8080";
        validateAndSubmitToDatabase(mockRes, publication, subscription)();
        
        const status = mockRes.status.mock.calls[0][0];
        expect(status).toEqual(400);
        
        const response = mockRes.status.mock.results[0].value.send.mock.calls[0][0];
        expect(response).toEqual("Sign Up Error");
    });
});