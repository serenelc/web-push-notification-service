const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const session = require('express-session');
const connectRedis = require('connect-redis');
const redis = require('redis');
const crypto = require('crypto');
const config = require('config');
const cookieParser = require('cookie-parser');
const sassMiddleware = require('node-sass-middleware');
const login = require('./modules/routes/login');
const { router: signUp } = require('./modules/routes/signUp');
const routes = require('./modules/routes/index');
const cronFunctions = require('./modules/cronFunctions');
const { errorHandler } = require('./modules/errorHandler');
const sessionExpiryInSeconds = 60 * 60;
const app = express();
const RedisStore = connectRedis(session);

app.use(/\/((?!AWSHealthCheck).)*/, session({
    store: new RedisStore({
        client: redis.createClient({ url: config.redisURL }),
        ttl: sessionExpiryInSeconds
    }),
    secret: crypto.randomBytes(64).toString('hex'),
    maxAge: sessionExpiryInSeconds * 1000,
    resave: false,
    saveUninitialized: true
}));

app.use(cookieParser());

cronFunctions.init(config);

app.use(
    sassMiddleware({
        src: __dirname + '/sass',
        dest: __dirname + '/public',
        debug: false,
        outputStyle: "compressed"
    })
);

app.use('/', express.static(path.resolve(__dirname, 'public')));

app.use(bodyParser.urlencoded({
    extended: true
}));

app.use(bodyParser.json());

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

app.get('/AWSHealthCheck', (req, res) => res.send('Healthy'));
app.set('view engine', 'pug');

app.use('/login', login);
app.use('/signUp', signUp);
app.use((req, res, next) => {

    const debug = req.cookies.debug;

    const allowedUrls = ['/login/auth', '/login'];

    if (debug) {
        console.log(`Authorisation expiry: ${req.session.oauth && req.session.oauth.expiry}`);
        console.log(`Current time: ${(Date.now() / 1000)}`);
    }

    // verify that user has been throuh the auth step or the page is allowed
    if ((req.session.oauth && req.session.oauth.expiry > (Date.now() / 1000)) ||
    (allowedUrls.includes(req.url))) {
        return next();
    }

    // push unauth'd users to the login page
    if (debug) {
        console.log(`Not authorised: ${JSON.stringify(req.session.oauth)}`);
    }

    return res.redirect(`/login`);
});

app.use('/', routes, errorHandler);

module.exports = app;
