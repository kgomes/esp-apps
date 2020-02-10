/*
 * This module provides some utility functions for dealing with Deployment objects
 */

// Library for path manipulations
const path = require('path');

// Import the log4js module and add the file appender        
const log4js = require('log4js');

// Create a placeholder for the logger that will depend on the directory being set
const logger = log4js.getLogger('DeploymentUtils');

// This is a method that will set the directory where the logs will be written, note the log
// directory should be an existing directory
function setLogDirectory(directory) {
    log4js.loadAppender('file');
    log4js.addAppender(log4js.appenders.file(path.join(directory, 'DeploymentUtils.log')), 'DeploymentUtils');
    logger.info('Log directory set to ' + directory);
}

// Set the level for logging purposes. Order or precedence is:
// ALL < TRACE < DEBUG < INFO < WARN < ERROR < FATAL < MARK < OFF
function setLogLevel(level) {
    logger.setLevel(level);
}

// The moment module
const moment = require('moment');

// ***********************************************************
// This function takes in two deployments and attempts to do
// an additive update only. It will not remove anything.  If
// the deployment is marked to post changes to Slack, events
// will be generated and sent to Slack to the channel 
// specified in the 'slackChannel' field
// ***********************************************************
function mergeDeployments(source, target) {
    // This is an object that contains messages of what was actually merged
    var messages = {};

    // Current timestamp
    var lastts = Number(moment().format('x'));

    // Make sure both deployment coming in exist
    if (target && source) {
        logger.debug('mergeDeployments called:');
        logger.debug('Source: ' + source['name']);
        logger.debug('Target: ' + target['name'])

        // Let's start with the slack flag
        if (source['notifySlack'] &&
            (!target['notifySlack'] ||
                source['notifySlack'] != target['notifySlack'])) {


            // Make sure timestamp is unique
            var ts = Number(moment().format('x'));
            if (ts <= lastts) ts = lastts + 1;
            lastts = ts;
            logger.debug('Setting notifySlack to ' + source['notifySlack'] + ' at ' + ts);

            // Add a message
            messages[ts] = {
                event: 'NOTIFY_SLACK_CHANGED',
                message: 'The notify slack flag changed',
                old: target['notifySlack'],
                new: source['notifySlack']
            }

            // Update the flag
            target['notifySlack'] = source['notifySlack'];
        }

        // Now check the slack channel name
        if (source['slackChannel'] &&
            (!target['slackChannel'] ||
                source['slackChannel'] != target['slackChannel'])) {

            // Make sure timestamp is unique
            var ts = Number(moment().format('x'));
            if (ts <= lastts) ts = lastts + 1;
            lastts = ts;
            logger.debug('Setting slack channel to ' + source['slackChannel'] + ' at ' + ts);

            // Add a message
            messages[ts] = {
                event: 'SLACK_CHANNEL_CHANGED',
                message: 'The slack channel was changed',
                old: target['slackChannel'],
                new: source['slackChannel']
            }

            // Make the change
            target['slackChannel'] = source['slackChannel'];
        }

        // Check to see if the deployment name is different
        if (source['name'] &&
            (!target['name'] ||
                source['name'] != target['name'])) {

            // Make sure timestamp is unique
            var ts = Number(moment().format('x'));
            if (ts <= lastts) ts = lastts + 1;
            lastts = ts;
            logger.debug('Changing name from "' +
                target['name'] + '" to "' + source['name'] + ' at ' + ts);

            // Create an event timestamp
            messages[ts] = {
                event: 'DEPLOYMENT_NAME_CHANGED',
                message: 'Deployment name was changed from "' +
                    target['name'] + '" to "' + source['name'] + '"',
                old: target['name'],
                new: source['name']
            }

            // Make the change
            target['name'] = source['name'];
        }

        // Check to see if the source has a description
        if (source['description'] &&
            (!target['description'] ||
                source['description'] != target['description'])) {

            // Make sure timestamp is unique
            var ts = Number(moment().format('x'));
            if (ts <= lastts) ts = lastts + 1;
            lastts = ts;
            logger.debug('Changing description from "' +
                target['description'] + '" to "' + source['description'] + ' at ' + ts);

            // Create an event timestamp
            messages[ts] = {
                event: 'DEPLOYMENT_DESCRIPTION_CHANGED',
                message: 'Deployment description was changed from "' +
                    target['description'] + '" to "' + source['description'] + '"',
                old: target['description'],
                new: source['description']
            }

            // Don't bother with slack on a descripton, just make the change
            target['description'] = source['description'];
        }

        // Check to see if the incoming deployment has an ESP associated with it
        if (source['esp']) {
            // Create a flag to track if anything changed
            var espChanged = false;
            var oldESP = null;
            if (target['esp']) oldESP = JSON.parse(JSON.stringify(target['esp']));
            var newESP = JSON.parse(JSON.stringify(source['esp']));

            // First check to see if there is an ESP attached to the target
            if (!target['esp']) {
                // Just assign the incoming one
                target['esp'] = source['esp'];
                espChanged = true;
            } else {
                // This means there is something on the target, so go field by field
                if (source['esp']['name'] &&
                    (!target['esp']['name'] || source['esp']['name'] != target['esp']['name'])) {
                    espChanged = true;
                    target['esp']['name'] = source['esp']['name'];
                }
                if (source['esp']['ftpHost'] &&
                    (!target['esp']['ftpHost'] || source['esp']['ftpHost'] != target['esp']['ftpHost'])) {
                    espChanged = true;
                    target['esp']['ftpHost'] = source['esp']['ftpHost'];
                }
                if (source['esp']['ftpPort'] &&
                    (!target['esp']['ftpPort'] || source['esp']['ftpPort'] != target['esp']['ftpPort'])) {
                    espChanged = true;
                    target['esp']['ftpPort'] = source['esp']['ftpPort'];
                }
                if (source['esp']['ftpUsername'] &&
                    (!target['esp']['ftpUsername'] || source['esp']['ftpUsername'] != target['esp']['ftpUsername'])) {
                    espChanged = true;
                    target['esp']['ftpUsername'] = source['esp']['ftpUsername'];
                }
                if (source['esp']['ftpPassword'] &&
                    (!target['esp']['ftpPassword'] || source['esp']['ftpPassword'] != target['esp']['ftpPassword'])) {
                    espChanged = true;
                    target['esp']['ftpPassword'] = source['esp']['ftpPassword'];
                }
                if (source['esp']['ftpWorkingDir'] &&
                    (!target['esp']['ftpWorkingDir'] || source['esp']['ftpWorkingDir'] != target['esp']['ftpWorkingDir'])) {
                    espChanged = true;
                    target['esp']['ftpWorkingDir'] = source['esp']['ftpWorkingDir'];
                }
                if (source['esp']['logFile'] &&
                    (!target['esp']['logFile'] || source['esp']['logFile'] != target['esp']['logFile'])) {
                    espChanged = true;
                    target['esp']['logFile'] = source['esp']['logFile'];
                }
                if (source['esp']['mode'] &&
                    (!target['esp']['mode'] || source['esp']['mode'] != target['esp']['mode'])) {
                    espChanged = true;
                    target['esp']['mode'] = source['esp']['mode'];
                }
            }

            // Check to see if something changed
            if (espChanged) {
                newESP = JSON.parse(JSON.stringify(target['esp']));

                // Make sure timestamp is unique
                var ts = Number(moment().format('x'));
                if (ts <= lastts) ts = lastts + 1;
                lastts = ts;
                logger.debug('ESP information was changed');
                logger.debug('Old: ');
                logger.debug(JSON.stringify(oldESP, null, 2));
                logger.debug('New: ');
                logger.debug(JSON.stringify(newESP, null, 2));

                // Create an event timestamp
                messages[ts] = {
                    event: 'ESP_CHANGED',
                    message: 'ESP Information Changed',
                    old: oldESP,
                    new: newESP
                }
            }
        }

        // Check if the source has a start date
        if (source['startDate'] && source['startDate'] != '' &&
            (!target['startDate'] || source['startDate'] != target['startDate'])) {

            // Make sure timestamp is unique
            var ts = Number(moment().format('x'));
            if (ts <= lastts) ts = lastts + 1;
            lastts = ts;
            logger.debug('Changing start date from "' +
                target['startDate'] + '" to "' + source['startDate'] + ' at ' + ts);

            // Create an event timestamp
            messages[ts] = {
                event: 'DEPLOYMENT_START_DATE_CHANGED',
                message: 'Deployment startDate was changed from "' +
                    target['startDate'] + '" to "' + source['startDate'] + '"',
                old: target['startDate'],
                new: source['startDate']
            }

            // Not really slack worthy, just update it
            target['startDate'] = source['startDate'];
        }

        // Check if the source has an end date
        if (source['endDate'] && source['endDate'] != '' &&
            (!target['endDate'] || source['endDate'] != target['endDate'])) {

            // Make sure timestamp is unique
            var ts = Number(moment().format('x'));
            if (ts <= lastts) ts = lastts + 1;
            lastts = ts;
            logger.debug('Changing end date from "' +
                target['endDate'] + '" to "' + source['endDate'] + ' at ' + ts);

            // Create an event timestamp
            messages[ts] = {
                event: 'DEPLOYMENT_END_DATE_CHANGED',
                message: 'Deployment endDate was changed from "' +
                    target['endDate'] + '" to "' + source['endDate'] + '"',
                old: target['endDate'],
                new: source['endDate']
            }

            // This could be slack worthy.  If the target end date is not
            // defined and it's now being set, the portal will stop parsing
            // the deployment so this will end log parsing
            // if (target['notifySlack'] && target['notifySlack'] == true) {
            //     // Now check to see if the target end date is not set yet
            //     if (!target['endDate'] || target['endDate'] == '') {

            //         // Start the message
            //         var text = 'Deployment "' + target['name'] + '"';
            //         // If there is an ESP attached, add the name to the message
            //         if (target['esp'] && target['esp']['name']) text += ' of ESP ' + target['esp']['name'];
            //         // Finish message
            //         text += ' was marked as ended';

            //         // Now try to parse the end date
            //         var parsedEndDate = null;
            //         try {
            //             parsedEndDate = moment(source['endDate'], 'YYYY-MM-DDTHH:mm:ssZZZ');
            //         } catch (err) {
            //             logger.warn('Could not parse end date of deployment ' + target['name']);
            //             logger.warn(err);
            //         }
            //         if (parsedEndDate) {
            //             text += ' at ' + parsedEndDate.format('YYYY-MM-DD HH:mm:ss ZZ');
            //         }
            //         text += ', it will no longer be monitored in the portal.'

            //         // Send out a message that the deployment was marked as complete
            //         this.slackQueue.push({
            //             'text': text,
            //             channel: target['slackChannel'],
            //             username: me.slackUsername
            //         });
            //     }
            // }

            // Update the target end date
            target['endDate'] = source['endDate'];
        }

        // Check to see if there are any errors associated with the source deployment
        if (source['errors'] && Object.keys(source['errors'].length > 0)) {

            // Grab all the timestamps of the incoming errors
            var errorTimestamps = Object.keys(source['errors']);

            // Loop over the errors timestamps on the source object and see if they exist on the target
            for (var i = 0; i < errorTimestamps.length; i++) {
                logger.debug('Working with error timestamp of ' + errorTimestamps[i]);

                // First, make sure there is an 'errors' object on the target
                if (!target['errors']) {
                    target['errors'] = {};
                }

                // If the timestamp from the source deployment is not in the target, add the error
                if (Object.keys(target['errors']).indexOf(errorTimestamps[i]) < 0) {

                    // Grab the error that needs to be added
                    var errorToAdd = source['errors'][errorTimestamps[i]];
                    logger.debug('Adding error');
                    logger.debug(errorToAdd);

                    messages[errorTimestamps[i]] = {
                        event: 'ERROR_OCCURRED',
                        message: 'Error occurred at ' + moment(Number(errorTimestamps[i])).format("YYYY-MM-DD HH:mm:ss Z"),
                        new: errorToAdd
                    }
        
                    // Add it
                    target['errors'][errorTimestamps[i]] = errorToAdd;

                    // Now check to see if we need to send a message to Slack
                    // if (target['notifySlack'] && target['notifySlack'] === true && target['slackChannel']) {
                    //     logger.debug('Slack message will be queued');

                    //     // Create the message
                    //     var messageToSend = {
                    //         text: "_" + moment(Number(errorTimestamps[i])).format('YYYY-MM-DD HH:mm:ss ZZ') +
                    //             "_\n*ERROR*: " + errorToAdd.subject,
                    //         channel: target['slackChannel'],
                    //         username: me.slackUsername,
                    //         attachments: [
                    //             {
                    //                 fallback: "ERROR Occurred",
                    //                 color: "danger",
                    //                 text: "Actor: " + errorToAdd.actor + "\n" +
                    //                     "Message: " + errorToAdd.message
                    //             }
                    //         ]
                    //     };
                    //     this.slackQueue.push(messageToSend);
                    // }
                }
            }
        }

        // Now, let's look at the protocol runs coming in on the source
        // if (source['protocolRuns'] && Object.keys(source['protocolRuns']).length > 0) {

        //     // Grab all the timestamps for the protocol runs
        //     var protocolRunTimestamps = Object.keys(source['protocolRuns']);

        //     // Make sure the target at least has an object to store protocol runs in
        //     if (!target['protocolRuns']) {
        //         target['protocolRuns'] = {};
        //     }

        //     // Now let's iterate over the source protocol run timestamps
        //     for (var i = 0; i < protocolRunTimestamps.length; i++) {
        //         // Check to see if the protocol run timestamp is already in the target
        //         if (Object.keys(target['protocolRuns']).indexOf(protocolRunTimestamps[i]) < 0) {
        //             // It needs to be added, so grab it from the source
        //             var protocolRunToAdd = source['protocolRuns'][protocolRunTimestamps[i]];

        //             // Add it to the target
        //             target['protocolRuns'][protocolRunTimestamps[i]] = protocolRunToAdd;

        //             // Now check slack to see if it needs to be sent out
        //             // if (target['notifySlack'] && target['notifySlack'] === true && target['slackChannel']) {
        //             //     var messageToSend = {
        //             //         text: "_" + moment(Number(protocolRunTimestamps[i])).format('YYYY-MM-DD HH:mm:ss ZZ') +
        //             //             "_\n*Protocol Run Started*: " + protocolRunToAdd['name'],
        //             //         channel: target['slackChannel'],
        //             //         username: me.slackUsername,
        //             //         attachments: [
        //             //             {
        //             //                 fallback: "Protocol Run Started",
        //             //                 color: "good",
        //             //                 text: "Actor: " + protocolRunToAdd['actor'] + "\n" +
        //             //                     "Target Volume: " + protocolRunToAdd['targetVol']
        //             //             }
        //             //         ]
        //             //     };
        //             //     // Add it to the slack queue
        //             //     me.slackQueue.push(messageToSend);
        //             // }
        //         }
        //     }
        // }

        // Now, look at samples
        // if (source['samples'] && Object.keys(source['samples']).length > 0) {

        //     // Grab all the timestamps for the samples
        //     var sampleTimestamps = Object.keys(source['samples']);

        //     // Make sure the target at least has an object to store samples in
        //     if (!target['samples']) {
        //         target['samples'] = {};
        //     }

        //     // Now let's iterate over the source sample timestamps
        //     for (var i = 0; i < sampleTimestamps.length; i++) {

        //         // Grab the sample from the source
        //         var sourceSample = source['samples'][sampleTimestamps[i]];

        //         // A flag that indicates a message should be sent
        //         var messageSlackWorthy = false;

        //         // Let's start a message in case we need to post it to slack
        //         var slackMessage = {
        //             text: "_" + moment(Number(sampleTimestamps[i])).format('YYYY-MM-DD HH:mm:ss ZZ') + '_',
        //             channel: target['slackChannel'],
        //             username: me.slackUsername,
        //             attachments: [
        //                 {
        //                     fallback: '',
        //                     color: 'good',
        //                     text: 'Actor: ' + sourceSample['actor'] +
        //                         '\nStart: ' + moment(Number(sampleTimestamps[i])).format('YYYY-MM-DD HH:mm:ss ZZ')
        //                 }
        //             ]
        //         }

        //         // If there is a end time, calculate how long it took
        //         var timeDiffInMinutes = null;
        //         if (sourceSample['endts']) {
        //             try {
        //                 timeDiffInMinutes = Math.trunc((Number(sourceSample['endts']) - Number(sampleTimestamps[i])) / 60000);
        //                 slackMessage['attachments'][0]['text'] += '\nEnd: ' + moment(Number(sourceSample['endts'])).format('YYYY-MM-DD HH:mm:ss ZZ');
        //                 slackMessage['attachments'][0]['text'] += '\nTook ' + timeDiffInMinutes + ' minutes';
        //             } catch (err) {
        //                 logger.warn('Error trying to calculate how long a sample took');
        //                 logger.warn(sourceSample);
        //                 logger.warn(err);
        //             }
        //         }

        //         // Add the target volume
        //         slackMessage['attachments'][0]['text'] += '\nTarget Volume: ' + sourceSample['targetVolume'] + ' ml';

        //         // If there is a target and actual volume, calculate the difference
        //         var volDiff = null;
        //         if (sourceSample['targetVolume'] && sourceSample['actualVolume']) {
        //             try {
        //                 volDiff = Number(sourceSample['targetVolume']) - Number(sourceSample['actualVolume']);
        //                 slackMessage['attachments'][0]['text'] += '\nActual Volume = ' + sourceSample['actualVolume'] + ' ml';
        //                 slackMessage['attachments'][0]['text'] += '\nVolume Diff = ' + volDiff + ' ml';
        //                 if (volDiff > 0) {
        //                     slackMessage['attachments'][0]['color'] = 'warning'
        //                 }
        //             } catch (err) {
        //                 logger.warn('Error caught trying to calculate difference between ' +
        //                     'target and actual volume for sample');
        //                 logger.warn(sourceSample);
        //                 logger.warn(err);
        //             }
        //         }

        //         // Check to see if the sample timestamp is already in the target
        //         if (Object.keys(target['samples']).indexOf(sampleTimestamps[i]) < 0) {

        //             // It's not there, so add it to the target
        //             target['samples'][sampleTimestamps[i]] = sourceSample;
        //             messageSlackWorthy = true;

        //             // Now the message depends on if there is an end timestamp or not.  If there is not
        //             // an end timestamp, it means it has started, but not completed
        //             if (!sourceSample['endts']) {
        //                 // Create the sample started text message
        //                 slackMessage['text'] += '\n*Sample Started*';
        //             } else {
        //                 // This means the entire sample is being added after it's completed
        //                 slackMessage['text'] += '\n*Sample Taken*';
        //             }
        //         } else {
        //             // Now check to see if the actual volume and end timestamp need to be updated
        //             if (sourceSample['endts'] && !target['samples'][sampleTimestamps[i]]['endts']) {
        //                 slackMessage['text'] += '\n*Sample Completed*';
        //                 messageSlackWorthy = true;
        //             }

        //             // Set the target fields using source values
        //             target['samples'][sampleTimestamps[i]]['actor'] = sourceSample['actor'];
        //             target['samples'][sampleTimestamps[i]]['targetVolume'] = sourceSample['targetVolume'];
        //             target['samples'][sampleTimestamps[i]]['endts'] = sourceSample['endts'];
        //             target['samples'][sampleTimestamps[i]]['actualVolume'] = sourceSample['actualVolume'];
        //         }

        //         // Check to see if slack message should be sent
        //         if (messageSlackWorthy && target['notifySlack'] && target['notifySlack'] === true && target['slackChannel']) {
        //             // Add it to the slack queue
        //             me.slackQueue.push(slackMessage);
        //         }
        //     }
        // }

        // Now let's sync the images. Check if the source has some images attached
        // if (source['images'] && Object.keys(source['images']).length > 0) {
        //     // Make sure target has a place to hang images
        //     if (!target['images']) {
        //         target['images'] = {};
        //     }

        //     // Grab all the image timestamps from the source
        //     var imageTimestamps = Object.keys(source['images']);

        //     // Loop over the timestamps
        //     for (var i = 0; i < imageTimestamps.length; i++) {
        //         // Check to see if the timestamp exists in the target and if not
        //         if (!target['images'][imageTimestamps[i]]) {
        //             // Add it
        //             target['images'][imageTimestamps[i]] = source['images'][imageTimestamps[i]];

        //             // Now check to see if a slack message needs to be sent
        //             if (target['notifySlack'] && target['notifySlack'] === true && target['slackChannel']) {
        // logger.debug("Message was an image processed event");

        // // We need to build the attachment first
        // var textToSend;
        // if (message.image.downloaded) {
        //     textToSend = "_" + humanReadableDate + "_\n*Image Taken*: " + message.image.imageFilename +
        //         " (" + message.image.exposure + "s - " + message.image.xPixels + "px X " +
        //         message.image.yPixels + "px)\n" +
        //         "<" + encodeURI(me.hostBaseUrl + message.image.imageUrl) + ">"
        // } else {
        //     textToSend = "_" + humanReadableDate + "_\n*Image Taken*: " + message.image.imageFilename +
        //         " (" + message.image.exposure + "s - " + message.image.xPixels + "px X " +
        //         message.image.yPixels + "px)"
        // }

        // // Create the message to send
        // var messageToSend = {
        //     text: textToSend,
        //     channel: channel,
        //     username: "esps"
        // };

        // // Add it to the slack queue
        // me.slackQueue.push(messageToSend);
        //             }
        //         }
        //     }
        // }

    } else {
        logger.warn('mergeDeployments called but one of the arguments was empty');
        logger.warn('Source');
        logger.warn(source);
        logger.warn('Target: ');
        logger.warn(target);
    } // End else one of the arguments was empty

    // Return the messages
    return messages;
}

module.exports = {
    setLogDirectory: setLogDirectory,
    setLogLevel: setLogLevel,
    mergeDeployments: mergeDeployments
}