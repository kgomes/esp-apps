// Grab the dependencies
var util = require('util');
var fs = require('fs');
var path = require('path');
var lazy = require('lazy');
var moment = require('moment');
var eventEmitter = require('events').EventEmitter;

// Configure logging
var log4js = require('log4js');
log4js.loadAppender('file');
log4js.addAppender(log4js.appenders.file('./logs/LogParser.log'), 'LogParser');

// Grab the logger
var logger = log4js.getLogger('LogParser');

// The constructor function
function LogParser(dataAccess, dataDir, opts) {
    // Set the log level if specified
    if (opts.loggerLevel) {
        this.logLevel = opts.loggerLevel;
        logger.setLevel(this.logLevel);
    }
    logger.info("Creating logParser with options: ", opts);

    // Grab reference to instance
    var me = this;

    // Grab the DataAccess object
    this.dataAccess = dataAccess;

    // The location of the data directory
    this.dataDir = dataDir;

    // Set the default number of ticks per second
    this.numberOfTicksPerSecond = opts.numberOfTicksPerSecond;

    // Grab the lookup table of timezone offsets
    this.timezoneLookup = opts.timezoneLookup;

    // Grab the ancillary data lookup table
    this.ancillaryLookup = opts.ancillaryLookup;

    // The temporary directory from the configuration
    this.tempDirectory = opts.tempDir;

    // Check for the flag about whether or not to try and use the timestamps from the ancillary instruments.
    // Use a default of true however
    this.useAncillaryTimestamps = true;
    if (opts.useAncillaryTimestamps) {
        this.useAncillaryTimestamps = opts.useAncillaryTimestamps;
    }

    // Some regular expression patterns
    this.timestampPattern1 = new RegExp(/^@(\D+)(\d+\.\d+)/);
    this.timestampPattern2 = new RegExp(/^@(\d+\.\d+)(\D+)/);
    this.errorPattern = new RegExp(/BadNews.\S+\s+"(.*)",:Subject=>"(.*)"/);
    this.ancillaryPattern = new RegExp(/^Can@.*/);
    this.ancillarySplitPattern = new RegExp(/^(\S+)@(\d{2}):(\d{2}):(\d{2}),(.*)$/);
    this.ancillaryDataPattern = new RegExp(/^(-*\d+\.*\d*)(.*)$/);
    this.processRunStartPattern = new RegExp(/^(\S+) sampling at most (\d+\.*\d*)ml(.*)/);
    this.dwsmSampleStartPattern = new RegExp(/^Sample Bag inhaling\s+(\d+\.*\d*)ml.*$/);
    this.dwsmSampleEndPattern = new RegExp(/^Waiting up to (\d+)s for Sample Bag to stabilize.*$/);
    this.sampleStartPattern = new RegExp(/^Sampling\s+(\d+\.*\d*)ml.*$/);
    this.sampleStopPattern = new RegExp(/^Sampled\s+(\d+\.*\d*)ml.*$/);
    this.imagePattern = new RegExp(/Exposing\s+(\d+)x(\d+)\s+pixel\s+(\d+)-bit\s+image\s+for\s+(\d+\.*\d+)\s+seconds\\(.*\/)([a-zA-Z0-9]+\.tif)/);

    // An object that holds the current list of log files (that point to an associated deployment)
    // that still need to ge parsed
    this.logFileParseQueue = {};

    // This is a pointer to the log file that is being parsed
    this.logFileCurrentlyParsing = null;

    // Create the legend for tracking actors
    this.legend = {};

    // The current actor that is writing log entries
    this.currentActor = null;

    // The timezone that the ESP is operating in
    this.timezoneOffset = null;

    // This is the numeric timezone offset
    this.timezoneOffsetHours = null;

    // ********************************************************************************************
    // This is the function called to submit a log file for parsing.  I use the 'submit' idea to
    // enforce the serial processing of log files.  It seems too much (for now anyway) to try and
    // let asynchronous parallel processing of these files happen.
    // ********************************************************************************************
    this.submitLogFileForParsing = function (deployment, logFile, callback) {
        logger.debug("submitLogFileForParsing called with deployment " + deployment.name +
            " of esp " + deployment.esp.name + " and log file " + logFile);

        // Check the parameters first
        if (!deployment || !logFile) {
            logger.warn("Either deployment or logFile was not specified, will return error");
            if (callback)
                callback(new Error("Either deployment or logFile was not specified"));
            return;
        } else {
            // Check to see if the logFile is already in the queue, if not, add it
            if (!me.logFileParseQueue[logFile]) {
                logger.debug(deployment.esp.name + ":" + deployment.name + ":" + logFile +
                    " needs parsing, adding to queue.");
                me.logFileParseQueue[logFile] = [deployment, logFile, callback];

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
            if (!me.logFileCurrentlyParsing) {

                // Check to see if there are any log files left to process
                if (Object.keys(me.logFileParseQueue).length > 0) {

                    // Just grab the first logFile from the queue object
                    me.logFileCurrentlyParsing = me.logFileParseQueue[Object.keys(me.logFileParseQueue)[0]];

                    // Pull out the necessary pieces
                    var parsingDeployment = me.logFileCurrentlyParsing[0];
                    var parsingLogFile = me.logFileCurrentlyParsing[1];

                    // Remove it from the queue
                    delete me.logFileParseQueue[parsingLogFile];
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
                                    me.dataAccess.persistDeployment(updatedDeployment, function (err, persistedDeployment) {
                                        // Check for errors
                                        if (err) {
                                            // Send the error to the callback and bail out
                                            cleanUpAfterParsing(err, parsingDeployment, tempFile);
                                            return;
                                        } else {
                                            // Now persist ancillary data if there is any
                                            if (ancillaryDataArray.length > 0) {
                                                logger.debug("There are " + ancillaryDataArray.length + " ancillary records to write to the DB");
                                                me.dataAccess.insertAncillaryDataArray(persistedDeployment, ancillaryDataArray,
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
                logger.debug("Currently processing log file " + me.logFileCurrentlyParsing[1] +
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
                var tempLogFile = me.tempDirectory + path.sep + "esp_log_file_" + (new Date()).getTime();
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
            var processedDataLocation = me.dataDir + path.sep + "instances" + path.sep + deployment.esp.name +
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
                var ts1Matches = completeLineBuffer.toString().match(me.timestampPattern1);
                if (ts1Matches && ts1Matches.length > 0) {
                    logger.trace("  Pattern 1 match");

                    // Try to lookup the offset using the timezone abbreviation
                    if (me.timezoneLookup[ts1Matches[1]]) {
                        me.timezoneOffset = me.timezoneLookup[ts1Matches[1]].stringRep;
                        me.timezoneOffsetHours = me.timezoneLookup[ts1Matches[1]].hourOffset;
                        logger.trace("  Zone Offset Parsed: " + me.timezoneOffset);
                        logger.trace("  Zone hours parse: " + me.timezoneOffsetHours);
                    } else {
                        logger.warn("There was no timezone in the lookup table matching: " + ts2Matches[1]);
                    }

                    // Create the date in the local timezone of the server
                    var entryDateServer = moment.unix(ts1Matches[2]);
                    logger.trace("  Log timestamp in server zone: " + entryDateServer.format());

                    // Convert that time to UTC
                    var entryDateUTC = null;
                    if (me.timezoneOffset) {
                        // First step is to convert to UTC
                        entryDateUTC = moment.utc(entryDateServer.format("YYYY-MM-DD HH:mm:ss") + me.timezoneOffset);
                        logger.trace("  After UTC Convert: " + entryDateUTC.format());
                    }

                    // Return the date in utc
                    return entryDateUTC;
                } else {
                    // Try the second timestamp pattern
                    var ts2Matches = completeLineBuffer.toString().match(me.timestampPattern2);
                    if (ts2Matches && ts2Matches.length > 0) {
                        logger.trace("  Pattern 2 match");

                        // Try to lookup the offset using the timezone abbreviation
                        if (me.timezoneLookup[ts2Matches[2]]) {
                            me.timezoneOffset = me.timezoneLookup[ts2Matches[2]].stringRep;
                            me.timezoneOffsetHours = me.timezoneLookup[ts2Matches[2]].hourOffset;
                            logger.trace("  Zone Offset Parsed: " + me.timezoneOffset);
                            logger.trace("  Zone hours parse: " + me.timezoneOffsetHours);
                        } else {
                            logger.warn("There was no timezone in the lookup table matching: " + ts2Matches[2]);
                        }

                        // Create the date in the local timezone of the server
                        var entryDateServer = moment.unix(ts2Matches[1]);
                        logger.trace("  Log timestamp in server zone: " + entryDateServer.format());

                        // Convert to UTC
                        var entryDateUTC = null;
                        if (me.timezoneOffset) {
                            // First step is to convert to UTC
                            entryDateUTC = moment.utc(entryDateServer.format("YYYY-MM-DD HH:mm:ss") + me.timezoneOffset);
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
                var seconds = parseInt(numberOfTicks / me.numberOfTicksPerSecond);
                var millis = parseInt((numberOfTicks / me.numberOfTicksPerSecond - seconds) * 1000);
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
                    me.legend = {};
                    logger.trace("Cleared the legend at timestamp " + lastTimestampUTC.format());
                } else if (completeLineBuffer.length === 2) {
                    logger.trace("Moniker but no actor, will remove " + String.fromCharCode(completeLineBuffer[1]));
                    delete me.legend[String.fromCharCode(completeLineBuffer[1])];
                } else {
                    me.legend[String.fromCharCode(completeLineBuffer[1])] = completeLineBuffer.slice(2).toString();
                    logger.trace(me.legend);
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
                    var errorMatches = bodyBuffer.toString().match(me.errorPattern);
                    var ancillaryMatches = bodyBuffer.toString().match(me.ancillaryPattern);
                    var processRunStartMatches = bodyBuffer.toString().match(me.processRunStartPattern);
                    var dwsmSampleStartMatches = bodyBuffer.toString().match(me.dwsmSampleStartPattern);
                    var dwsmSampleEndMatches = bodyBuffer.toString().match(me.dwsmSampleEndPattern);
                    var sampleStartMatches = bodyBuffer.toString().match(me.sampleStartPattern);
                    var sampleEndMatches = bodyBuffer.toString().match(me.sampleStopPattern);
                    var imageMatches = bodyBuffer.toString().match(me.imagePattern);

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
                                actor: me.currentActor,
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
                            logger.trace("Dealing with AncillaryData entry: " + entries[i]);

                            // Make sure the deployment has the appropriate ancillary sources attached
                            addAncillarySourcesToDeployment(deployment, entries[i]);

                            // I now have a log entry and the deployment should have all the proper entries
                            // for what this log entry contains.
                            writeAncillaryDataToFile(deployment, entries[i], processedDataLocation);

                            // Split the source, hours, minutes and seconds from the data
                            var ancillarySplitMatches = entries[i].match(me.ancillarySplitPattern);
                            if (ancillarySplitMatches && ancillarySplitMatches.length > 0) {
                                logger.trace("Line " + lineNumber + "->" + completeLineBuffer.toString());
                                // Grab the source
                                var source_name = ancillarySplitMatches[1];

                                // Grab the hours minutes and seconds from the ancillary record
                                // NOTE THESE ARE IN THE TIMEZONE OF THE ESP, NOT UTC
                                var ancHourLocal = ancillarySplitMatches[2];
                                var ancMinuteLocal = ancillarySplitMatches[3];
                                var ancSecondLocal = ancillarySplitMatches[4];

                                // Let's convert that to local time
                                var logTimestampLocal = moment(lastTimestampUTC);
                                logTimestampLocal.zone(me.timezoneOffset);
                                logTimestampLocal.local();

                                logger.trace("Log->UTC: " + lastTimestampUTC.format());
                                logger.trace("Timezone: " + me.timezoneOffset);
                                logger.trace("Log->Local: " + logTimestampLocal.format());
                                logger.trace("Anc->HH:mm:ss = " + ancHourLocal + ":" + ancMinuteLocal + ":" + ancSecondLocal);

                                // Make another copy of the local timestamp so we can make sure the ancillary data
                                // timestamp doesn't jump ahead of the log timestamp
                                var ancillaryTimestamp = moment(logTimestampLocal);

                                // Set the hours minutes and seconds from the ancillary data clock
                                ancillaryTimestamp.hour(ancHourLocal);
                                ancillaryTimestamp.minute(ancMinuteLocal);
                                ancillaryTimestamp.second(ancSecondLocal);
                                logger.trace("Anc->Local: " + ancillaryTimestamp.format());

                                // Now convert the ancillary local timestamp to UTC
                                ancillaryTimestamp.utc();
                                logger.trace("Anc->UTC: " + ancillaryTimestamp.format());

                                // OK, let's calculate the difference in the ancillary timestamp and the log timestamp
                                var diffSeconds = ancillaryTimestamp.diff(lastTimestampUTC, 'seconds');
                                logger.trace("diff in seconds is " + diffSeconds);

                                // Now here is some kludgy crap.  Instrument clocks can drift, but because they also
                                // sample before the log entry happens, they can naturally be behind the log timestamp.
                                // One thing is for sure, they should never be ahead, but if they are ahead, they
                                // could be a day ahead if the log clock rolled over but the instrument sampled before
                                // that time, or it could just be a little ahead if the instrument clock is drifting.
                                // Also, if the instrument clock is WAY behind, it has drifted off (10 minutes) and we
                                // should use the log clock.

                                // Let's first look at the normal case where the instrument clock is behind the
                                // log (ESP) clock.
                                if (diffSeconds < 0) {
                                    logger.trace("Instrument clock is " + diffSeconds + " behind ESP clock");
                                    // If the clock is less than 10 minutes behind the ESP clock
                                    if (Math.abs(diffSeconds) > (10 * 60)) {
                                        logger.debug("Instrument clock is more than 10 seconds behind ESP clock, will use ESP timestamp");
                                        logger.debug("Log->UTC: " + lastTimestampUTC.format());
                                        logger.debug("Anc->UTC: " + ancillaryTimestamp.format());
                                        ancillaryTimestamp = moment(lastTimestampUTC);
                                    }
                                } else if (diffSeconds > 0) {
                                    logger.debug("Instrument clock is AHEAD of ESP clock");
                                    logger.debug("Log->UTC: " + lastTimestampUTC.format());
                                    logger.debug("Anc->UTC: " + ancillaryTimestamp.format());
                                    // Now if the clock is more than 12 hours ahead, first subtract a day as this
                                    // could be a day rollover
                                    if (diffSeconds > (12 * 60 * 60)) {
                                        ancillaryTimestamp.subtract('days', 1);
                                        // Now check to see if the timestamp is within 10 minutes behind ESP time
                                        if (ancillaryTimestamp.diff(lastTimestampUTC, 'seconds') > 0 ||
                                            ancillaryTimestamp.diff(lastTimestampUTC, 'seconds') < (-10 * 60)) {
                                            logger.debug("Ancillary timestamp is still out of whack after day adjustment, will use ESP clock");
                                            ancillaryTimestamp = moment(lastTimestampUTC);
                                        }
                                    } else {
                                        logger.debug("Clock seems to be drifting forward, will use ESP time");
                                        ancillaryTimestamp = moment(lastTimestampUTC);
                                    }
                                }

                                // Grab all the variables
                                var data = ancillarySplitMatches[5];

                                // Split the data on commas and iterate over each data item
                                var variables = data.split(",");
                                for (var j = 0; j < variables.length; j++) {

                                    // Strip off whitespace
                                    var cleanData = variables[j].trim();

                                    // Now separate the data from the units
                                    var cleanDataMatches = cleanData.match(me.ancillaryDataPattern);
                                    if (cleanDataMatches && cleanDataMatches.length > 0) {

                                        var logData = cleanDataMatches[1];
                                        var logUnits = cleanDataMatches[2];
                                        var varFromLookup = me.ancillaryLookup[source_name][logUnits];
                                        // TODO insert check to make sure there is ancillary data in the lookup before going on!!!!!

                                        // Add the ancillary data to a local array for later processing
                                        // by the data access component

                                        // Check if we are supposed to use the ancillary timestamps or not
                                        if (me.useAncillaryTimestamps) {
                                            ancillaryDataStorageArray.push([source_name, varFromLookup.var_name,
                                                varFromLookup.var_long_name, varFromLookup.units, logUnits, ancillaryTimestamp.format(), logData]);
                                            logger.trace("Pushed: " + source_name + ", " + varFromLookup.var_name + ", " +
                                                varFromLookup.var_long_name + ", " + varFromLookup.units + ", " + logUnits +
                                                ", " + ancillaryTimestamp.format() + ", " + logData);
                                        } else {
                                            ancillaryDataStorageArray.push([source_name, varFromLookup.var_name,
                                                varFromLookup.var_long_name, varFromLookup.units, logUnits, lastTimestampUTC.format(), logData]);
                                            logger.trace("Pushed: " + source_name + ", " + varFromLookup.var_name + ", " +
                                                varFromLookup.var_long_name + ", " + varFromLookup.units + ", " + logUnits +
                                                ", " + lastTimestampUTC.format() + ", " + logData);
                                        }

                                        // Now make sure we bump the number of data points for the ancillary
                                        // data description on the deployment

                                        // Make sure there is an ancillary object first
                                        if (!deployment.ancillary_data) deployment.ancillary_data = {};

                                        // Check for source object first and add if not there
                                        if (!deployment.ancillary_data[source_name])
                                            deployment.ancillary_data[source_name] = {};

                                        // Now check for source and units combination and add from lookup if not there
                                        if (!deployment.ancillary_data[source_name][logUnits]) {
                                            deployment.ancillary_data[source_name][logUnits] = me.ancillaryLookup[source_name][logUnits];
                                        }
                                    }
                                }
                            }
                        }
                    } else if (imageMatches && imageMatches.length > 0) {
                        // Make sure the deployment has an image objects
                        if (!deployment.images) deployment.images = {};

                        // Where should this file be in the filesystem
                        var imageLocationOnDisk = me.dataDir + path.sep + "instances" + path.sep + deployment.esp.name +
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
                            actor: me.currentActor,
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
                            actor: me.currentActor,
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
                            actor: me.currentActor,
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
                    me.currentActor = (new Buffer(actorBuffer)).toString();
                } else {
                    // Check to see if the first byte, defines an actor
                    if (me.legend[String.fromCharCode(buffer[0])]) {
                        bodyIndex++;
                        me.currentActor = me.legend[String.fromCharCode(buffer[0])];
                    }
                }
            }

            // Return the index of the main body
            return bodyIndex;
        }

        // This method takes in a deployment
        function addAncillarySourcesToDeployment(deployment, ancillaryData) {
            // Split the data into source, hours, minutes, seconds and data
            var ancillarySplitMatches = ancillaryData.match(me.ancillarySplitPattern);
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
                    var cleanDataMatches = cleanData.match(me.ancillaryDataPattern);
                    if (cleanDataMatches && cleanDataMatches.length > 0) {

                        // grab the units
                        var varUnits = cleanDataMatches[2];

                        // Make sure the deployment has this ancillary data type listed
                        if (me.ancillaryLookup[source][varUnits]) {
                            // Make sure there is an ancillary object first
                            if (!deployment.ancillary_data) deployment.ancillary_data = {};

                            // Check for source object first and add if not there
                            if (!deployment.ancillary_data[source])
                                deployment.ancillary_data[source] = {};

                            // Now check for source and units combination and add from lookup if not there
                            if (!deployment.ancillary_data[source][varUnits]) {
                                deployment.ancillary_data[source][varUnits] = JSON.parse(JSON.stringify(me.ancillaryLookup[source][varUnits]));
                                logger.debug("Added ancillary data to deployment " + deployment.name + " of ESP " +
                                    deployment.esp.name);
                                logger.debug(me.ancillaryLookup[source][varUnits]);

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
            if (me.logFileCurrentlyParsing) {
                logger.debug("Cleaning up after the parsing of " + me.logFileCurrentlyParsing[1] + " for deployment " +
                    me.logFileCurrentlyParsing[0].name + " of ESP " + me.logFileCurrentlyParsing[0].esp.name);

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
                if (me.logFileCurrentlyParsing[2])
                    me.logFileCurrentlyParsing[2](error, deployment);

                // Clear the logFileCurrently being parsed
                me.logFileCurrentlyParsing = null;
            } else {
                logger.debug("No file being parsed currently, call ignored");
            }

            // Now move on to the next one
            processLogFileOffQueue();
        }

        // This function takes in the deployment and an ancillaryDataEntry from the log file and writes
        // it to the appropriate file in the processed data location
        function writeAncillaryDataToFile(deployment, ancillaryDataEntry, processedDataLocation) {
            //logger.debug("Going to write some ancillary data to a CSV file.");

            return;
        }
    }
}

// Inherit event emitter functionality
util.inherits(LogParser, eventEmitter);

// Export the factory method
exports.createLogParser = function (dataAccess, dataDir, opts) {
    // Create the new LogParser
    return new LogParser(dataAccess, dataDir, opts);
}