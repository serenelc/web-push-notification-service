const express = require('express');
const database = require('../database');
const router = express.Router();
const config = require('config');
const redis = require('redis');

// checks if a publication exists as a PWA
const checkIfValidPublication = (publication) => config.publications.find(pub => pub.homepage === publication);

//Add subscription to redis
const addSubscriptionToRedis = (publication, subscriptionString) => {
    const client = redis.createClient({ url: config.redisURL });
    client.sadd(publication, subscriptionString);
    client.quit();
};

//Subscription backed up to Dynamo DB
const backUpSubscriptionToDB = (res, publication, subscriptionString) => {
    database.backupToDynamo(publication, subscriptionString)
        .then(() => res.send('Done'))
        .catch((err) => {
            const error = `Sign Up ${new Error(err)}`;
            console.error(error);
            res.status(500).send(error);
        });
};

// Callback submits user to DB and sends appropriate response
const validateAndSubmitToDatabase = (res, publication, subscription) => (err) => {
    const subscriptionString = JSON.stringify(subscription);
    if (err !== null) {
        const error = `Sign Up ${new Error(err)}`;
        console.error(error);
        return res.status(400).send(error);
    }
    if (!checkIfValidPublication(publication)) {
        const error = `Sign Up ${new Error(`${publication} is not a valid publication`)}`;
        console.error(error);
        return res.status(400).send(error);
    }
    addSubscriptionToRedis(publication, subscriptionString);
    backUpSubscriptionToDB(res, publication, subscriptionString);
};

const signUpMiddleware = (req, res) => {
    const { subscription, publication } = req.body;
    // Check that subscription format is correct
    database.subscriptionFormatIsCorrect(subscription, validateAndSubmitToDatabase(res, publication, subscription));
};

router.post('/', signUpMiddleware);

module.exports = {
    router,
    validateAndSubmitToDatabase
};