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

// Inherit event emitter functionality
util.inherits(LogParser, eventEmitter);

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

    // This is the number of ancillary data records to batch process
    this.numberOfAncillaryRecordsToBatch = opts.numberOfAncillaryRecordsToBatch;

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
    this.protocolRunStartPattern = new RegExp(/^([^"]+) sampling at most (\d+\.*\d*)ml(.*)/);
    this.dwsmSampleStartPattern = new RegExp(/^Sample Bag inhaling\s+(\d+\.*\d*)ml.*$/);
    this.dwsmSampleEndPattern = new RegExp(/^Waiting up to (\d+)s for Sample Bag to stabilize.*$/);
    this.sampleStartPattern = new RegExp(/^Sampling\s+(\d+\.*\d*)ml.*$/);
    this.sampleStopPattern = new RegExp(/^Sampled\s+(\d+\.*\d*)ml.*$/);
    this.imagePattern = new RegExp(/Exposing\s+(\d+)x(\d+)\s+pixel\s+(\d+)-bit\s+image\s+for\s+(\d+\.*\d+)\s+seconds\\(.*\/)([a-zA-Z0-9]+\.tif)/);
    this.pcrStopPattern = new RegExp(/PCR for (\S+) completed -- closed (\S+\.pcr)/);


    // An object that holds the current list of log files (that point to an associated deployment)
    // that still need to ge parsed
    this.logFileParseQueue = {};

    // This is a pointer to the log file that is being parsed
    this.logFileCurrentlyParsing = null;

    /**
     * This is the function called to submit a log file for parsing.  I use the 'submit' idea to enforce the serial
     * processing of log files.  It seems too much (for now anyway) to try and let asynchronous parallel processing
     * of these files happen.
     * @param deployment
     * @param logFile
     * @param fileStats
     * @param callback
     */
    this.parseLogFile = function (deployment, logFile, fileStats, callback) {
        logger.info("parseLogFile called with deployment " + deployment.name +
            " of esp " + deployment.esp.name + " and log file " + logFile);

        // Check the parameters first
        if (!deployment || !logFile || !fileStats) {
            logger.warn("Either deployment, logFile or fileStats was not specified, will return error");
            if (callback)
                callback(new Error("Either deployment, logFile or fileStats was not specified"));
            return;
        } else {
            // Check to see if the logFile is already in the queue, if not, add it
            if (!me.logFileParseQueue[logFile]) {
                logger.info(deployment.esp.name + ":" + deployment.name + ":" + logFile +
                    " needs parsing, adding to queue.");
                me.logFileParseQueue[logFile] = [deployment, logFile, fileStats];

                // Now send the callback as we have successfully queued it
                if (callback)
                    callback(null);

            } else {
                logger.info(deployment.esp.name + ":" + deployment.name + ":" + logFile +
                    " is already queued for parsing, will ignore this call");
            }

            // Call the method to process log files
            processLogFileOffQueue();
        }
    }

    /**
     *  This is the function to check and see if there it something processing now and if there is is not,
     *  and things are queued up, it starts processing a log file
     */
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
                var parsingLogFileStats = me.logFileCurrentlyParsing[2];

                // Remove it from the queue
                delete me.logFileParseQueue[parsingLogFile];

                logger.info("Starting the parse of log file " + parsingLogFile +
                    " for deployment " + parsingDeployment.name + " of ESP " + parsingDeployment.esp.name);

                // We will first make a copy of the log file to make sure it does not get overwritten by the
                // FTP sync process. Before the copy however, to ensure an FTP sync is not currently running,
                // check the file size to make sure the one on disk is not smaller than the file size in
                // the stats that were submitted.  If it's smaller, it is most likely in the middle of synchronizing
                // and this whole process should be stopped as it will get called again after the sync is
                // complete
                var updateLogFileSize = parsingLogFileStats.size;

                // Grab the size of the file currently on disk
                var currentLogFileSize = fs.statSync(parsingLogFile).size;

                // OK, check sizes
                if (currentLogFileSize < updateLogFileSize) {
                    // Log a warning and keep going
                    logger.warn("Log file " + parsingLogFile + " was marked for parsing, but when the parser " +
                        "got around to it, the local file was smaller than what it was when it was marked for " +
                        "parsing. This most likely means an FTP sync was happening when the parser started.  " +
                        "Since this would cause issues, we are going to skip this file and move on.");
                    processLogFileOffQueue();
                } else {
                    // All looks OK, go ahead with the file copy
                    createTempFile(parsingLogFile, function (err, tempFile) {
                        // Check for any errors first
                        if (err) {
                            logger.error("There was an error create the temporary file for parsing, " +
                                "will bail out:", err);

                            // And now clean up and bail out
                            cleanUpAfterParsing(tempFile);

                            // Try to process the next log file in the queue
                            processLogFileOffQueue();
                        } else {
                            // OK, temp file successfully created
                            logger.info("Will parse temporary file " + tempFile);

                            // Call the method to parse the log file
                            parseLogFile(parsingDeployment, tempFile, function (err) {
                                // Check for an error
                                if (err) {
                                    logger.error("Error during parsing of log file!", err);
                                }

                                // Clean up everything
                                cleanUpAfterParsing(tempFile);

                                // Now call the method to parse the next file in the queue
                                processLogFileOffQueue();
                            });
                        }
                    });
                }
            } else {
                logger.debug("No log files left to parse, will ignore the call");
            }
        } else {
            logger.debug("Currently processing log file " + me.logFileCurrentlyParsing[1] +
                ", call will be ignored");
        }
    }

    /**
     * This function creates a copy of a file in the directory that was specified where the temporary files
     * will go when this object was constructed
     * @param fileToBeCopied
     * @param callback
     */
    function createTempFile(fileToBeCopied, callback) {
        // The temporary log file
        logger.debug("createTempFile called with log file " + fileToBeCopied);

        // Verify the file exists first
        if (fs.existsSync(fileToBeCopied)) {
            // The temporary log file
            var fileCopy = me.tempDirectory + path.sep + "esp_log_file_" + (new Date()).getTime();
            logger.debug("TempFile " + fileCopy + " will be created");

            // Create a read stream
            var readStream = fs.createReadStream(fileToBeCopied);

            // Create the write stream
            var writeStream = fs.createWriteStream(fileCopy);

            // Create the event handler for when the write stream is done.
            writeStream.on('finish', function (err) {
                // If there was an error, send it back to the caller
                if (err) {
                    if (callback)
                        callback(err);
                } else {
                    // Send the callback with no error and the name
                    // of the temp file that was created
                    if (callback)
                        callback(null, fileCopy);
                }
            });

            // An event handler when the read is complete
            readStream.on('end', function (err) {

                // If there was an error send it back to the caller
                if (err) {
                    if (callback)
                        callback(err);
                }

                // Close the write stream
                writeStream.end();
            });

            // Handle any errors on read
            readStream.on('error', function (err) {
                // Call the callback and send the error
                if (callback)
                    callback(err);

                // Close the streams
                readStream.end();
                writeStream.end();
            });

            // Handle errors on write
            writeStream.on('error', function (err) {
                // Call the callback and send the error
                if (callback)
                    callback(err);

                // Close the read and write streams
                readStream.end();
                writeStream.end();
            });

            // Now pipe the read stream to write stream
            readStream.pipe(writeStream);
        } else {
            logger.error("The log file " + fileToBeCopied + " does not exist.");
            if (callback)
                callback(new Error("The log file " + fileToBeCopied + " does not exist."));
        }
    }

    /**
     * This is the method that will run through the log file, line by line and extract the information into
     * properties on the deployment and a new array of any ancillary data that needs to be inserted.
     * @param deployment
     * @param logFile
     * @param callback
     */
    function parseLogFile(deployment, logFile, callback) {

        // Create the legend for tracking actors
        var legend = {};

        // The current actor that is writing log entries
        var currentActor = null;

        // The timezone that the ESP is operating in
        var timezoneOffset = null;

        // This is the numeric timezone offset
        var timezoneOffsetHours = null;

        // Set the line number to 0
        var lineNumber = 0;

        // A variable to keep track of the timestamp
        var timestampUTC = null;

        // A variable that can be used to multiple Buffer objects for log
        // entries that span more than one line
        var lineSegments = [];

        // This is an object with the Error that will be added to the deployment when the parsing is all done
        var errorsToBeAdded = {};

        // This is the object to track Samples that is kept locally to make sure all start and stop
        // of samples are accurately recorded.  This had to be done because samples span
        // multiple lines and with asynchronous commits, things can happen out of order and
        // the sample parsing gets all messed up.
        var samplesToBeAdded = {};

        // This is the object with images that are parsed from the log file and will be added to the deployment
        // when the parsing is done.
        var imagesToBeAdded = {};

        // This is the object with protocol runs that are parsed from the log file and will be added to the
        // deployment when the parsing is all done.
        var protocolRunsToBeAdded = {};

        // This is the object that will track the pcrData entries that will need to be added to the deployment
        // after parsing
        var pcrDataArray = [];

        // Create the processed data location
        var processedDataLocation = path.join(me.dataDir, "instances", deployment.esp.name,
            "deployments", deployment.name, "data", "processed");
        logger.debug("Processed data for the deployment will go in " + processedDataLocation);

        // Before we start parsing, grab the most recent sample from the stored deployment and if
        // there is no end time, add it to the local array of samples being parsed as it is likely the
        // end of the sample will come up first during this parsing
        me.dataAccess.getLatestSample(deployment._id, function (err, latestSample, latestSampleTS) {
            // Check for an error first
            if (err) {
                // Log it, but keep going, not having a latest sample may not be the end of the world
                logger.error("Error caught trying to get latest sample, but will keep going with parsing");
            }

            // If a sample was returned and it has no end timestamp, add it to the array of samples that
            // are being parsed as it is was most likely started in the last parsing, but never finished
            if (latestSample && !latestSample.endts && latestSampleTS) {
                samplesToBeAdded[latestSampleTS] = latestSample;
            }

            // Create the read stream
            var fileReadStream = fs.createReadStream(logFile);

            // Add a handler for file read errors
            fileReadStream.on('error', function (err) {
                logger.error("Error trapped trying to read the log file:", err);
                // Return the updated deployment and ancillary data array to the callback
                if (callback)
                    callback(err);
            });

            // Add handler when the stream read end of file
            fileReadStream.on('end', function (err) {

                // Log out end of file read
                logger.debug("Completed reading of file " + logFile);

                // Flush the ancillary data records
                me.dataAccess.flushAncillaryDataRecords(deployment._id, deployment.esp.name, me.dataDir, function (err) {
                    // If there was an error log it
                    if (err) {
                        logger.error("Error trapped trying to flush the rest of the ancillary data:", err);
                        // Return the updated deployment and ancillary data array to the callback
                        if (callback)
                            callback(err);
                    } else {
                        logger.debug("Flushed the last data records, let's clean out any duplicates");
                        // Now let's run the method to clean up any duplicate ancillary data records that may have been
                        // inserted
                        me.dataAccess.cleanOutDuplicateAncillaryData(function (err) {
                            // If there was an error, just log it, but keep going
                            if (err) {
                                logger.error("There was an error during cleaning of duplicates", err);
                            }
                            logger.debug("Duplicates cleaned, let's update the deployment with " +
                                "the ancillary statistics");
                            // Update the deployment's ancillary statistics with the information from the ancillary database
                            me.dataAccess.setDeploymentAncillaryStatsFromDatabase(deployment, function (err, updatedDeployment) {
                                // Check for errors first
                                if (err) {
                                    logger.error("Error trapped trying to update the deployment with ancillary stats:", err);
                                    // Return the updated deployment and ancillary data array to the callback
                                    if (callback)
                                        callback(err);
                                } else {
                                    // Update the deployment in one pass
                                    me.dataAccess.updateDeployment(deployment._id, null, null, null, null, null,
                                        updatedDeployment.ancillaryData, errorsToBeAdded, samplesToBeAdded, protocolRunsToBeAdded,
                                        imagesToBeAdded, pcrDataArray, lineNumber, function (err) {
                                            if (err) {
                                                logger.error("Error trapped trying to update the deployment:", err);
                                                // Return the updated deployment and ancillary data array to the callback
                                                if (callback)
                                                    callback(err);
                                            } else {
                                                logger.debug("Deployment with ID " + deployment._id + " should now be updated");
                                                // Now sync the CSV data files with the ancillary data in the database
                                                me.dataAccess.syncAncillaryDataFileWithDatabase(updatedDeployment, me.dataDir, function (err, result) {
                                                    if (err) {
                                                        logger.error("Error trying to sync local CSV files with ancillary data:", err);
                                                        if (callback)
                                                            callback(err);
                                                    } else {
                                                        logger.debug("syncAncillaryDataFileWithDatabase callback called");
                                                        if (callback)
                                                            callback(null);
                                                    }
                                                });
                                            }
                                        });
                                }
                            });
                        });
                    }
                });
            });

            // Now loop over the lines in the log file
            new lazy(fileReadStream)
                .lines
                .forEach(function (line) {

                    // Bump Line Number
                    lineNumber++;

                    // First make sure there is a line!
                    if (line) {
                        // Look for a line continuation character
                        if (line[line.length - 1] !== 92) {
                            // Push it on the stack
                            lineSegments.push(line);

                            // Concatenate all lines to get the full buffer
                            var completeLineBuffer = Buffer.concat(lineSegments);

                            // Check for timezones and offsets first
                            var tempTimezoneOffset = searchForTimezoneOffset(completeLineBuffer);
                            if (tempTimezoneOffset) {
                                timezoneOffset = tempTimezoneOffset;
                            }
                            var tempTimezoneOffsetHours = searchForTimezoneOffsetHours(completeLineBuffer);
                            if (tempTimezoneOffsetHours) {
                                timezoneOffsetHours = tempTimezoneOffsetHours;
                            }

                            // First, check the entry to see if it is a timemarker
                            var tempTimestampUTC = searchForTime(completeLineBuffer, timestampUTC, timezoneOffset);

                            // If a timestamp was returned, update the last known timestamp
                            if (tempTimestampUTC) {

                                logger.trace("Line " + lineNumber + " TS->" + tempTimestampUTC.format());
                                // Set the timestamp to the one that was parsed
                                timestampUTC = tempTimestampUTC;

                                // Just log if the time seems to go backwards
                                if (timestampUTC && tempTimestampUTC.diff(timestampUTC) < 0) {
                                    logger.warn("TIME WENT BACKWARDS!!!!");
                                    logger.warn("Line " + lineNumber + "->" + line);
                                    logger.warn("OLD:" + timestampUTC.format());
                                    logger.warn("NEW:" + tempTimestampUTC.format());
                                }
                            } else {
                                logger.trace("Line " + lineNumber + "->" + line.toString());

                                // Since it is not a timestamp entry, try to update the legend if it's a legend entry
                                updateLegend(completeLineBuffer, legend);

                                // Try to find the current actor
                                var tempCurrentActor = findActor(completeLineBuffer, legend);
                                if (tempCurrentActor) currentActor = tempCurrentActor;

                                // Make sure this wasn't a line that was already parse
                                if (!deployment.lastLineParsedFromLogFile ||
                                    deployment.lastLineParsedFromLogFile < lineNumber) {
                                    // Now process the log entry since it was not a timestamp
                                    processLogEntry(legend, currentActor, timezoneOffset,
                                        lineNumber, completeLineBuffer, timestampUTC, deployment,
                                        errorsToBeAdded, samplesToBeAdded, imagesToBeAdded,
                                        protocolRunsToBeAdded, pcrDataArray);
                                }
                            }

                            // Make sure we are keeping track of the last line that we parsed from the log file
                            if (!deployment.lastLineParsedFromLogFile ||
                                deployment.lastLineParsedFromLogFile < lineNumber) {
                                deployment.lastLineParsedFromLogFile = lineNumber;
                            }

                            // Clear the line segment array
                            lineSegments = [];
                        } else {
                            // Push the segment on the stack, but remove the line continuation
                            lineSegments.push(line.slice(0, line.length));
                        }
                    } else {
                        logger.error("Line " + lineNumber + " came back empty from read, should not happen");
                    }
                }
            );

        });
    }

    /**
     * This method searches for a timezone in the given line buffer and returns the hour offset in string format
     * @param completeLineBuffer
     * @returns {string} the string representation of the hours offset from GMT that the timezone is in
     */
    function searchForTimezoneOffset(completeLineBuffer) {
        // This is the timezone to return
        var timezoneOffset = null;

        // Look for the timestamp indicator '@' (decimal 64) in the first byte
        if (completeLineBuffer[0] === 64) {
            // Try to match on the first timestamp pattern
            var ts1Matches = completeLineBuffer.toString().match(me.timestampPattern1);
            if (ts1Matches && ts1Matches.length > 0) {
                logger.trace("Time pattern 1 match");

                // Try to lookup the offset using the timezone abbreviation
                if (me.timezoneLookup[ts1Matches[1]]) {
                    timezoneOffset = me.timezoneLookup[ts1Matches[1]].stringRep;
                    logger.trace("Zone Offset Parsed: " + timezoneOffset);
                } else {
                    logger.warn("There was no timezone in the lookup table matching: " + ts2Matches[1]);
                }
            } else {
                // Try the second timestamp pattern
                var ts2Matches = completeLineBuffer.toString().match(me.timestampPattern2);
                if (ts2Matches && ts2Matches.length > 0) {
                    logger.trace("Time pattern 2 match");

                    // Try to lookup the offset using the timezone abbreviation
                    if (me.timezoneLookup[ts2Matches[2]]) {
                        timezoneOffset = me.timezoneLookup[ts2Matches[2]].stringRep;
                        logger.trace("Zone Offset Parsed: " + timezoneOffset);
                    } else {
                        logger.warn("There was no timezone in the lookup table matching: " + ts2Matches[2]);
                    }
                }
            }
        }

        // Return the offset
        return timezoneOffset;
    }

    /**
     * This method searches the line buffer for a timezone and if one is found returns the number of hours offset from
     * GTM that the timezone is located in.
     * @param completeLineBuffer
     * @returns {integer} the +/- number of hours from GMT that the timestamp is in
     */
    function searchForTimezoneOffsetHours(completeLineBuffer) {
        // This is the timezone to return
        var timezoneOffsetHours = null;

        // Look for the timestamp indicator '@' (decimal 64) in the first byte
        if (completeLineBuffer[0] === 64) {
            // Try to match on the first timestamp pattern
            var ts1Matches = completeLineBuffer.toString().match(me.timestampPattern1);
            if (ts1Matches && ts1Matches.length > 0) {
                logger.trace("Time pattern 1 match");

                // Try to lookup the offset using the timezone abbreviation
                if (me.timezoneLookup[ts1Matches[1]]) {
                    timezoneOffsetHours = me.timezoneLookup[ts1Matches[1]].hourOffset;
                    logger.trace("Zone Offset Parsed: " + timezoneOffsetHours);
                } else {
                    logger.warn("There was no timezone in the lookup table matching: " + ts2Matches[1]);
                }
            } else {
                // Try the second timestamp pattern
                var ts2Matches = completeLineBuffer.toString().match(me.timestampPattern2);
                if (ts2Matches && ts2Matches.length > 0) {
                    logger.trace("Time pattern 2 match");

                    // Try to lookup the offset using the timezone abbreviation
                    if (me.timezoneLookup[ts2Matches[2]]) {
                        timezoneOffsetHours = me.timezoneLookup[ts2Matches[2]].hourOffset;
                        logger.trace("Zone Offset Parsed: " + timezoneOffsetHours);
                    } else {
                        logger.warn("There was no timezone in the lookup table matching: " + ts2Matches[2]);
                    }
                }
            }
        }

        // Return the offset
        return timezoneOffsetHours;
    }

    /**
     * This function searches the
     * @param completeLineBuffer
     * @param timezoneOffset
     * @param timezoneOffsetHours
     * @returns {*}
     */
    function searchForTime(completeLineBuffer, previousTimestamp, timezoneOffset) {
        // The new timestamp to return
        var newTimestampUTC = null;

        // Look for the timestamp indicator '@' (decimal 64) in the first byte
        if (completeLineBuffer[0] === 64) {
            logger.trace("Timestamp Pattern match");
            // Try to match on the first timestamp pattern
            var ts1Matches = completeLineBuffer.toString().match(me.timestampPattern1);
            if (ts1Matches && ts1Matches.length > 0) {
                logger.trace("Pattern 1 match");

                // Create the date in the local timezone of the server
                newTimestampUTC = moment.unix(ts1Matches[2]);
                logger.trace("Log timestamp in server zone: " + newTimestampUTC.format());

                // Convert that time to UTC
                if (timezoneOffset) {
                    // First step is to convert to UTC
                    newTimestampUTC = moment.utc(newTimestampUTC.format("YYYY-MM-DD HH:mm:ss") + timezoneOffset);
                    logger.trace("After UTC Convert: " + newTimestampUTC.format());
                }
            } else {
                // Try the second timestamp pattern
                var ts2Matches = completeLineBuffer.toString().match(me.timestampPattern2);
                if (ts2Matches && ts2Matches.length > 0) {
                    logger.trace("Pattern 2 match");

                    // Create the date in the local timezone of the server
                    newTimestampUTC = moment.unix(ts2Matches[1]);
                    logger.trace("Log timestamp in server zone: " + newTimestampUTC.format());

                    // Convert to UTC
                    if (timezoneOffset) {
                        // First step is to convert to UTC
                        newTimestampUTC = moment.utc(newTimestampUTC.format("YYYY-MM-DD HH:mm:ss") + timezoneOffset);
                        logger.trace("After UTC Convert: " + newTimestampUTC.format());
                    }
                }
            }
        } else if (completeLineBuffer[0] === 43) {
            logger.trace("Time mark matched");

            // This means we found a time increment, so grab the number of ticks
            var numberOfTicks = 1;
            if (completeLineBuffer.slice(1) && completeLineBuffer.slice(1).length > 0) {
                numberOfTicks = parseInt(completeLineBuffer.slice(1));
            }
            logger.trace("Num ticks: " + numberOfTicks);

            // OK, now with # of ticks, calculate the seconds to add to the last timestamp
            var seconds = parseInt(numberOfTicks / me.numberOfTicksPerSecond);
            var millis = parseInt((numberOfTicks / me.numberOfTicksPerSecond - seconds) * 1000);
            logger.trace("Will add " + seconds + " seconds and " + millis + " milliseconds to previous timestamp of " +
                previousTimestamp.format());
            newTimestampUTC = previousTimestamp.add('s', seconds);
            newTimestampUTC = newTimestampUTC.add('ms', millis);
            logger.trace("New timestamp UTC: " + newTimestampUTC.format());
        }

        // Return the timestamp
        return newTimestampUTC;
    }

    /**
     * This method checks to see if the line buffer contains a legend entry and if it does, updates the given legend
     * object with the entry
     * @param completeLineBuffer
     * @param legend
     */
    function updateLegend(completeLineBuffer, legend) {
        // Look for an equals sign
        if (completeLineBuffer[0] === 61) {
            logger.trace("Found a legend entry");
            // If it is just an legend type byte, the legend should be cleared
            if (completeLineBuffer.length === 1) {
                logger.trace("There was no entry, so will clear the legend");
                legend = {};
            } else if (completeLineBuffer.length === 2) {
                logger.trace("Moniker but no actor, will remove " + String.fromCharCode(completeLineBuffer[1]));
                delete legend[String.fromCharCode(completeLineBuffer[1])];
            } else {
                legend[String.fromCharCode(completeLineBuffer[1])] = completeLineBuffer.slice(2).toString();
                logger.trace("Added legend entry to get new legend:", legend);
            }
        }
    }

    /**
     * This method searches the buffer for the actor referenced in the log line.  It returns null if no actor
     * was found
     * @param buffer
     * @param legend
     * @returns {string} which is the actor that created the log entry
     */
    function findActor(buffer, legend) {

        // The actor to return
        var currentActor = null;

        // Check to make sure the buffer is more than two bytes
        if (buffer && buffer.length > 2) {
            // Check to see if the second byte is a quote.
            if (buffer[1] === 34) {
                // Create an array and fill with characters until the next quote
                var actorBuffer = [];
                for (var i = 2; i < buffer.length; i++) {
                    if (buffer[i] === 34) {
                        break;
                    } else {
                        actorBuffer.push(buffer[i]);
                    }
                }
                currentActor = (new Buffer(actorBuffer)).toString();
            } else {
                // Check to see if the second byte defines an actor
                if (legend[String.fromCharCode(buffer[1])]) {
                    currentActor = legend[String.fromCharCode(buffer[1])];
                }
            }
        }

        // Return the actor
        return currentActor;
    }

    /**
     * This method looks for a byte or quoted word at the beginning of the given buffer that defines the actor for
     * the entry. It returns the index of the buffer where the main message body starts
     * @param buffer
     * @param legend
     * @returns {number}
     */
    function findBodyIndex(buffer, legend) {

        // The body index
        var bodyIndex = 0;

        // Check to make sure the buffer is more than one byte
        if (buffer && buffer.length > 1) {
            // Check to see if the first byte is a quote.
            if (buffer[0] === 34) {
                bodyIndex++;
                // Search for second quote
                for (var i = 1; i < buffer.length; i++) {
                    bodyIndex++;
                    if (buffer[i] === 34) {
                        break;
                    }
                }
            } else {
                // Check to see if the first byte, defines an actor
                if (legend[String.fromCharCode(buffer[0])]) {
                    bodyIndex++;
                }
            }
        }

        // Return the index of the main body
        return bodyIndex;
    }

    /**
     *
     * @param legend
     * @param currentActor
     * @param timezoneOffset
     * @param timezoneOffsetHours
     * @param lineNumber
     * @param completeLineBuffer
     * @param lastTimestampUTC
     * @param deployment
     * @param errorsToBeAdded
     * @param samplesBeingParsed
     * @param imagesToBeAdded
     * @param protocolRunsToBeAdded
     * @param pcrDataArray
     * @returns {*}
     */
    function processLogEntry(legend, currentActor, timezoneOffset, lineNumber, completeLineBuffer, lastTimestampUTC, deployment, errorsToBeAdded, samplesBeingParsed, imagesToBeAdded, protocolRunsToBeAdded, pcrDataArray) {

        // Find the index of the real body of the log entry
        var bodyIndex = 0;
        if (completeLineBuffer[0] === 33) {
            bodyIndex = findBodyIndex(completeLineBuffer.slice(1), legend);
        } else if (completeLineBuffer[0] === 35) {
            bodyIndex = findBodyIndex(completeLineBuffer.slice(1), legend);
        } else if (completeLineBuffer[0] === 126) {
            bodyIndex = findBodyIndex(completeLineBuffer.slice(1), legend);
        } else if (completeLineBuffer[0] === 96) {
            bodyIndex = findBodyIndex(completeLineBuffer.slice(1), legend);
        } else if (completeLineBuffer[0] === 46) {
            bodyIndex = findBodyIndex(completeLineBuffer.slice(1), legend);
        } else {
            bodyIndex = findBodyIndex(completeLineBuffer, legend);
        }
        // Grab the body of the message buffer
        var bodyBuffer = completeLineBuffer.slice(bodyIndex + 1);
        logger.trace("Body Index:" + bodyIndex + ",currentActor:" + currentActor);
        logger.trace("Body Buffer->" + bodyBuffer.toString());

        // Check to see if the body start with a \, if so skip it
        if (bodyBuffer[0] === 92) bodyBuffer = bodyBuffer.slice(1);

        // Do pattern matching for all possibilities
        var errorMatches = bodyBuffer.toString().match(me.errorPattern);
        var ancillaryMatches = bodyBuffer.toString().match(me.ancillaryPattern);
        var protocolRunStartMatches = bodyBuffer.toString().match(me.protocolRunStartPattern);
        var dwsmSampleStartMatches = bodyBuffer.toString().match(me.dwsmSampleStartPattern);
        var dwsmSampleEndMatches = bodyBuffer.toString().match(me.dwsmSampleEndPattern);
        var sampleStartMatches = bodyBuffer.toString().match(me.sampleStartPattern);
        var sampleEndMatches = bodyBuffer.toString().match(me.sampleStopPattern);
        var imageMatches = bodyBuffer.toString().match(me.imagePattern);
        var pcrStopMatches = bodyBuffer.toString().match(me.pcrStopPattern);

        // Now handle the various entry types, starting with errors
        if (errorMatches && errorMatches.length > 0) {

            // Create a new error object
            var newError = {
                actor: currentActor,
                subject: errorMatches[2],
                message: errorMatches[1]
            };
            logger.debug("Line " + lineNumber + " TS->" + lastTimestampUTC.format() + " is Error:", newError);

            // Add it to the object to be added to the deployment later
            errorsToBeAdded[lastTimestampUTC.valueOf()] = newError;
        } else if (imageMatches && imageMatches.length > 0) {
            // First grab the full local path on the ESP where the image is located
            var fullImagePath = imageMatches[5] + imageMatches[6];
            logger.trace("Image path on ESP is " + fullImagePath);

            // The local path to the base of the FTP file sync
            var localDeploymentRootPath = me.dataDir + path.sep + "instances" + path.sep +
                deployment.esp.name + path.sep + "deployments" + path.sep + deployment.name + path.sep +
                "data" + path.sep + "raw";
            logger.trace("Local deployment root path is " + localDeploymentRootPath);

            // The base URL for the TIF image
            var localDeploymentRootTIFPathURL = "/data/instances/" + deployment.esp.name + "/deployments/" +
                deployment.name + "/data/raw";

            // The base URL for the JPG version
            var localDeploymentRootJPGPathURL = "/data/instances/" + deployment.esp.name + "/deployments/" +
                deployment.name + "/data/processed";

            // Construct the local path to the image using the full path on the ESP minus any path
            // defined on the deployment.  If there is no path defined on the deployment, take a best
            // guess
            var imageLocationOnDisk = null;
            var imageLocationTIFURL = null;
            var imageLocationJPGURL = null;
            if (deployment.esp && deployment.esp.path) {
                // Since we have an ESP relative path where the image is located, we just replace
                // that in the full path with the local roots
                imageLocationOnDisk = fullImagePath.replace(deployment.esp.path, localDeploymentRootPath);
                imageLocationTIFURL = fullImagePath.replace(deployment.esp.path, localDeploymentRootTIFPathURL);
                imageLocationJPGURL = fullImagePath.replace(deployment.esp.path, localDeploymentRootJPGPathURL).replace(".tif", ".jpg");
            } else {
                // This is our best guess and should be where most of the images live
                imageLocationOnDisk = localDeploymentRootPath + path.sep +
                    "esp" + path.sep + imageMatches[6];
                imageLocationTIFURL = localDeploymentRootTIFPathURL + "/esp/" + imageMatches[6];
                imageLocationJPGURL = localDeploymentRootJPGPathURL + "/esp/" +
                    imageMatches[6].replace(".tif", ".jpg");
            }
            logger.trace("If image was downloaded it should be found here: " + imageLocationOnDisk);
            var isOnDisk = false;
            if (fs.existsSync(imageLocationOnDisk)) {
                logger.trace("It IS on disk!");
                isOnDisk = true;
            } else {
                logger.trace("Nope, not on disk");
            }

            // Create the new image and extract the
            var image = {
                xPixels: imageMatches[1],
                yPixels: imageMatches[2],
                bits: imageMatches[3],
                exposure: imageMatches[4],
                imageFilename: imageMatches[6],
                fullImagePath: fullImagePath,
                downloaded: isOnDisk,
                tiffUrl: imageLocationTIFURL,
                imageUrl: imageLocationJPGURL
            }

            logger.debug("Line " + lineNumber + " TS->" + lastTimestampUTC.format() + " is Image:", image);

            // Add the image to the array of images to be added to the deployment
            imagesToBeAdded[lastTimestampUTC.valueOf()] = image;

        } else if (protocolRunStartMatches && protocolRunStartMatches.length > 0) {
            logger.trace("ProtocolRun!:" + bodyBuffer.toString() + "->");
            logger.trace("[0]:" + protocolRunStartMatches[0]);
            logger.trace("[1]:" + protocolRunStartMatches[1]);
            logger.trace("[2]:" + protocolRunStartMatches[2]);
            if (protocolRunStartMatches[3])
                logger.trace("[3]:" + protocolRunStartMatches[3]);

            // Now extract the information
            var protocolRun = {
                actor: currentActor,
                name: protocolRunStartMatches[1],
                targetVol: protocolRunStartMatches[2]
            }

            // Now if there is a clause after that, there is an archive
            if (protocolRunStartMatches[3]) {
                // The pattern for the archive
                var archiveRegExp = new RegExp(/, wcr at most (\d+\.*\d*)ml/);
                var archiveMatches = protocolRunStartMatches[3].match(archiveRegExp);
                if (archiveMatches && archiveMatches.length > 0) {
                    protocolRun.archive = {
                        name: "wcr",
                        targetVol: archiveMatches[1]
                    }
                }
            }

            logger.debug("Line " + lineNumber + " TS->" + lastTimestampUTC.format() + " is ProtocolRun:", protocolRun);

            // Add it to the array of protocols run to be added to the deployment
            protocolRunsToBeAdded[lastTimestampUTC.valueOf()] = protocolRun;

        } else if (dwsmSampleStartMatches && dwsmSampleStartMatches.length > 0) {
            // We have found the start of a DWSM inhale, let's create a new Sample
            var newSample = {
                actor: currentActor,
                dwsm: true,
                targetVolume: dwsmSampleStartMatches[1]
            }
            logger.debug("Line " + lineNumber + " TS->" + lastTimestampUTC.format() + " is DWSM Sample:", newSample);

            // Add it to the array of samples being parsed
            samplesBeingParsed[lastTimestampUTC.valueOf()] = newSample;

        } else if (dwsmSampleEndMatches && dwsmSampleEndMatches.length > 0) {
            // Now we have found the end of a DWSM sample, let's look in the array of samples
            // being parsed and find the most recent DWSM sample that has no end time
            for (var sampleStartTS in samplesBeingParsed) {
                if (samplesBeingParsed[sampleStartTS].dwsm && !samplesBeingParsed[sampleStartTS].endts) {
                    // It's a DWSM with no end time, we will assume this to be the right one. Set the
                    // end time and set the actual volume equal to the target volume as there is currently
                    // no way to tell how much was actually sampled
                    samplesBeingParsed[sampleStartTS].endts = lastTimestampUTC.valueOf();
                    samplesBeingParsed[sampleStartTS].actualVolume =
                        samplesBeingParsed[sampleStartTS].targetVolume;

                    logger.debug("Line " + lineNumber + " TS->" + lastTimestampUTC.format() + " is DWSM End:", samplesBeingParsed[sampleStartTS]);

                    // End the loop
                    break;
                }
            }
        } else if (sampleStartMatches && sampleStartMatches.length > 0) {

            // We have found the start of sample, create a new sample
            var newSample = {
                actor: currentActor,
                targetVolume: sampleStartMatches[1]
            }
            logger.debug("Line " + lineNumber + " TS->" + lastTimestampUTC.format() + " is Normal Sample:", newSample);
            // Now add it to the local sample tracking object
            samplesBeingParsed[lastTimestampUTC.valueOf()] = newSample;

        } else if (sampleEndMatches && sampleEndMatches.length > 0) {
            // Since I have found a sample end, grab the end timestamp and the actual volume sampled
            var endSampleTS = lastTimestampUTC.valueOf();
            var actualVolume = sampleEndMatches[1];

            // We have to be a little careful here as some samples do not finish. So when we find an end
            // sample, we just need to find the latest timestamp of a sample with no endTS
            var latestOpenSampleTS = null;
            for (var sampleStartTS in samplesBeingParsed) {
                if (!samplesBeingParsed[sampleStartTS].dwsm && !samplesBeingParsed[sampleStartTS].endts &&
                    (!latestOpenSampleTS || sampleStartTS > latestOpenSampleTS)) {
                    // Copy the timestamp
                    latestOpenSampleTS = sampleStartTS;
                }
            }
            // Now if there is a open sample timestamp found, close it and assign actual volume
            if (latestOpenSampleTS) {
                samplesBeingParsed[latestOpenSampleTS].endts = lastTimestampUTC.valueOf();
                if (actualVolume) {
                    samplesBeingParsed[latestOpenSampleTS].actualVolume = actualVolume;
                }
                logger.debug("Line " + lineNumber + " TS->" + lastTimestampUTC.format() + " is Normal Sample End:", samplesBeingParsed[latestOpenSampleTS]);
            }
        } else if (ancillaryMatches && ancillaryMatches.length > 0) {

            // We are dealing with ancillary data and they are often over multiple
            // lines so split each instrument by line continuation character
            var entries = bodyBuffer.toString().split("\\");
            for (var i = 0; i < entries.length; i++) {
                logger.trace("Line " + lineNumber + " TS->" + lastTimestampUTC.format() + " is AncillaryData: ", entries);

                // Split the source, hours, minutes and seconds from the data
                var ancillarySplitMatches = entries[i].match(me.ancillarySplitPattern);
                if (ancillarySplitMatches && ancillarySplitMatches.length > 0) {
                    // Grab the source
                    var sourceName = ancillarySplitMatches[1];

                    // Grab the hours minutes and seconds from the ancillary record
                    // NOTE THESE ARE IN THE TIMEZONE OF THE ESP, NOT UTC
                    var ancHourLocal = ancillarySplitMatches[2];
                    var ancMinuteLocal = ancillarySplitMatches[3];
                    var ancSecondLocal = ancillarySplitMatches[4];

                    // Let's convert that to local time
                    var logTimestampLocal = moment(lastTimestampUTC);
                    logTimestampLocal.zone(timezoneOffset);
                    logTimestampLocal.local();

                    logger.trace("TS:Log->UTC=" + lastTimestampUTC.format() +
                        ",TZ: " + timezoneOffset + ",Log->Local: " + logTimestampLocal.format() +
                        ",Anc->HH:mm:ss = " + ancHourLocal + ":" + ancMinuteLocal + ":" + ancSecondLocal);

                    // Make another copy of the local timestamp so we can make sure the ancillary data
                    // timestamp doesn't jump ahead of the log timestamp
                    var ancillaryTimestamp = moment(logTimestampLocal);

                    // Set the hours minutes and seconds from the ancillary data clock
                    ancillaryTimestamp.hour(ancHourLocal);
                    ancillaryTimestamp.minute(ancMinuteLocal);
                    ancillaryTimestamp.second(ancSecondLocal);

                    // Now convert the ancillary local timestamp to UTC
                    ancillaryTimestamp.utc();
                    logger.trace("Anc->Local: " + ancillaryTimestamp.format() +
                        ",Anc->UTC: " + ancillaryTimestamp.format());

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
                            logger.trace("Instrument clock is more than 10 seconds behind ESP clock, will use ESP timestamp");
                            logger.trace("Log->UTC: " + lastTimestampUTC.format());
                            logger.trace("Anc->UTC: " + ancillaryTimestamp.format());
                            ancillaryTimestamp = moment(lastTimestampUTC);
                        }
                    } else if (diffSeconds > 0) {
                        logger.trace("Instrument clock is AHEAD of ESP clock");
                        logger.trace("Log->UTC: " + lastTimestampUTC.format());
                        logger.trace("Anc->UTC: " + ancillaryTimestamp.format());
                        // Now if the clock is more than 12 hours ahead, first subtract a day as this
                        // could be a day rollover
                        if (diffSeconds > (12 * 60 * 60)) {
                            ancillaryTimestamp.subtract('days', 1);
                            // Now check to see if the timestamp is within 10 minutes behind ESP time
                            if (ancillaryTimestamp.diff(lastTimestampUTC, 'seconds') > 0 ||
                                ancillaryTimestamp.diff(lastTimestampUTC, 'seconds') < (-10 * 60)) {
                                logger.trace("Ancillary timestamp is still out of whack after day adjustment, will use ESP clock");
                                ancillaryTimestamp = moment(lastTimestampUTC);
                            }
                        } else {
                            logger.trace("Clock seems to be drifting forward, will use ESP time");
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

                            var logData = cleanDataMatches[1].trim();
                            var logUnits = cleanDataMatches[2].trim();
                            // Make sure there is something in the lookup matching that source name
                            if (me.ancillaryLookup[sourceName]) {
                                var varFromLookup = me.ancillaryLookup[sourceName][logUnits];
                                // TODO insert check to make sure there is ancillary data in the lookup before going on!!!!!
                                if (varFromLookup) {

                                    // Check if we are supposed to use the ancillary timestamps or not
                                    if (me.useAncillaryTimestamps) {
                                        me.dataAccess.addAncillaryDataRecord(deployment._id, deployment.esp.name,
                                            [sourceName, varFromLookup.varName, varFromLookup.varLongName,
                                                varFromLookup.units, logUnits, ancillaryTimestamp.format(),
                                                logData], function (err) {

                                            });
                                        logger.trace("Pushed: " + ancillaryTimestamp.format() + ", " + sourceName + ", " +
                                            varFromLookup.varName + ", " + varFromLookup.varLongName + ", " +
                                            varFromLookup.units + ", " + logUnits + ", " + logData);
                                    } else {
                                        me.dataAccess.addAncillaryDataRecord(deployment._id, deployment.esp.name,
                                            [sourceName, varFromLookup.varName, varFromLookup.varLongName,
                                                varFromLookup.units, logUnits, lastTimestampUTC.format(),
                                                logData], function (err) {

                                            });
                                        logger.trace("Pushed: " + lastTimestampUTC.format() + ", " + sourceName + ", " +
                                            varFromLookup.varName + ", " + varFromLookup.varLongName + ", " +
                                            varFromLookup.units + ", " + logUnits + ", " + logData);
                                    }
                                } else {
                                    logger.error("No matching configuration was found for ancillary data from source " +
                                        sourceName + " and log units " + logUnits);
                                }
                            } else {
                                logger.error("It appears there is nothing in the ancillary lookup for the source " +
                                    " with name " + sourceName + ".  It most likely needs to be added to the config.js " +
                                    " file and then the server needs to be restarted.");
                            }
                        }
                    }
                }
            }
        } else if (pcrStopMatches) {
            // Grab the full file path
            var fullFilePath = pcrStopMatches[2];

            // Grab just the file name using split
            var fullFilePathArray = fullFilePath.split('/');
            var filename = fullFilePathArray[fullFilePathArray.length - 1];

            // Where should this file be in the filesystem
            var pcrLocationOnDisk = me.dataDir + path.sep + "instances" + path.sep + deployment.esp.name +
                path.sep + "deployments" + path.sep + deployment.name + path.sep + "data" + path.sep + "raw" + path.sep +
                "esp" + path.sep + filename;
            logger.debug("PCR: if file was downloaded it should be found here: " + pcrLocationOnDisk);

            if (fs.existsSync(pcrLocationOnDisk)) {
                logger.trace("PCR: It IS on disk!");

                // Create the new object that will be used to store all the PCR data
                var pcrData = {};

                // Create some patterns that will be used when parsing the PCR file
                var headerPattern = new RegExp(/^(\S+),\s(\S+) started at, (\d+)\/(\d+)\/(\d+) (\d+):(\d+):(\d+),(\S+)/);

                // Read in the file and then loop over each line in the file
                var pcrType = null;
                var pcrStartDate = null;
                //var pcrRunName = null;
                var pcrRunStartDate = null;
                var pcrRunNumberOfCycles = null;
                var pcrColumnHeaders = null;
                var pcrCycleCounter = 0;
                var timestampColumn = -1;
                var celsiusColumn = -1;
                fs.readFileSync(pcrLocationOnDisk).toString().split('\n').forEach(function (line) {
                    logger.trace("PCR: File line: ", line);
                    // Check for the header
                    var headerMatches = line.match(headerPattern);
                    if (headerMatches) {
                        // Parse the date
                        var startDate = moment("20" + headerMatches[5] + "-" + headerMatches[3] + "-" +
                            headerMatches[4] + "T" + headerMatches[6] + ":" + headerMatches[7] + ":" +
                            headerMatches[8] + " " + headerMatches[9]);
                        logger.trace("PCR: Date parsed", startDate);
                        if (line.indexOf("cycles started") !== -1) {
                            logger.trace("PCR: Cycle starting was found");
                            // Grab the number of cycles
                            pcrRunNumberOfCycles = headerMatches[1];
                            // Grab the run start date
                            pcrRunStartDate = startDate;
                            logger.trace("PCR: Number of cycles = " + pcrRunNumberOfCycles +
                                " started at " + pcrRunStartDate + " which in epoch is " +
                                pcrRunStartDate.unix());
                        } else {
                            logger.trace("PCR: Header was found, start a new parsing");
                            // Set the PCR type
                            pcrType = headerMatches[1] + "-" + headerMatches[2];
                            // Set the name of the run
                            //pcrRunName = headerMatches[2];
                            // Set the PCR start date
                            pcrStartDate = startDate;

                            // Clear other fields
                            pcrRunStartDate = null;
                            pcrRunNumberOfCycles = null;
                            pcrColumnHeaders = null;
                            pcrCycleCounter = 0;
                            timestampColumn = -1;
                            celsiusColumn = -1;

                            logger.trace("PCR: New PCR type " + pcrType + " started at " + pcrStartDate +
                                " which in epoch is " + pcrStartDate.unix());
                        }
                    } else {
                        // Check for a column header
                        if (line.indexOf("SecsSinceStart") !== -1 && line.indexOf("Celsius") !== -1) {
                            pcrColumnHeaders = line.split(',');
                            // Find the SecsSinceStart column
                            timestampColumn = pcrColumnHeaders.indexOf('SecsSinceStart');
                            celsiusColumn = pcrColumnHeaders.indexOf('Celsius');
                            logger.trace("PCR: We have a column header line where seconds is in column " +
                                timestampColumn + " and temp is in column " + celsiusColumn);
                        } else {
                            logger.trace("PCR: Could be a data record");
                            // Could be a data record, so split the line into an array by commas
                            var dataRecordColumns = line.split(',');
                            // Make sure it is the same length as the column headers
                            if (pcrColumnHeaders && (dataRecordColumns.length === pcrColumnHeaders.length)) {
                                logger.trace("PCR: same number of columns, could be data!");
                                var secsSinceStart = dataRecordColumns[timestampColumn];
                                var celsius = dataRecordColumns[celsiusColumn];

                                // Make sure we can parse both
                                var secsSinceStartInt = null;
                                var celsiusFloat = null;
                                try {
                                    secsSinceStartInt = parseInt(secsSinceStart);
                                    celsiusFloat = parseFloat(celsius);
                                } catch (err) {
                                    logger.error("PCR: Could not parse seconds or celsius: ", err);
                                }

                                // Make sure we have seconds and celsius
                                if (secsSinceStartInt && celsiusFloat) {
                                    // Bump the cycle counter
                                    pcrCycleCounter++;

                                    // Copy the start time of the pcr run
                                    var timestamp = moment(pcrRunStartDate);
                                    timestamp.add('s', secsSinceStartInt);

                                    // Pull both timestamps as epoch millis
                                    var timestampEpochMillis = timestamp.unix() * 1000;
                                    var pcrRunStartDateEpochMillis = pcrRunStartDate.unix() * 1000;

                                    // Now loop over the columns of data
                                    for (var i = 0; i < dataRecordColumns.length; i++) {
                                        if (i !== timestampColumn && i !== celsiusColumn) {
                                            // New record
                                            var dataRecord = [pcrCycleCounter, timestampEpochMillis, celsiusFloat, parseFloat(dataRecordColumns[i])];

                                            // Make sure the PCRType is on the data object
                                            if (!pcrData[pcrType]) {
                                                pcrData[pcrType] = {};
                                            }

                                            // Make sure there is a pcr entry for the particular column
                                            if (!pcrData[pcrType][pcrColumnHeaders[i]]) {
                                                pcrData[pcrType][pcrColumnHeaders[i]] = {};
                                            }
                                            // Now make sure the timestamp is already there
                                            if (!pcrData[pcrType][pcrColumnHeaders[i]][pcrRunStartDateEpochMillis]) {
                                                pcrData[pcrType][pcrColumnHeaders[i]][pcrRunStartDateEpochMillis] = [];
                                            }

                                            // Now push the data
                                            pcrData[pcrType][pcrColumnHeaders[i]][pcrRunStartDateEpochMillis].push(dataRecord);
                                        }
                                    }
                                }
                            }
                        }
                    }
                });
                logger.debug("PCR data from file " + pcrLocationOnDisk + " is:", pcrData);

                // Add the pcr to the array of pcr data that will be attached to the deployment
                pcrDataArray.push(pcrData);

            } else {
                logger.trace("PCR: Nope, not on disk");
            }
        }
    }

    /**
     * This function looks to see if there is a log file currently being parsed and cleans up by calling the
     * associated callback and clearing out the log file from the variable tracking the current
     * @param tempFile
     */
    function cleanUpAfterParsing(tempFile) {
        logger.debug("cleanUpAfterParsing called");
        // Check to see if something is being parsed
        if (me.logFileCurrentlyParsing) {
            logger.info("Cleaning up after the parsing of " + me.logFileCurrentlyParsing[1] + " for deployment " +
                me.logFileCurrentlyParsing[0].name + " of ESP " + me.logFileCurrentlyParsing[0].esp.name);

            // Remove the temp file
            if (tempFile) {
                fs.unlink(tempFile, function (err) {
                    if (err) {
                        logger.error("Error caught trying to unlink file " + tempFile);
                        logger.error(err);
                    } else {
                        logger.debug("File " + tempFile + " was removed");
                    }
                });
            }

            // Clear the logFileCurrently being parsed
            me.logFileCurrentlyParsing = null;
        } else {
            logger.debug("No file being parsed currently, call ignored");
        }
    }
}

// Export the factory method
exports.createLogParser = function (dataAccess, dataDir, opts) {
    // Create the new LogParser
    return new LogParser(dataAccess, dataDir, opts);
}