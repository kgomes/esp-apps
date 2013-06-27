// Read in the ESP application configuration
var espCfg = require('./cfg/esp_cfg.json');

// Grab the dependencies
var util = require('util');
var fs = require('fs');
var path = require('path');
var lazy = require('lazy');
var moment = require('moment');
var eventEmitter = require('events').EventEmitter;
var timezoneLookup = require('./timezones.json');
var ancillaryLookup = require('./cfg/ancillary_variables.json');

// Import logging library
var log4js = require('log4js');

// Set up a file appender
log4js.loadAppender('file');
log4js.addAppender(log4js.appenders.file('logs/logParser.log'), 'logParser');

// Grab the logger
var logger = log4js.getLogger('logParser');

// Set a default logging level of info
logger.setLevel(espCfg["logger_levels"]["logParser"]);

// Some regular expression patterns
var timestampPattern1 = new RegExp(/^@(\D+)(\d+\.\d+)/);
var timestampPattern2 = new RegExp(/^@(\d+\.\d+)(\D+)/);
var errorPattern = new RegExp(/BadNews.\S+\s+"(.*)",:Subject=>"(.*)"/);
var ancillaryPattern = new RegExp(/^Can@.*/);
var ancillarySplitPattern = new RegExp(/^(\S+)@(\d{2}):(\d{2}):(\d{2}),(.*)$/);
var ancillaryDataPattern = new RegExp(/^(-*\d+\.*\d*)(.*)$/);
var processRunStartPattern = new RegExp(/^(\S+) sampling at most (\d+\.*\d*)ml(.*)/);
var dwsmSampleStartPattern = new RegExp(/^Sample Bag inhaling\s+(\d+\.*\d*)ml.*$/);
var dwsmSampleEndPattern = new RegExp(/^Waiting up to (\d+)s for Sample Bag to stabilize.*$/);
var sampleStartPattern = new RegExp(/^Sampling\s+(\d+\.*\d*)ml.*$/);
var sampleStopPattern = new RegExp(/^Sampled\s+(\d+\.*\d*)ml.*$/);
var imagePattern = new RegExp(/Exposing\s+(\d+)x(\d+)\s+pixel\s+(\d+)-bit\s+image\s+for\s+(\d+\.*\d+)\s+seconds\\(.*\/)([a-zA-Z0-9]+\.tif)/);

// An object that holds the current list of log files (that point to an associated deployment)
// that still need to ge parsed
var logFileParseQueue = {};

// This is a pointer to the log file that is being parsed
var logFileCurrentlyParsing = null;

// The temporary directory from the configuration
var tempDirectory = espCfg.espTempDir;

// Export the constructor function
exports.logParser = logParser;

// Inherit event emitter functionality
util.inherits(logParser, eventEmitter);

// The constructor function
function logParser(logLevel, dataAccess) {
    // Set the log level if specified
    if (logLevel) {
        this.logLevel = logLevel;
        logger.setLevel(this.logLevel);
    }
    logger.info("Creating logParser");

    // Grab the dataAccess object
    this.dataAccess = dataAccess;

    // Set the default number of ticks per second
    this.numberOfTicksPerSecond = 100;

    // Create the legend for tracking actors
    this.legend = {};

    // The current actor that is writing log entries
    this.currentActor = null;

    // The timezone that the ESP is operating in
    this.timezoneOffset = null;

    // This is the numeric timezone offset
    this.timezoneOffsetHours = null;
}

