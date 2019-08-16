/* eslint-disable no-plusplus */
const express = require('express');
const config = require('config');
const redis = require('redis');
const moment = require('moment');
const database = require('../database');
const { getHistory, backUp, formatAsCSV } = require('../notificationHistory');
const { pushToCloudwatch } = require('../cronFunctions');
const { PerformanceObserver, performance } = require('perf_hooks');
const router = express.Router();
const { google } = require('googleapis');
const parameterStore = require('../parameterStore');
const { isEmpty } = require('../helpers.js');

let parameters = {};
parameterStore.init().then((storedParameters) => {
    parameters = storedParameters;
}).catch((err) => {
    console.error("Error with parameter store", err);
});

const renderPublicationList = (res) => res.render('home', {
    publications: config.publications
});

const hosts = config.publications.reduce((hosts, entry) => {
    const hostname = entry.host;
    hosts[hostname] = hosts[hostname] || { name: hostname, publications: [] };
    hosts[hostname].publications.push(entry);
    return hosts;
}, {});

function getAllowedUsers(auth, publication) {
    const sheets = google.sheets({ version: config.sheets.version, auth });
    const pubObject = config.publications.filter(pub => pub.homepage === publication)[0];
    let channelName = pubObject.group ? pubObject.group : pubObject.name;

    return new Promise ((resolve, reject) => {
        sheets.spreadsheets.values.get({
            spreadsheetId: config.sheets.id,
            range: `'${channelName}'!A:A`
        }, (err, res) => {
            if (err) {
                reject(err.errors);
            } else {
                const userList = res.data.values
                    .reduce((prev, current) => current.concat(prev))
                    .map(entry => entry.trim());

                if (userList.length) {
                    resolve(userList);
                } else {
                    reject(null);
                    console.log(`No entries for ${channelName}`);
                }
            }
        });
    });

}

function initClients(req, res, next) {
    const { client_id } = config.auth;
    const redirect_uri = `${req.protocol}://${req.hostname}${process.env.LOCAL ? ":"+config.port : ""}/sheetsauth`;
    req.authClient = new google.auth.OAuth2(client_id, parameters.sheets_client_secret, redirect_uri);
    req.redisClient = redis.createClient({ url: config.redisURL });
    next();
}

router.get('/allPublications', (req, res) => {
    // console.log("Hosts: ", JSON.stringify(hosts));
    return res.send(hosts);
});

function getPermissions(req) {
    let q = req.query.publication || "";
    let pub = hosts[q];
    let thisPub = pub.publications;

    if (req.session.token) {
        req.authClient.setCredentials({ "refresh_token": req.session.token.refresh || "", "access_token": req.session.token.access || "" });
        const allowedUsersPromise = thisPub.map((publication) => getAllowedUsers(req.authClient, publication.homepage));
    
        return Promise.all(allowedUsersPromise)
            .then((allowedUsers) => {
                return allowedUsers.map((channelAllowedUsers, index) => {
                    let writeAccess = false;
                    if (channelAllowedUsers.includes(req.session.email)) {
                        writeAccess = true;
                        req.session.isAuthorised = true;
                    }
                    return { homepage: thisPub[index].homepage, writeAccess: writeAccess };
                });
            });
    }

}

router.get('/channelDetails', initClients, (req, res) => {
    let q = req.query.publication || "";
    let pub = hosts[q];
    const thisPub = pub.publications;

    const publicationPromise = thisPub.map((publication) => database.getSubscriberCount(publication.homepage));

    Promise.all(publicationPromise)
        .then((values) => {
            return getPermissions(req)
                .then((result) => {
                    return values.map((sub, j) => {
                        if (result[j].homepage === thisPub[j].homepage) {
                            //NOTE: worth coming back to do this in another way for cases when the 2 lists aren't in the same order.
                            return { homepage: result[j].homepage, name: thisPub[j].name, sub: sub, writeAccess: result[j].writeAccess };
                        }
                    });
                });
        })
        .then((channelDetails) => {
            // console.log("Channel Details: ", channelDetails);
            res.send(channelDetails);
        });
});


router.get('/sheetsauth', initClients, (req, res) => {
    if (req.query.code) {
        console.info("redirect successful, code in query", req.query.code);
        req.authClient.getToken(req.query.code, (err, data) => {
            if (err) {
                console.error('Error while trying to retrieve new access token', err);
            }
            req.session.token.access = data.access_token;
            req.session.token.refresh = data.refresh_token;
            req.redisClient.set([req.session.email, data.refresh_token]);
            req.redisClient.hset(req.session.email, "REFRESH_TOKEN", data.refresh_token);
            res.redirect('/');
        });
    }
});

router.get('/bookmarks', initClients, (req, res) => {
    const userBookmarks = req.session.email + ":bookmarks";
    req.redisClient.smembers(userBookmarks, (err, vals) => {
        res.send(vals);
    });
});

router.post('/addNewBookmark', initClients, (req, res) => {
    const channel = req.body.details;
    const channelInfo = JSON.stringify(config.publications.filter(({ homepage }) => {
        return homepage.indexOf(channel.split("::")[0]) > 0;
    })[0]);
    const userBookmarks = req.session.email + ":bookmarks";
    req.redisClient.sadd(userBookmarks, channelInfo, (err, vals) => {
        console.log(`response: ${vals && "channel added to bookmarks"}`);
        res.sendStatus(200);
    });
});

