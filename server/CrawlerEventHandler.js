// Set up required libraries
var path = require('path');
var moment = require('moment');
var Slack = require('node-slackr');

// Configure logging
var log4js = require('log4js');
log4js.loadAppender('file');

// Grab the logger
var logger = log4js.getLogger('CrawlerEventHandler');

// The host base URL
var hostBaseUrl;

// The slack connection
var slack;

// The constructor
function CrawlerEventHandler(deploymentFileSync, logParser, baseDir, opts, logDir) {
    logger.info("CrawlerEventHandler will use base directory located at " + baseDir);
    logger.info("Creating CrawlerEventHandler with logger level " + opts.loggerLevel);

    // Check for logging level
    if (opts.loggerLevel) {
        logger.setLevel(opts.loggerLevel);
    }

    // And set the log directory
    log4js.addAppender(log4js.appenders.file(logDir + '/CrawlerEventHandler.log'), 'CrawlerEventHandler');

    if (opts.hostBaseUrl) {
        this.hostBaseUrl = opts.hostBaseUrl;
    }
    // Check to see if the Slack WebHook URL was specified
    if (opts.slackWebHookURL) {
        logger.info("Crawler will send message to Slack at URL " + opts.slackWebHookURL);
        this.slack = new Slack(opts.slackWebHookURL);
    }

    // Grab a handle to this object for scope management
    var me = this;

    // Assign the ftp synchronization client locally
    this.deploymentFileSync = deploymentFileSync;

    // Assign the logParser
    this.logParser = logParser;

    // Assign the local base directory where all data should be
    this.baseDir = baseDir;

    // Create an array that will act as a queue for slack messages so we can make sure we don't send messages
    // too fast
    this.slackQueue = [];

    // ****************************************************************
    // This sets up the various handlers on the FTP synchronizer and the
    // socket.io client<->server interactions
    // ****************************************************************
    this.setupHandlers = function () {
        logger.debug("Setting up event handlers");

        // This event happens when the FTP crawler downloads or updates a file local
        // on this server
        this.deploymentFileSync.on('ftpFileUpdated', this.handleFTPFileUpdated);

        // Register the event handler to process events from the LogParser
        this.logParser.on('parseEvent', this.handleLogParserEvents);
    }

    // *************************************************************************
    // This is the function to handle the event when a file was updated locally
    // from an FTP server
    // *************************************************************************
    this.handleFTPFileUpdated = function (message) {
        logger.debug('FTP client updated the local file: ', message.file);

        // Make sure we have a deployment
        if (message.deployment) {
            // Make sure it has an esp
            if (message.deployment.esp) {
                // Make sure it has a log file listed
                if (message.deployment.esp.logFile) {
                    // Make sure the incoming event has a local file listed
                    if (message.file) {

                        // Now build the location of where the deployment's log file should be locally
                        var localLogFile = me.baseDir + path.sep + 'instances' + path.sep +
                            message.deployment.esp.name + path.sep + 'deployments' + path.sep + message.deployment.name +
                            path.sep + 'data' + path.sep + 'raw' + path.sep + message.deployment.esp.logFile;
                        logger.debug('Deployment says log file should be located at ' + localLogFile);

                        // Now match against what came in
                        if (localLogFile === message.file) {
                            logger.info('Local log file ' + localLogFile + ' was updated and needs parsing');
                            me.logParser.parseLogFile(message.deployment, message.file, message.stats, function (err) {
                                if (err)
                                    logger.error("Error returned submitting a log file for parsing:", err);
                            });
                        }
                    }
                }
            }
        }
    };

    // *************************************************************************
    // This is the function to handle the event when a file was updated locally
    // from an FTP server
    // *************************************************************************
    this.handleLogParserEvents = function (message) {
        logger.debug("Got log parsing event", message);

        // Make sure there is a message first
        if (message) {
            // Now check to see if the message is even supposed to be published to Slack
            if (message.notifySlack) {
                // Grab the channel from themessage
                var channel = message.slackChannel;
                logger.debug("Will publish to slack channel " + channel);

                // Format the timestamp
                var humanReadableDate;
                if (message.timestampUTC) {
                    humanReadableDate = moment(message.timestampUTC).format('YYYY-MM-DD HH:mm:ss ZZ');
                }

                // Check to see if the type of event is an error
                if (message.type == "error") {
                    logger.debug("Parsed event was an error");

                    // Check to see if the Slack WebHook was defined
                    if (me.slack && message.error && message.source) {

                        // Create the message to send
                        var messageToSend = {
                            text: "_" + humanReadableDate + "_\n*ERROR*: " + message.error.subject,
                            channel: channel,
                            username: "esps",
                            attachments: [
                                {
                                    fallback: "ERROR Occurred",
                                    color: "danger",
                                    text: "Actor: " + message.error.actor + "\n" +
                                    "Message: " + message.error.message
                                }
                            ]
                        };

                    }

                    // Add it to the slack queue
                    me.slackQueue.push(messageToSend);
                } else if (message.type == 'imageProcessed') {
                    logger.debug("Message was an image processed event");

                    // We need to build the attachment first
                    var textToSend;
                    if (message.image.downloaded) {
                        textToSend = "_" + humanReadableDate + "_\n*Image Taken*: " + message.image.imageFilename +
                            " (" + message.image.exposure + "s - " + message.image.xPixels + "px X " +
                            message.image.yPixels + "px)\n" +
                            "<" + encodeURI(me.hostBaseUrl + message.image.imageUrl) + ">"
                    } else {
                        textToSend = "_" + humanReadableDate + "_\n*Image Taken*: " + message.image.imageFilename +
                            " (" + message.image.exposure + "s - " + message.image.xPixels + "px X " +
                            message.image.yPixels + "px)"
                    }

                    // Create the message to send
                    var messageToSend = {
                        text: textToSend,
                        channel: channel,
                        username: "esps"
                    };

                    // Add it to the slack queue
                    me.slackQueue.push(messageToSend);
                } else if (message.type == 'protocolRunStarted') {
                    logger.debug("Message was a protocol run started");

                    // Create the message to send
                    var messageToSend = {
                        text: "_" + humanReadableDate + "_\n*Protocol Run Started*: " + message.protocolRun.name,
                        channel: channel,
                        username: "esps",
                        attachments: [
                            {
                                fallback: "Protocol Run Started",
                                color: "good",
                                text: "Actor: " + message.protocolRun.actor + "\n" +
                                "Target Volume: " + message.protocolRun.targetVol
                            }
                        ]
                    };
                    // Add it to the slack queue
                    me.slackQueue.push(messageToSend);
                } else if (message.type == 'sampleStarted') {
                    logger.debug("Message was a sample started");

                    // Create the message to send
                    var messageToSend = {
                        text: "_" + humanReadableDate + "_\n*Sample Started*",
                        channel: channel,
                        username: "esps",
                        attachments: [
                            {
                                fallback: "Sample Started",
                                color: "good",
                                text: "Actor: " + message.sample.actor + "\n" +
                                "Target Volume: " + message.sample.targetVolume
                            }
                        ]
                    };
                    // Add it to the slack queue
                    me.slackQueue.push(messageToSend);
                } else if (message.type == 'sampleCompleted') {
                    logger.debug("Message was sample completed");

                    // See if we can calculate the sample difference
                    var volDiff;
                    if (message.sample.targetVolume && message.sample.actualVolume) {
                        volDiff = message.sample.targetVolume - message.sample.actualVolume;
                    }

                    // The color of the message
                    var colorOfAttachment = 'good';
                    if (volDiff && volDiff !== 0) {
                        colorOfAttachment = 'warning';
                    }
                    // Create the message to send
                    var messageToSend = {
                        text: "_" + humanReadableDate + "_\n*Sample Completed*",
                        channel: channel,
                        username: "esps",
                        attachments: [
                            {
                                fallback: "Sample Completed",
                                color: colorOfAttachment,
                                text: "Actor: " + message.sample.actor + "\n" +
                                "Target Volume: " + message.sample.targetVolume + "\n" +
                                "Actual Volume: " + message.sample.actualVolume + "\n" +
                                "Volume Diff: " + volDiff
                            }
                        ]
                    };

                    // Add it to the slack queue
                    me.slackQueue.push(messageToSend);
                }

            } else {
                logger.debug("Not going to send to Slack");
            }
        }
    };

    // Now set up a time to send any messages from the slack queue every 5 seconds
    setInterval(function () {
        // Check to see if there is a message in the slack queue
        if (me.slackQueue.length > 0) {
            // Pop the next message
            var messageToSend = me.slackQueue.shift();
            logger.debug("Will send message to slack", messageToSend);

            // Send the message
            me.slack.notify(messageToSend, function (err, result) {
                if (err) {
                    logger.error("Error trying to send to slack: ", err);
                } else {
                    logger.debug("Send to slack looks OK", result);
                }
            });
        }

    }, 1000 * 5);
}

// Export the factory method
exports.createCrawlerEventHandler = function (ftpSync, dataAccess, logParser, baseDir, opts, logDir) {
    // Create the new EventHandler
    var newEventHandler = new CrawlerEventHandler(ftpSync, dataAccess, logParser, baseDir, opts, logDir);

    // Now setup the event handlers for both
    newEventHandler.setupHandlers();

    // Now return it
    return newEventHandler;
}