// This is the function called to submit a log file for parsing.  I use the 'submit' idea to
// enforce the serial processing of log files.  It seems too much (for now anyway) to try and
// let asynchronous parallel processing of these files happen.
logParser.prototype.submitLogFileForParsing = function (deployment, logFile, callback) {
    logger.debug("submitLogFileForParsing called with deployment " + deployment.name +
        " of esp " + deployment.esp.name + " and log file " + logFile);

    // Grab reference to instance
    var self = this;

    // Check the parameters first
    if (!deployment || !logFile) {
        logger.warn("Either deployment or logFile was not specified, will return error");
        if (callback)
            callback(new Error("Either deployment or logFile was not specified"));
        return;
    } else {
        // Check to see if the logFile is already in the queue, if not, add it
        if (!logFileParseQueue[logFile]) {
            logger.debug(deployment.esp.name + ":" + deployment.name + ":" + logFile +
                " needs parsing, adding to queue.");
            logFileParseQueue[logFile] = [deployment, logFile, callback];

            // Call the method to process log files
            processLogFileOffQueue();
        } else {
            logger.debug(deployment.esp.name + ":" + deployment.name + ":" + logFile +
                " is already queued for parsing, will ignore this call");
        }
    }

    // This is the function to check and see if there it something processing now
    // and if there is is not, and things are queued up, it starts processing a log file
    function processLogFileOffQueue() {
        logger.debug("processLogFileOffQueue called");
        // First check to see if a log file is being processed
        if (!logFileCurrentlyParsing) {

            // Check to see if there are any log files left to process
            if (Object.keys(logFileParseQueue).length > 0) {

                // Just grab the first logFile from the queue object
                logFileCurrentlyParsing = logFileParseQueue[Object.keys(logFileParseQueue)[0]];

                // Pull out the necessary pieces
                var parsingDeployment = logFileCurrentlyParsing[0];
                var parsingLogFile = logFileCurrentlyParsing[1];

                // Remove it from the queue
                delete logFileParseQueue[parsingLogFile];
                logger.debug("Starting the parse of log file " + parsingLogFile +
                    " for deployment " + parsingDeployment.name + " of ESP " + parsingDeployment.esp.name);

                // Now the first thing to do is create a temporary file
                createTempFile(parsingLogFile, function (err, tempFile) {
                    // Check for any errors first
                    if (err) {
                        // And now clean up and bail out
                        cleanUpAfterParsing(err, parsingDeployment, tempFile);
                        return;
                    } else {
                        // OK, temp file successfully created
                        logger.debug("Will parse temporary file " + tempFile);

                        // Call the method to parse the log file, which will return an updated deployment
                        // and an array of ancillary data that was found in the log file.
                        parseLogFile(parsingDeployment, parsingLogFile, function (err, updatedDeployment, ancillaryDataArray) {
                            // Check for an error
                            if (err) {
                                // Send the error to the callback and bail out
                                cleanUpAfterParsing(err, parsingDeployment, tempFile);
                                return;
                            } else {
                                // Things seem to have processed properly, so update the
                                // deployment information in database
                                self.dataAccess.persistDeployment(updatedDeployment, function (err, persistedDeployment) {
                                    // Check for errors
                                    if (err) {
                                        // Send the error to the callback and bail out
                                        cleanUpAfterParsing(err, parsingDeployment, tempFile);
                                        return;
                                    } else {
                                        // Now persist ancillary data if there is any
                                        if (ancillaryDataArray.length > 0) {
                                            logger.debug("There are " + ancillaryDataArray.length + " ancillary records to write to the DB");
                                            self.dataAccess.insertAncillaryDataArray(persistedDeployment, ancillaryDataArray,
                                                function (err, updatedDeployment) {
                                                    logger.debug("Got callback from insertAncillaryDataArray");
                                                    if (err) {
                                                        logger.error("Something went wrong inserting the ancillary data in the DB");
                                                        logger.error(err);
                                                    }
                                                    // Send the error to the callback and bail out
                                                    cleanUpAfterParsing(err, parsingDeployment, tempFile);
                                                    return;
                                                });
                                        } else {
                                            cleanUpAfterParsing(err, parsingDeployment, tempFile);
                                            return;
                                        }
                                    }
                                });

                            }
                        });
                    }
                });
            } else {
                logger.debug("No log files left to parse, will ignore the call");
            }
        } else {
            logger.debug("Currently processing log file " + logFileCurrentlyParsing[1] +
                ", call will be ignored");
        }
    }

    // This function creates a copy of a file to the temporary directory
    function createTempFile(logFile, callback) {
        // The temporary log file
        logger.debug("createTempFile called with log file " + logFile);

        // Verify the file exists first
        if (fs.existsSync(logFile)) {
            // The temporary log file
            var tempLogFile = tempDirectory + path.sep + "esp_log_file_" + (new Date()).getTime();
            logger.debug("TempFile " + tempLogFile + " will be created");

            // Create a read stream
            var readStream = fs.createReadStream(logFile);

            // Create the write stream
            var writeStream = fs.createWriteStream(tempLogFile);

            // An event handler when the read is complete
            readStream.on('end', function (err) {
                // Close the write stream
                writeStream.end();

                // Call the method and return the temp file
                if (callback)
                    callback(null, tempLogFile);
            });

            // Handle any errors on read
            readStream.on('error', function (err) {
                // Call the callback and send the error
                if (callback)
                    callback(err);
            });

            // Handle errors on write
            writeStream.on('error', function (err) {
                // Call the callback and send the error
                if (callback)
                    callback(err);
            });

            // Now pipe the read stream to write stream
            readStream.pipe(writeStream);
        } else {
            logger.debug("The log file " + logFile + " does not exist.");
            callback(new Error("The log file " + logFile + " does not exist."));
        }
    }

    // This is the method that will run through the log file, line by line and extract
    // the information into properties on the deployment and a new array of any ancillary
    // data that needs to be inserted.
    function parseLogFile(deployment, logFile, callback) {
        // Set the line number to 0
        var lineNumber = 0;

        // A variable to keep track of the timestamp
        var timestampUTC = null;

        // A variable that can be used to multiple Buffer objects for log
        // entries that span more than one line
        var lineSegments = [];

        // Create an array to store all the ancillary data to write to the DB
        var ancillaryDataStorageArray = [];

        // Create the read stream
        var fileReadStream = fs.createReadStream(logFile);

        // Create the processed data location
        var processedDataLocation = espCfg.espdir + path.sep + "instances" + path.sep + deployment.esp.name +
            path.sep + "deployments" + path.sep + deployment.name + path.sep + "data" + path.sep + "processed";
        logger.debug("Processed data for the deployment will go in " + processedDataLocation);

        // Add handler when the stream read end of file
        fileReadStream.on('end', function () {

            // Log out end of file read
            logger.debug("Completed reading of file " + logFile);

            // Return the updated deployment and ancillary data array to the callback
            callback(null, deployment, ancillaryDataStorageArray);

        });

        // Now loop over the lines in the log file
        new lazy(fileReadStream)
            .lines
            .forEach(function (line) {

                // Bump Line Number
                lineNumber++;

                // Look for a line continuation character
                if (line[line.length - 1] !== 92) {
                    // Push it on the stack
                    lineSegments.push(line);

                    // Concatenate the line segment and process the log entry
                    var tempTimestampUTC = processLogEntry(lineNumber, Buffer.concat(lineSegments),
                        timestampUTC, deployment, ancillaryDataStorageArray, processedDataLocation);

                    // If a timestamp was returned, update the last known timestamp
                    if (tempTimestampUTC) {

                        // Set the timestamp to the one that was parsed
                        timestampUTC = tempTimestampUTC;

                        // Make sure we are keeping track of the last line that we parsed from the log file
                        if (!deployment.last_line_parse_from_log_file ||
                            deployment.last_line_parse_from_log_file < lineNumber) {
                            deployment.last_line_parse_from_log_file = lineNumber;
                        }

                        // Just log if the time seems to go backwards
                        if (timestampUTC && tempTimestampUTC.diff(timestampUTC) < 0) {
                            logger.warn("TIME WENT BACKWARDS!!!!");
                            logger.warn("Line " + lineNumber + "->" + line);
                            logger.warn("OLD:" + timestampUTC.format());
                            logger.warn("NEW:" + tempTimestampUTC.format());
                        }
                    }

                    // Clear the line segment array
                    lineSegments = [];
                } else {
                    // Push the segment on the stack, but remove the line continuation
                    lineSegments.push(line.slice(0, line.length));
                }
            }
        );
    }


    // This is the function that will process a line from the log file and return a timestamp
    function processLogEntry(lineNumber, completeLineBuffer, lastTimestampUTC, deployment, ancillaryDataStorageArray, processedDataLocation) {

        //logger.trace("Line " + lineNumber + "->" + completeLineBuffer.toString());

        // Look for the timestamp indicator '@' (decimal 64) in the first byte
        if (completeLineBuffer[0] === 64) {
            logger.trace("Line " + lineNumber + "->" + completeLineBuffer.toString());
            logger.trace("  Timestamp Pattern match");
            // Try to match on the first timestamp pattern
            var ts1Matches = completeLineBuffer.toString().match(timestampPattern1);
            if (ts1Matches && ts1Matches.length > 0) {
                logger.trace("  Pattern 1 match");

                // Try to lookup the offset using the timezone abbreviation
                if (timezoneLookup[ts1Matches[1]]) {
                    self.timezoneOffset = timezoneLookup[ts1Matches[1]].stringRep;
                    self.timezoneOffsetHours = timezoneLookup[ts1Matches[1]].hourOffset;
                    logger.trace("  Zone Offset Parsed: " + self.timezoneOffset);
                    logger.trace("  Zone hours parse: " + self.timezoneOffsetHours);
                } else {
                    logger.warn("There was no timezone in the lookup table matching: " + ts2Matches[1]);
                }

                // Create the date in the local timezone of the server
                var entryDateServer = moment.unix(ts1Matches[2]);
                logger.trace("  Log timestamp in server zone: " + entryDateServer.format());

                // Convert that time to UTC
                var entryDateUTC = null;
                if (self.timezoneOffset) {
                    // First step is to convert to UTC
                    entryDateUTC = moment.utc(entryDateServer.format("YYYY-MM-DD HH:mm:ss") + self.timezoneOffset);
                    logger.trace("  After UTC Convert: " + entryDateUTC.format());
                }

                // Return the date in utc
                return entryDateUTC;
            } else {
                // Try the second timestamp pattern
                var ts2Matches = completeLineBuffer.toString().match(timestampPattern2);
                if (ts2Matches && ts2Matches.length > 0) {
                    logger.trace("  Pattern 2 match");

                    // Try to lookup the offset using the timezone abbreviation
                    if (timezoneLookup[ts2Matches[2]]) {
                        self.timezoneOffset = timezoneLookup[ts2Matches[2]].stringRep;
                        self.timezoneOffsetHours = timezoneLookup[ts2Matches[2]].hourOffset;
                        logger.trace("  Zone Offset Parsed: " + self.timezoneOffset);
                        logger.trace("  Zone hours parse: " + self.timezoneOffsetHours);
                    } else {
                        logger.warn("There was no timezone in the lookup table matching: " + ts2Matches[2]);
                    }

                    // Create the date in the local timezone of the server
                    var entryDateServer = moment.unix(ts2Matches[1]);
                    logger.trace("  Log timestamp in server zone: " + entryDateServer.format());

                    // Convert to UTC
                    var entryDateUTC = null;
                    if (self.timezoneOffset) {
                        // First step is to convert to UTC
                        entryDateUTC = moment.utc(entryDateServer.format("YYYY-MM-DD HH:mm:ss") + self.timezoneOffset);
                        logger.trace("  After UTC Convert: " + entryDateUTC.format());
                    }

                    // Return the date in local format
                    return entryDateUTC;
                }
            }
        } else if (completeLineBuffer[0] === 43) {
            logger.trace("Line " + lineNumber + "->" + completeLineBuffer.toString());
            logger.trace("  Time mark matched");
            // This means we found a time increment, so grab the number of ticks
            var numberOfTicks = 1;
            if (completeLineBuffer.slice(1) && completeLineBuffer.slice(1).length > 0) {
                numberOfTicks = parseInt(completeLineBuffer.slice(1));
            }
            logger.trace("  Num ticks: " + numberOfTicks);

            // OK, now with # of ticks, calculate the seconds to add to the last timestamp
            var seconds = parseInt(numberOfTicks / self.numberOfTicksPerSecond);
            var millis = parseInt((numberOfTicks / self.numberOfTicksPerSecond - seconds) * 1000);
            logger.trace("  Will add " + seconds + " seconds and " + millis + " milliseconds");
            var newTimestampUTC = lastTimestampUTC.add('s', seconds);
            newTimestampUTC = newTimestampUTC.add('ms', millis);
            logger.trace("  New timestamp UTC: " + newTimestampUTC.format());

            // Return it
            return newTimestampUTC;
        } else if (completeLineBuffer[0] === 61) {
            logger.trace("Line " + lineNumber + "->" + completeLineBuffer.toString());
            logger.trace("Found a legend entry");
            logger.trace(completeLineBuffer.toString());
            // If it is just an legend type byte, the legend should be cleared
            if (completeLineBuffer.length === 1) {
                self.legend = {};
                logger.trace("Cleared the legend at timestamp " + lastTimestampUTC.format());
            } else if (completeLineBuffer.length === 2) {
                logger.trace("Moniker but no actor, will remove " + String.fromCharCode(completeLineBuffer[1]));
                delete self.legend[String.fromCharCode(completeLineBuffer[1])];
            } else {
                self.legend[String.fromCharCode(completeLineBuffer[1])] = completeLineBuffer.slice(2).toString();
                logger.trace(self.legend);
            }
        } else {

            // If the entry is before the last line already parsed, skip processing it
            if (lineNumber > deployment.last_line_parse_from_log_file) {

                // Check to see what type of log entry it is based on the first byte
                var bodyIndex = 0;
                if (completeLineBuffer[0] === 33) {
                    bodyIndex = findActor(completeLineBuffer.slice(1));
                } else if (completeLineBuffer[0] === 35) {
                    bodyIndex = findActor(completeLineBuffer.slice(1));
                } else if (completeLineBuffer[0] === 126) {
                    bodyIndex = findActor(completeLineBuffer.slice(1));
                } else if (completeLineBuffer[0] === 96) {
                    bodyIndex = findActor(completeLineBuffer.slice(1));
                } else if (completeLineBuffer[0] === 46) {
                    bodyIndex = findActor(completeLineBuffer.slice(1));
                } else {
                    bodyIndex = findActor(completeLineBuffer);
                }
                // Grab the body of the message buffer
                var bodyBuffer = completeLineBuffer.slice(bodyIndex + 1);

                // Check to see if the body start with a \, if so skip it
                if (bodyBuffer[0] === 92) bodyBuffer = bodyBuffer.slice(1);

                // Do pattern matching for all possibilities
                var errorMatches = bodyBuffer.toString().match(errorPattern);
                var ancillaryMatches = bodyBuffer.toString().match(ancillaryPattern);
                var processRunStartMatches = bodyBuffer.toString().match(processRunStartPattern);
                var dwsmSampleStartMatches = bodyBuffer.toString().match(dwsmSampleStartPattern);
                var dwsmSampleEndMatches = bodyBuffer.toString().match(dwsmSampleEndPattern);
                var sampleStartMatches = bodyBuffer.toString().match(sampleStartPattern);
                var sampleEndMatches = bodyBuffer.toString().match(sampleStopPattern);
                var imageMatches = bodyBuffer.toString().match(imagePattern);

                // Now handle the various entry types, starting with errors
                if (errorMatches && errorMatches.length > 0) {
                    logger.trace("Line " + lineNumber + "->" + completeLineBuffer.toString());
                    logger.trace("Error found.");
                    // Quick check to make sure there is an error object
                    if (!deployment.errors) deployment.errors = {};

                    // Check to see if the error was already entered at this time
                    if (!deployment.errors[lastTimestampUTC.valueOf()]) {
                        // Add the error
                        deployment.errors[lastTimestampUTC.valueOf()] = {
                            actor: self.currentActor,
                            subject: errorMatches[2],
                            message: errorMatches[1]
                        };
                    }
                } else if (ancillaryMatches && ancillaryMatches.length > 0) {
                    // TODO figure out how we are going to write to a file for downloading (or pull from URL)

                    // We are dealing with ancillary data and they are often over multiple
                    // lines so split each instrument by line continuation character
                    var entries = bodyBuffer.toString().split("\\");
                    for (var i = 0; i < entries.length; i++) {

                        // Make sure the deployment has the appropriate ancillary sources attached
                        addAncillarySourcesToDeployment(deployment, entries[i]);

                        // Split the source, hours, minutes and seconds from the data
                        var ancillarySplitMatches = entries[i].match(ancillarySplitPattern);
                        if (ancillarySplitMatches && ancillarySplitMatches.length > 0) {
                            logger.trace("Line " + lineNumber + "->" + completeLineBuffer.toString());
                            // Grab the source
                            var source_name = ancillarySplitMatches[1];

                            // Grab the hours minutes and seconds from the ancillary record
                            // NOTE THESE ARE IN THE TIMEZONE OF THE ESP, NOT UTC
                            //var ancHour = ancillarySplitMatches[2];
                            //var ancMinute = ancillarySplitMatches[3];
                            //var ancSecond = ancillarySplitMatches[4];

                            // This is the timestamp to use for logging data
                            //var momentToUseInLog = moment(lastTimestampUTC);

                            // Copy the log time stamp (ancMoment is in UTC)
                            //var ancMoment = moment(lastTimestampUTC);

                            // Grab a copy of the hour
                            //var utcAncHour = ancHour;

                            // Now we have to handle timezone offsets
                            // First check to see if the timezone offset if specified (numerically)
                            /*if (self.timezoneOffsetHours !== 0) {

                                // Now simply subtract the offset
                                utcAncHour -= self.timezoneOffsetHours;

                                // That will give us a number that can negative or greater than 24, first
                                // let's handle the case where the hours went over 24
                                if (utcAncHour > 23) {
                                    // Subtract 24
                                    utcAncHour -= 24;
                                } else if (utcAncHour < 0) {
                                    // Add 24
                                    utcAncHour += 24;
                                }
                            }*/
                            // Set the ancillary log entry time
                            //ancMoment.hour(utcAncHour);
                            //ancMoment.minute(ancMinute);
                            //ancMoment.second(ancSecond);

                            // If the ancillary timestamp is ahead of the log timestamp, don't use it as the
                            // ESP clock should be more accurate
                            /*
                            if ((ancMoment.unix() - lastTimestampUTC.unix()) > 0) {
                                logger.debug("Ancillary timestamp is " + (ancMoment.unix() - lastTimestampUTC.unix()) +
                                    " seconds ahead of the log timestamp, will not use it");
                            } else {
                                momentToUseInLog = ancMoment;
                            }*/


                            // Grab all the variables
                            var data = ancillarySplitMatches[5];

                            // Split the data on commas and iterate over each data item
                            var variables = data.split(",");
                            for (var j = 0; j < variables.length; j++) {

                                // Strip off whitespace
                                var cleanData = variables[j].trim();

                                // Now separate the data from the units
                                var cleanDataMatches = cleanData.match(ancillaryDataPattern);
                                if (cleanDataMatches && cleanDataMatches.length > 0) {

                                    var logData = cleanDataMatches[1];
                                    var logUnits = cleanDataMatches[2];
                                    var varFromLookup = ancillaryLookup[source_name][logUnits];
                                    // TODO insert check to make sure there is ancillary data in the lookup before going on!!!!!

                                    // Add the ancillary data to a local array for later processing
                                    // by the data access component
                                    ancillaryDataStorageArray.push([source_name, varFromLookup.var_name,
                                        varFromLookup.var_long_name, varFromLookup.units, logUnits, lastTimestampUTC.format(), logData]);
                                    logger.trace("Pushed: " + source_name + ", " + varFromLookup.var_name + ", " +
                                        varFromLookup.var_long_name + ", " + varFromLookup.units + ", " + logUnits +
                                        ", " + lastTimestampUTC.format() + ", " + logData);

                                    // Now make sure we bump the number of data points for the ancillary
                                    // data description on the deployment

                                    // Make sure there is an ancillary object first
                                    if (!deployment.ancillary_data) deployment.ancillary_data = {};

                                    // Check for source object first and add if not there
                                    if (!deployment.ancillary_data[source_name])
                                        deployment.ancillary_data[source_name] = {};

                                    // Now check for source and units combination and add from lookup if not there
                                    if (!deployment.ancillary_data[source_name][logUnits]) {
                                        deployment.ancillary_data[source_name][logUnits] = ancillaryLookup[source_name][logUnits];
                                    }
                                }
                            }
                        }
                    }
                } else if (imageMatches && imageMatches.length > 0) {
                    // Make sure the deployment has an image objects
                    if (!deployment.images) deployment.images = {};

                    // Where should this file be in the filesystem
                    var imageLocationOnDisk = espCfg.espdir + path.sep + "instances" + path.sep + deployment.esp.name +
                        path.sep + "deployments" + path.sep + deployment.name + path.sep + "data" + path.sep + "raw" + path.sep +
                        "esp" + path.sep + imageMatches[6];
                    logger.debug("If image was downloaded it should be found here: " + imageLocationOnDisk);
                    var isOnDisk = false;
                    if (fs.existsSync(imageLocationOnDisk)) {
                        logger.debug("It IS on disk!");
                        isOnDisk = true;
                    } else {
                        logger.debug("Nope, not on disk");
                    }

                    // Create the new image and extract the
                    logger.debug("IMAGE: " + bodyBuffer.toString());
                    var image = {
                        xPixels: imageMatches[1],
                        yPixels: imageMatches[2],
                        bits: imageMatches[3],
                        exposure: imageMatches[4],
                        imageFilename: imageMatches[6],
                        fullImagePath: imageMatches[5] + imageMatches[6],
                        downloaded: isOnDisk,
                        imageUrl: "/data/instances/" + deployment.esp.name + "/deployments/" +
                            deployment.name + "/data/processed/esp/" + imageMatches[6].replace(".tif", ".jpg")
                    }

                    // Now add it to the deployment if it's not there
                    if (!deployment.images[lastTimestampUTC.valueOf()]) {
                        // Add the image
                        deployment.images[lastTimestampUTC.valueOf()] = image;
                    }
                } else if (processRunStartMatches && processRunStartMatches.length > 0) {
                    logger.debug("ProcessRun!:" + bodyBuffer.toString() + "->");
                    logger.debug("[0]:" + processRunStartMatches[0]);
                    logger.debug("[1]:" + processRunStartMatches[1]);
                    logger.debug("[2]:" + processRunStartMatches[2]);
                    if (processRunStartMatches[3])
                        logger.debug("[3]:" + processRunStartMatches[3]);

                    // We have found the start of a process run, first make sure there are processRuns
                    if (!deployment.processRuns) deployment.processRuns = {};

                    // Now extract the information
                    var processRun = {
                        actor: self.currentActor,
                        name: processRunStartMatches[1],
                        targetVol: processRunStartMatches[2]
                    }

                    // Now if there is a clause after that, there is an archive
                    if (processRunStartMatches[3]) {
                        // The pattern for the archive
                        var archiveRegExp = new RegExp(/, wcr at most (\d+\.*\d*)ml/);
                        var archiveMatches = processRunStartMatches[3].match(archiveRegExp);
                        if (archiveMatches && archiveMatches.length > 0) {
                            processRun.archive = {
                                name: "wcr",
                                targetVol: archiveMatches[1]
                            }
                        }
                    }
                    // Now add it to the deployment if it's not there
                    if (!deployment.processRuns[lastTimestampUTC.valueOf()]) {
                        // Add the process run
                        deployment.processRuns[lastTimestampUTC.valueOf()] = processRun;
                    }
                } else if (dwsmSampleStartMatches && dwsmSampleStartMatches.length > 0) {
                    // We have found the start of a DWSM inhale, make sure there is a place for them on the deployment
                    if (!deployment.samples) deployment.samples = {};
                    var newSample = {
                        actor: self.currentActor,
                        dwsm: true,
                        targetVolume: dwsmSampleStartMatches[1]
                    }
                    // Now add it to the deployment if it's not there
                    if (!deployment.samples[lastTimestampUTC.valueOf()]) {
                        // Add the process run
                        deployment.samples[lastTimestampUTC.valueOf()] = newSample;
                    }
                } else if (dwsmSampleEndMatches && dwsmSampleEndMatches.length > 0) {
                    // We have found the end of sample, makes sure there is a place for them on the deployment
                    if (!deployment.samples) deployment.samples = {};
                    // Grab the last sample:
                    var latestSample = null;
                    var latestSampleTS = null;
                    Object.keys(deployment.samples).forEach(function (samplets) {
                        if ((!latestSampleTS || latestSampleTS < samplets) && deployment.samples[samplets].dwsm) {
                            latestSampleTS = samplets;
                            latestSample = deployment.samples[samplets];
                        }
                    });
                    // If a sample was found and there is no end volume or ts, add them
                    if (latestSample && !latestSample.endts) {
                        latestSample.endts = lastTimestampUTC.valueOf();
                    }
                } else if (sampleStartMatches && sampleStartMatches.length > 0) {
                    // We have found the start of sample, make sure there is a place for them on the deployment
                    if (!deployment.samples) deployment.samples = {};
                    var newSample = {
                        actor: self.currentActor,
                        targetVolume: sampleStartMatches[1]
                    }
                    // Now add it to the deployment if it's not there
                    if (!deployment.samples[lastTimestampUTC.valueOf()]) {
                        // Add the process run
                        deployment.samples[lastTimestampUTC.valueOf()] = newSample;
                    }
                } else if (sampleEndMatches && sampleEndMatches.length > 0) {
                    // We have found the end of sample, makes sure there is a place for them on the deployment
                    if (!deployment.samples) deployment.samples = {};
                    // Grab the last sample:
                    var latestSample = null;
                    var latestSampleTS = null;
                    Object.keys(deployment.samples).forEach(function (samplets) {
                        if (!latestSampleTS || latestSampleTS < samplets) {
                            latestSampleTS = samplets;
                            latestSample = deployment.samples[samplets];
                        }
                    });
                    // If a sample was found and there is no end volume or ts, add them
                    if (latestSample && !latestSample.endts && !latestSample.actualVolume) {
                        latestSample.endts = lastTimestampUTC.valueOf();
                        latestSample.actualVolume = sampleEndMatches[1];
                    }
                }
            } else {
                logger.trace("Line was already processed, skipping");
            }
        }
    }

    // This method looks for a byte or quoted word at the
    // beginning of the given buffer that defines the actor
    // for the entry. It returns the index of the buffer where
    // the main message body starts
    function findActor(buffer) {

        // The body index
        var bodyIndex = 0;

        // Check to make sure the buffer is more than one byte
        if (buffer && buffer.length > 1) {
            // Check to see if the first byte is a quote.
            if (buffer[0] === 34) {
                bodyIndex++;
                // Create an array and fill with characters until the next quote
                var actorBuffer = [];
                for (var i = 1; i < buffer.length; i++) {
                    bodyIndex++;
                    if (buffer[i] === 34) {
                        break;
                    } else {
                        actorBuffer.push(buffer[i]);
                    }
                }
                self.currentActor = (new Buffer(actorBuffer)).toString();
            } else {
                // Check to see if the first byte, defines an actor
                if (self.legend[String.fromCharCode(buffer[0])]) {
                    bodyIndex++;
                    self.currentActor = self.legend[String.fromCharCode(buffer[0])];
                }
            }
        }

        // Return the index of the main body
        return bodyIndex;
    }

    // This method takes in a deployment
    function addAncillarySourcesToDeployment(deployment, ancillaryData) {
        // Split the data into source, hours, minutes, seconds and data
        var ancillarySplitMatches = ancillaryData.match(ancillarySplitPattern);
        if (ancillarySplitMatches && ancillarySplitMatches.length > 0) {
            // Grab the source
            var source = ancillarySplitMatches[1];

            // Grab all the variables
            var data = ancillarySplitMatches[5];

            // Split the data on commas
            var variables = data.split(",");
            for (var j = 0; j < variables.length; j++) {
                // Strip off whitespace
                var cleanData = variables[j].trim();

                // Now separate the data and the unit
                var cleanDataMatches = cleanData.match(ancillaryDataPattern);
                if (cleanDataMatches && cleanDataMatches.length > 0) {

                    // grab the units
                    var varUnits = cleanDataMatches[2];

                    // Make sure the deployment has this ancillary data type listed
                    if (ancillaryLookup[source][varUnits]) {
                        // Make sure there is an ancillary object first
                        if (!deployment.ancillary_data) deployment.ancillary_data = {};

                        // Check for source object first and add if not there
                        if (!deployment.ancillary_data[source])
                            deployment.ancillary_data[source] = {};

                        // Now check for source and units combination and add from lookup if not there
                        if (!deployment.ancillary_data[source][varUnits]) {
                            deployment.ancillary_data[source][varUnits] = JSON.parse(JSON.stringify(ancillaryLookup[source][varUnits]));
                            logger.debug("Added ancillary data to deployment " + deployment.name + " of ESP " +
                                deployment.esp.name);
                            logger.debug(ancillaryLookup[source][varUnits]);

                            // Add a number of data points property
                            deployment.ancillary_data[source][varUnits]["numPoints"] = 0;
                        }
                    }
                }
            }
        }
    }

    // This function looks to see if there is a log file currently being parsed and cleans up by
    // calling the associated callback and clearing out the log file from the variable tracking
    // the current
    function cleanUpAfterParsing(error, deployment, tempFile) {
        logger.debug("cleanUpAfterParsing called");
        // Check to see if something is being parsed
        if (logFileCurrentlyParsing) {
            logger.debug("Cleaning up after the parsing of " + logFileCurrentlyParsing[1] + " for deployment " +
                logFileCurrentlyParsing[0].name + " of ESP " + logFileCurrentlyParsing[0].esp.name);

            // Remove the temp file
            if (tempFile) {
                fs.unlink(tempFile, function (err) {
                    if (err) {
                        logger.error("Error caught trying to unlink file " + tempFile);
                        logger.error(err);
                    } else {
                        logger.debug("File " + tempFile + " was unlinked");
                    }
                });
            }

            // Run the callback associated with the current parsing
            if (logFileCurrentlyParsing[2])
                logFileCurrentlyParsing[2](error, deployment);

            // Clear the logFileCurrently being parsed
            logFileCurrentlyParsing = null;
        } else {
            logger.debug("No file being parsed currently, call ignored");
        }

        // Now move on to the next one
        processLogFileOffQueue();
    }
}