router.post('/deleteBookmark', initClients, (req, res) => {
    const channel = req.body.details;
    const channelInfo = JSON.stringify(config.publications.filter(({ homepage }) => {
        return homepage.indexOf(channel.split("::")[0]) > 0;
    })[0]);
    const userBookmarks = req.session.email + ":bookmarks";
    req.redisClient.srem(userBookmarks, channelInfo, (err, vals) => {
        console.log(`response: ${vals && "channel removed from bookmarks"}`);
        res.sendStatus(200);
    });
});

router.get('/subCount', (req, res) => {
    database.getSubscriberCount(req.query.homepage)
        .then((val) => {
            console.log("________", val);
            res.send(val);
        });
});

router.get('/', initClients, (req, res) => {
    // DEBUG: req.redisClient.del(req.session.email);
    if (!req.session.token || isEmpty(req.session.token)) {
        console.info("No session token, attempt to retrieve from redis");
        req.session.token = {};
        req.redisClient.get(req.session.email, (err, token) => {
            if (err) {
                console.error("Error getting refresh token from redis", err);
            }
            let refreshToken = token;
            if (!refreshToken) {
                console.info("No token in redis for user", req.session.email, "Going to redirect");
                const authUrl = req.authClient.generateAuthUrl({
                    access_type: 'offline',
                    scope: config.sheets.api_scopes,
                    prompt: "consent" // Do we need this
                });
                res.redirect(authUrl);
            } else {
                console.info("Got the refresh token for user from redis", refreshToken);
                req.session.token.refresh = refreshToken;
                renderPublicationList(res);
            }
        });
    } else {
        renderPublicationList(res);
    }

});

router.get('/restore', (req, res) => {
    database.restoreFromBackup();
    res.send('Done');
});

router.get('/sent', (req, res, next) => {
    const publication = req.query.publication || '';
    const currentKey = req.query.currentKey;
    const prevKey = req.query.prevKey;
    const pageLimit = 20;

    getHistory(publication, currentKey, pageLimit)
        .then(data => {
            res.render('history', {
                publication,
                data,
                currentKey,
                prevKey
            });
        })
        .catch((err) => {
            console.error(`Error fetching notification history for ${publication}`, err);
            req.errorObject = {
                error: "Unable to fetch notification history",
                err: err,
                showHome: true
            };
            return next();
        });
});

router.get('/recentHistory', (req, res, next) => {
    const publication = req.query.publication || '';
    const currentKey = req.query.currentKey;
    const pageLimit = 1;

    getHistory(publication, currentKey, pageLimit)
        .then(data => {
            let recent = [];
            if (data.Items.length < 5) {
                recent = data.Items;
            } else {
                for (let i = 0; i < 5; i++) {
                    recent[i] = data.Items[i];
                }
            }
            // console.log("Recent History: ", JSON.stringify(recent));
            res.send(recent);
        })
        .catch((err) => {
            console.error(`Error fetching notification history for ${publication}`, err);
            req.errorObject = {
                error: "Unable to fetch notification history",
                err: err,
                showHome: true
            };
            return next();
        });
});

router.get('/history', (req, res) => {
    const publication = req.query.publication || '';
    getHistory(publication)
        .then(data => {
            const formattedData = {
                data: `data:text/csv;charset=utf-8,${formatAsCSV(data)}`,
                todaysDate: moment().format('DD-MM-YYYY')
            };
            res.send(formattedData);
        })
        .catch(err => res.send(err));
});

function statusCount(statuses, code) {
    return statuses.filter(status => status.code.startsWith(code.toString())).reduce((total, status) => total + status.val, 0);
}

router.post('/send', initClients, (req, res) => {
    const publication = req.body.publication || '';
    const pushContent = {
        body: req.body.body,
        url: req.body.url,
        publication,
        silent: req.body.silent
    };
    const userEmail = req.session.email;

    if (config.publications.find(pub => pub.homepage === publication) && req.session.isAuthorised) {
        const client = redis.createClient({ url: config.redisURL });
        let duration = 0;
        const obs = new PerformanceObserver((items) => {
            performance.clearMarks();
            duration = items.getEntries()[0].duration;
        });
        obs.observe({ entryTypes: ['measure'] });
        performance.mark('push_send_start');

        console.info(`Notification sent by ${userEmail}: ${JSON.stringify(pushContent)}`);

        database.sendAll(client, publication, JSON.stringify(pushContent))
            .then(responses => {
                performance.mark('push_send_finish');
                performance.measure('push_send_duration', 'push_send_start', 'push_send_finish');
                const statuses = Object.keys(responses).map(code => ({ code, val: responses[code] }));
                pushToCloudwatch(publication, 1, 'push_sent');
                pushToCloudwatch(publication, statusCount(statuses, 2), 'push_delivered');
                pushToCloudwatch(publication, statusCount(statuses, 4), 'push_failed');
                pushToCloudwatch(publication, statusCount(statuses, 404), 'push_404');
                pushToCloudwatch(publication, statusCount(statuses, 410), 'push_410');
                pushToCloudwatch(publication, statusCount(statuses, 5), 'push_error');
                pushToCloudwatch(publication, duration, 'push_duration');
                return responses;
            })
            .then(responses => backUp(publication, pushContent, { responses, email: userEmail, duration }))
            .catch(err => console.log(err));
        console.log(`${publication}&status=Push notification successfully sent`);
        res.sendStatus(200);
    } else {
        console.log(`${publication}&status=There was an error with the service, please try again.`);
        res.sendStatus(400);
    }
});

module.exports = router;
