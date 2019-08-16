# Web Push Notifications Back End

This is the repository of the back end for web push notifications. This consists of an express app used to receive incoming subscriptions and send notifications. The URLs used to send the notifications are:

CI (bertha): http://web-push-service-bertha.tm-dev-aws.com

Staging (stable): http://web-push-service-stable.tm-dev-aws.com

Production: http://web-push-service.tm-awx.com

Using these will require a trinitymirror/reach google account to log in with.

*Disclaimer*: Throughout this document and in the code, `publication` refers to the specific PWA channel that users are subscribing to and we're sending push notifications from.

## Local Development

Use the `npm run dev` command to get the service started on your local machine (port can be configured by changing the port property in the config but it defaults to 3000 for all environments). The default environment for this is bertha but can be changed to stable (by changing the NODE_ENV variable in the "dev" script in `package.json`). The value for environment determines which config is used which decides which Google API settings, Redis instance, Google Sheet (for permissions, see below) and Dynamo Tables are used.

## Deployment

The testing environment reflects the "bertha" branch. The environment will be rebuilt on any pushed merge and commit.

To deploy to the production environment, any change must be merged to master and pushed to drone. Once the drone build is finished, it can be deployed to production using the cli:

`drone deploy trinitymirror-ondemand/web-push-service <build-number> production`

## Data

Subscriber counts for push notifications are logged in aws cloudwatch every minute. This can be viewed in cloudwatch or on the following grafana dashboard:
https://grafana.tm-aws.com/d/-m_bbNsmk/web-push-subscriber-counts

Each notification is saved on dynamodb and can be viewed by clicking on "View Sent Notifications" on a publication's respective page. Each notification has its responses' status codes counted and saved. These can be viewed by clicking on "info" for the given push notification.

## Architecture Overview

![Architecture Graph](graph.png)

### Subscribing (Front End)
On the front end, the browser's API is used to prompt the user to subscribe. Once user confirms subscription, this selection is saved on browser. Chameleon holds the public VAPID key for this subscription service in the publication's manifest.json, which allows push notifications sent with the private VAPID key (used in the back end) to be received.

### Receiving Subscription (Back End)
When user subscribes, a push subscription config is generated which outlines information on the browser/user that wants to receive push notifications. This is sent to the web push back end using a post request to the path "/signUp". The subscription config is then saved both on a redis instance and a dynamoDB. All subscription configs go to the same dynamoDB and redis, but are sorted by publication. DynamoDB is used for long term storage, while redis is used for quick inexpensive reads.

### Sending Notifications (Back End)
To send a push notification, a web portal can be accessed to communicate with the back end. This is located on the "/" path of the express app, which is protected with google authentication. On the web portal, the headline and redirect URL can be specified for each notification. Once a push notification is submitted, the back end does a scan for every subscription config for the given publication in redis and a notification is sent to each of these, using google firebase cloud messaging as middleware. The response for each of these is checked and if the status code is 410, the given subscription is removed from redis and dynamodb (seeing as it is no longer valid). Regardless of the response, each status code is counted and saved within a dynamodb table holding each sent push notification. Info on these can be viewed on the web portal.

### Sending Notifications (Back End) - Permissions 
Only allowed users can send notifications. These can either be for a particular publication or for a group of publications. The source of truth for this is a set of Google Sheets (one per environment) which have the names of the groups / publications as columns (links below). If a publication is a part of a group, it will have the `group` property in its constituent object in the `publications` array.

### Receiving Notifications (Front End)
The notification is received on the browser, which triggers a ‘push’ event.  This event is picked up by the service worker, which determines the push notification’s looks and behaviour. The configuration for this (ie. notification icon) are stored in the manifest.json for each respective publication. If the browser is not running, the notification will be received next time it is opened

## Configuring a new publication 

When the product team requests a new publication, do the following: 

* Make the appropriate change on Chameleon: See: https://docs.google.com/document/d/1EEjFfcQGnQSCrdQqMG563_phpk65lOM6TbDTkiKaSRI for more details.
* Add the publication's URL, host and name to the `publications` array in config files for all environments in `config/`. Be mindful that this will have a different domain for the test environments (bertha, stable).
* Add a new metric for it on Grafana so that it can be viewed. To do this, simply clone an existing one, and edit the new one so that the metric source is: default - WebPush - "publication-url"_user_count
* Add it to the Push Notification Access Google Sheets for all environments:
  * If it is part of an existing publication (by this we mean actual publication and not channel so Mirror, Chronicle Live, etc) in the sheet, add a new column under it. If not, make a new header column for the publication and put the channel name underneath it - similar to the way its done for the others.
  * Starting with Bertha, duplicate one of the subsheets and rename it to EXACTLY what the channel name is. This will have the environment in brackets after. This needs to match the `name` that you've added to the new object in `publications` array. As this is configured as a pivot table, make sure the column name is the same as the publication name in the Filter section of the Pivot table editor. Now add a name to the Master sheet and put an 'x' infront of it for this new column. Now check the subsheet - the expected behaviour is that the name shows up there. 
  
  
## Google Sheet URLs
* Bertha: https://docs.google.com/spreadsheets/d/13CM_xLY4okyz8oPM36dlhTTOEtKgm-W98Dac0AxQlO8/edit#gid=1667351316
* Stable: https://docs.google.com/spreadsheets/d/1XExhyu3CtSN_278pHRgiydLAp2RmD1zmhqp5hGxzghY/edit#gid=0
* Prod:  https://docs.google.com/spreadsheets/d/11NQ3Cskrmkgba1LYQb8Qpre4nOmyMxSuLkAvUmKHLRk/edit?ts=5cc32679#gid=0

