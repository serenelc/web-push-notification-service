const express = require('express');
const auth = require('google-auth-library');
const parameterStore = require('../parameterStore');
const config = require('config');

let parameters = {};
parameterStore.init().then((storedParameters) => {
    parameters = storedParameters;
}).catch((err) => {
    console.log(err);
});

const router = express.Router();

const DOMAIN_LIST = ['trinitymirror.com', 'reachplc.com'];

router.get('/', (req, res) => {
    delete req.session.redirect_to;
    res.render('login');
});

router.post('/auth', (req, res) => {
    const token = req.body.idtoken || '';
    
    const client = new auth.OAuth2Client(config.auth.client_id, parameters.google_client_secret_new, '');
    client.verifyIdToken({
        idToken: token,
        audience: config.auth.client_id
    }).then(login => {
        const payload = login.getPayload();
        const domain = payload.hd;

        if (payload.aud === config.auth.client_id && DOMAIN_LIST.includes(domain)) {
            req.session.oauth = { expiry: payload.exp };
            console.log(`User ${payload.email} signed in`);
            req.session.email = payload.email;
            req.session.save(err => {
                console.log(err);
                res.sendStatus(200);
            });
                        
        } else {
            console.log('AUTHENTICATION FAILED');
            console.log(payload);
            res.sendStatus(401);
        }
    });
});

router.post('/logout', (req, res) => {
    req.session.oauth = {};
    res.sendStatus(200);
});

module.exports = router;
