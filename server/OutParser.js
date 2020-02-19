/*
 * This is a module (CommonJS format) that is responsible for dealing with .out and .log files.  
 * .out files are basically log files from the ESP but have been run through the 'dumplog'
 * utility, which makes them more human readable.  This class has the knowledge of how to 
 * parse those files and report back all the contents of that log file so that a calling 
 * program can use that information
 */

// Import fs module
const fs = require('fs');

// Import the path module
const path = require('path');

// The moment module
const moment = require('moment');

// Import the time zone lookup
const timezoneLookup = require('./TimeZoneLookup');

// A placeholder for the ancillary data lookup object
var ancillaryDataLookup = {};

// Import the log4js module and add the file appender        
const log4js = require('log4js');

// Create a placeholder for the logger that will depend on the directory being set
const logger = log4js.getLogger('OutParser');
//logger.info('Creating OutParser');

// This is a method that will set the directory where the logs will be written, note the log
// directory should be an existing directory
function setLogDirectory(directory) {
    log4js.loadAppender('file');
    log4js.addAppender(log4js.appenders.file(path.join(directory, 'OutParser.log')), 'OutParser');
    logger.info('Log directory set to ' + directory);
}

// Set the level for logging purposes. Order or precedence is:
// ALL < TRACE < DEBUG < INFO < WARN < ERROR < FATAL < MARK < OFF
function setLogLevel(level) {
    logger.setLevel(level);
}

// A function to set the lookup object for ancillary data
function setAncillaryDataLookup(ancillaryDataLookupParam) {
    ancillaryDataLookup = ancillaryDataLookupParam;
    logger.debug('Setting ancillaryDataLookup to ');
    logger.debug(JSON.stringify(ancillaryDataLookup, null, 2));
}

// This is a function that takes in a line and the previous date and returns the updated date from
// the line entry
function updateTimestamp(fileType, completeLineBuffer, timestamp, numberOfTicksPerSecond) {
    logger.trace('updateTimestamp called for file type ' + fileType);

    // The date object to return
    var dateToReturn;

    // How we look for the timestamp depends on what type of log file we are parsing
    if (fileType == 'out') {
        logger.trace('File type is .out');

        // Convert the buffer to a string
        var line = completeLineBuffer.toString();

        // These are the two regular expressions for parsing timestamps from a .out file
        var timestampPattern1 = new RegExp(/^(\d+):(\d+):(\d+)\.(\d+)(\D+)(\d+)-(\D+)-(\d+)/);
        var timestampPattern2 = new RegExp(/^(\d+):(\d+):(\d+)\.(\d+)/);

        // Make sure a line is available
        if (line) {

            // First extract the first non-whitespace part of the line which should be some time indicator
            var timeIndicator = line.split(' ')[0];

            // Verify it start with the '@' symbol and then grab what's after
            if (timeIndicator && timeIndicator.startsWith('@')) {
                timeIndicator = timeIndicator.substring(1);

                // Now the time indicator can be in a couple of forms:
                // 1. Full timestamp: 07:30:57.19UTC17-Apr-13
                // 2. Time of day only: 18:43:00.26

                // Use regular expressions to try and pull the different pieces out of the time indicator
                // Let's start with the most specific match first
                var ts1Matches = timeIndicator.match(timestampPattern1);
                if (ts1Matches && ts1Matches.length > 0) {
                    // Construct the time string in such a manner that it can be parse by the momentJS library
                    // We use the format YY-MMM-DD hh:mm:ss.sTZD
                    var momentString = ts1Matches[8] + '-' + ts1Matches[7] + '-' + ts1Matches[6] + ' '
                        + ts1Matches[1] + ':' + ts1Matches[2] + ':' + ts1Matches[3] + '.' +
                        ts1Matches[4] + timezoneLookup.lookup[ts1Matches[5]];
                    // Try to parse the timezone
                    try {
                        dateToReturn = moment(momentString, 'YY-MMM-DD HH:mm:ss.SSZ');
                    } catch (error) {
                        logger.error('Error trying to convert time indicator into full timestamp: ' + timeIndicator);
                        logger.error(error);
                    }
                } else {
                    // Try the second timestamp pattern
                    var ts2Matches = timeIndicator.match(timestampPattern2);
                    if (ts2Matches && ts2Matches.length > 0 && timestamp) {

                        // Since this is just a time update, we need to get update the time on the incoming timestamp
                        // by first creating a clone of it
                        dateToReturn = timestamp.clone();

                        try {
                            // Now set the hours, minutes, seconds and milliseconds
                            dateToReturn.set('hour', parseInt(ts2Matches[1]))
                            dateToReturn.set('minute', parseInt(ts2Matches[2]))
                            dateToReturn.set('second', parseInt(ts2Matches[3]))
                            dateToReturn.set('ms', parseInt(ts2Matches[4] + '0'))
                        } catch (error) {
                            logger.error('Error caught trying to update cloned timestamp with ' + timeIndicator);
                            logger.error(error);
                        }
                    }
                }
            }
        }
    } else {
        // Check to see if the file is a .log file
        if (fileType == 'log') {
            logger.trace('file type is .log');

            // Set up some pattern matching expressions
            var timestampPattern1 = new RegExp(/^@(\D+)(\d+\.\d+)/);
            var timestampPattern2 = new RegExp(/^@(\d+\.\d+)(\D+)/);

            // Look for the timestamp indicator '@' (decimal 64) in the first byte
            if (completeLineBuffer[0] === 64) {
                logger.trace('Line starts with @');
                // Try to match on the first timestamp pattern
                var ts1Matches = completeLineBuffer.toString().match(timestampPattern1);
                if (ts1Matches && ts1Matches.length > 0) {

                    // Create the date in the local timezone of the server
                    dateToReturn = moment.unix(Number(ts1Matches[2]));
                } else {
                    // Try the second timestamp pattern
                    var ts2Matches = completeLineBuffer.toString().match(timestampPattern2);
                    if (ts2Matches && ts2Matches.length > 0) {

                        // Create the date in the local timezone of the server
                        dateToReturn = moment.unix(Number(ts2Matches[1]));
                    }
                }
            } else if (completeLineBuffer[0] === 43) {
                logger.trace('Time increment found');
                // This means we found a time increment, so grab the number of ticks
                var numberOfTicks = 1;
                if (completeLineBuffer.slice(1) && completeLineBuffer.slice(1).length > 0) {
                    numberOfTicks = parseInt(completeLineBuffer.slice(1));
                }

                // OK, now with # of ticks, calculate the seconds to add to the last timestamp
                var millisToAdd = parseInt((numberOfTicks / numberOfTicksPerSecond) * 1000);
                logger.trace('Will add ' + millisToAdd + ' milliseconds')
                dateToReturn = moment(timestamp.valueOf() + millisToAdd);
            }
        }
    }

    // Return the updated date
    return dateToReturn;
}

/**
 * This function takes in several parameters and tries to determine 
 * which actor wrote the line in the log file
 * @param {*} fileType This is either 'out' or 'log'
 * @param {*} completeLineBuffer Is the Buffer to search for actors in
 * @param {*} previousActor Is the last actor to have written a line
 * @param {*} actorLegend Is a legend that is used in .log files to track actors in a efficient way
 */
function findActor(fileType, completeLineBuffer, actorLegend) {

    // Just set to previous actor
    var actorToReturn;

    // If the file type is .out, use pattern matching to look for an actor
    if (fileType && fileType == 'out') {

        // This is a regular expression that is used for .out files
        var currentActorPattern = new RegExp(/<(\S+)>/);

        // Look for a pattern match
        var actorMatch = completeLineBuffer.toString('ascii').match(currentActorPattern);
        if (actorMatch && actorMatch.length > 0) {
            actorToReturn = actorMatch[1];
        }
    }

    // Now look for actor if it's a .log file
    if (fileType && fileType == 'log') {
        // Check to see if the line is an update for the actor legend
        if (completeLineBuffer.toString().startsWith('=') && completeLineBuffer.toString().length > 2) {
            actorLegend[completeLineBuffer.toString().charAt(1)] = completeLineBuffer.toString().substring(2);
            logger.trace('New actor legend ' + completeLineBuffer.toString().charAt(1) + ' => ' +
                actorLegend[completeLineBuffer.toString().charAt(1)])
        }

        // See if the actor is defined in the line. Start by checking 
        // to make sure the buffer is more than two bytes
        if (completeLineBuffer && completeLineBuffer.length > 2) {
            // Check to see if the second byte is a quote.
            if (completeLineBuffer[1] === 34) {
                // Create an array and fill with characters until the next quote
                var actorBuffer = [];
                for (var i = 2; i < completeLineBuffer.length; i++) {
                    if (completeLineBuffer[i] === 34) {
                        break;
                    } else {
                        actorBuffer.push(completeLineBuffer[i]);
                    }
                }
                actorToReturn = (new Buffer(actorBuffer)).toString();
            } else {
                // If the first character is not a '\' and the second matches a 
                // key in the actor legend, set the actor
                if (!completeLineBuffer.toString().startsWith('@') &&
                    !completeLineBuffer.toString().startsWith('\\') &&
                    actorLegend[String.fromCharCode(completeLineBuffer[1])]) {
                    actorToReturn = actorLegend[String.fromCharCode(completeLineBuffer[1])];
                }
            }
        }
    }

    // Now return the actor
    return actorToReturn;
}

/**
 * This method takes in the type of file being parsed, the buffer line and
 * the JSON object that contains the lookup of actors and then returns just
 * the Buffer that has the body of the message
 * @param {string} fileType 
 * @param {Buffer} completeLineBuffer 
 * @param {Object} actorLegend 
 */
function getMessageBody(fileType, completeLineBuffer, actorLegend) {

    // The message body to return
    var messageBody;

    // If the file is a .out file
    if (fileType == 'out') {
        // Convert the buffer to a string
        var tempString = completeLineBuffer.toString();

        // Just remove the stuff before the first space in the string
        messageBody = Buffer.from(tempString.substring(tempString.indexOf(' ') + 1));
    } else {
        if (fileType == 'log') {
            // Assign the whole buffer to start
            messageBody = completeLineBuffer;

            // First, look for any special characters that we need to remove from the
            // front of the bugger
            if (completeLineBuffer[0] === 33 ||
                completeLineBuffer[0] === 35 ||
                completeLineBuffer[0] === 126 ||
                completeLineBuffer[0] === 96 ||
                completeLineBuffer[0] === 46) {
                // Remove the first character
                messageBody = completeLineBuffer.slice(1);
            }

            // Check to make sure the buffer is more than one byte
            if (messageBody && messageBody.length > 1) {

                // Check to see if the first byte is a quote.
                if (messageBody[0] === 34) {
                    var quoteLength = 1;
                    // Search for second quote
                    for (var i = 1; i < messageBody.length; i++) {
                        quoteLength++;
                        if (messageBody[i] === 34) {
                            break;
                        }
                    }
                    // Now strip off the quoted part
                    messageBody = messageBody.slice(quoteLength);
                } else {
                    // Check to see if the first byte, defines an actor
                    if (actorLegend[String.fromCharCode(messageBody[0])]) {
                        messageBody = messageBody.slice(1);
                    }
                }

                // Now remove any leading backslashes
                if (messageBody[0] === 92) messageBody = messageBody.slice(1);
            }
        }
    }

    // Return the message body
    return messageBody;
}

// This is a function that looks for an error message in the given line and will return an object with
// a 'message' property and a 'subject' property if an error is found.  It will return nothing if no
// error was found
function lookForError(line, timestamp) {
    // The handle that will be returned (defaults to nothing)
    var errorToReturn;

    // Error parsing pattern
    var errorPattern = new RegExp(/.*BadNews.email\s+\"(.*)\",.*Subject.*\"(.*)\"/);

    // Try to pattern match for the error
    var errorMatches = line.match(errorPattern);
    if (errorMatches && errorMatches.length > 0) {
        logger.debug('Found error in line: ' + line);
        errorToReturn = {
            'timestamp': timestamp.valueOf(),
            'subject': errorMatches[2],
            'message': errorMatches[1]
        }
    }

    // Return the result
    return errorToReturn;
}

// A helper function to parse ancillary data payloads
function parseAncillaryDataPayload(timestamp, source, hour, minute, second, payloadString) {
    // logger.debug('Payload string: ' + payloadString);

    // Here is the regular expression that will be used to look for variables and data
    var ancDataVariablePattern = new RegExp(/^(-*\d+\.*\d*)(.*)$/);

    // An object to return
    var parseResults = {
        source: source,
        data: {}
    };

    // Clone the timestamp of the line because we might have to adjust the time based
    // on the hours, minutes, and seconds that were in the ancillary data itself
    var dataTimestamp = timestamp.clone();

    // Now set the hours, minutes and seconds using the incoming data
    dataTimestamp.hour(hour);
    dataTimestamp.minute(minute);
    dataTimestamp.second(second);
    dataTimestamp.millisecond(0);

    // Now make sure new timestamp isn't later than the line timestamp which would be
    // impossible. If it is, that means I need to roll a day backwards
    if (dataTimestamp.hour() - timestamp.hour() > 20) {
        logger.debug('It appears that the hour on the timestamp on the ancillary data is ');
        logger.debug('larger than that of the timestamp of the line itself. This most likely');
        logger.debug('means that the ancillary data was taken just before midnight, but');
        logger.debug('it was not written to the log file until after midnight, so we need to');
        logger.debug('adjust the day back by one after setting the new hour');
        logger.debug('Incoming hours:minutes:seconds: ' + hour + ':' + minute + ':' + second);
        logger.debug('Line timestamp: ' + timestamp.format());
        logger.debug('Ancillary timestamp: ' + dataTimestamp.format());
        // Now roll the day back
        dataTimestamp.subtract(1, 'day');
        logger.debug('Ancillary after correction: ' + dataTimestamp.format());
    }
    // logger.debug('After update from Can entry: ' + dataTimestamp.format('YYYY-MM-DD HH:mm:ss'));
    parseResults['timestamp'] = dataTimestamp.valueOf();

    // First split the string by commas
    var payloadVariables = payloadString.split(',');

    // Make sure we have something to loop over
    if (payloadVariables && payloadVariables.length > 0) {
        // Loop over the variables
        for (var i = 0; i < payloadVariables.length; i++) {
            // Grab the entry and trim off any whitespace
            var variableEntry = payloadVariables[i].trim();

            // Try to match the payload item to extract values and units
            var variableMatcher = variableEntry.match(ancDataVariablePattern);
            if (variableMatcher && variableMatcher.length > 0) {
                var units = variableMatcher[2];
                // Remove any quotes from units
                units = units.replace('"', '');
                // Remove any trailing backslashes
                units = units.replace(/\\$/, "");
                parseResults['data'][units] = Number(variableMatcher[1]);
            }
        }
    }

    // Return the results
    return parseResults;
}

// This function takes in a raw line from the .out file and looks for text that 
// contains data points from the sensors in the ESP Can itself.  If one is found
// a JSON object with that data is return. If nothing is found, nothing is returned
function parseCanAncillaryDataFromLine(line, timestamp) {

    // A handle to the object that will be returned that might have Can data attached
    // to it
    var canData;

    // For Can data, we have to watch out for a couple of ways it can be listed in the
    // file.  It can be part of an email message, or just by itself.  Let's see if
    // we can find it in the email form first since it is a more specific case. Here
    // is the pattern we will use to look for that entry
    var canEmailDataPattern = new RegExp(/.*Can@(\d+):(\d+):(\d+), (.*)\",Subject.*/);

    // Create a matcher from the incoming line
    var canEmailDataMatcher = line.match(canEmailDataPattern);

    // Check to see if a match occurred
    if (canEmailDataMatcher && canEmailDataMatcher.length > 0) {
        logger.debug('Found ancillary can data in email line: ' + line);

        // Using the extracted timestamp from the Can sensor and the payload, call a method to
        // construct a data object to return
        canData = parseAncillaryDataPayload(timestamp, 'Can', canEmailDataMatcher[1], canEmailDataMatcher[2],
            canEmailDataMatcher[3], canEmailDataMatcher[4]);
    } else {

        // Since no match looking for can data in an email, let's look for it without being in an email.
        // Here is the pattern we will use to look for a match
        var canDataPattern = new RegExp(/.*Can@(\d+):(\d+):(\d+),(.*)$/);

        // Now create a matcher using the incoming line
        var canDataMatcher = line.match(canDataPattern);

        // Check for successful match
        if (canDataMatcher && canDataMatcher.length > 0) {

            // Call the method to parse the timstampe and payload into a data point        
            canData = parseAncillaryDataPayload(timestamp, 'Can', canDataMatcher[1], canDataMatcher[2],
                canDataMatcher[3], canDataMatcher[4]);
        }
    }

    // Return the object
    return canData;
}

// This function takes in a raw line from the .out file and looks for text that 
// contains data points from the attached CTD itself.  If one is found a JSON 
// object with that data is return. If nothing is found, nothing is returned
function parseCTDAncillaryDataFromLine(line, timestamp) {

    // A handle to the object that will be returned that might have CTD data attached
    // to it
    var ctdData;

    // For CTD data, we have to watch out for a couple of ways it can be listed in the
    // file.  It can be part of an email message, or just by itself.  Let's see if
    // we can find it in the email form first since it is a more specific case. Here
    // is the pattern we will use to look for that entry
    var ctdEmailDataPattern = new RegExp(/.*CTD@(\d+):(\d+):(\d+), (.*)\",Subject.*/);

    // Create a matcher from the incoming line
    var ctdEmailDataMatcher = line.match(ctdEmailDataPattern);

    // Check to see if a match occurred
    if (ctdEmailDataMatcher && ctdEmailDataMatcher.length > 0) {
        logger.debug('Found ancillary CTD data in email line: ' + line);

        // Using the extracted timestamp from the CTD and the payload, call a method to
        // construct a data object to return
        ctdData = parseAncillaryDataPayload(timestamp, 'CTD', ctdEmailDataMatcher[1], ctdEmailDataMatcher[2],
            ctdEmailDataMatcher[3], ctdEmailDataMatcher[4]);
    } else {

        // Since no match looking for CTD data in an email, let's look for it without being in an email.
        // Here is the pattern we will use to look for a match
        var ctdDataPattern = new RegExp(/.*CTD@(\d+):(\d+):(\d+),(.*)$/);

        // Now create a matcher using the incoming line
        var ctdDataMatcher = line.match(ctdDataPattern);

        // Check for successful match
        if (ctdDataMatcher && ctdDataMatcher.length > 0) {
            logger.debug('Found ancillary CTD data in non-email line: ' + line);

            // Call the method to parse the timstampe and payload into a data point        
            ctdData = parseAncillaryDataPayload(timestamp, 'CTD', ctdDataMatcher[1], ctdDataMatcher[2],
                ctdDataMatcher[3], ctdDataMatcher[4]);
        }
    }

    // Return the object
    return ctdData;
}

// This function takes in a raw line from the .out file and tries to find an
// entry that contains a data point from one of the ancillary data sources.
// If one is found, it returns a JSON object with that data point, otherwise
// it returns nothing.
function parseAncillaryDataFromLine(line, timestamp) {
    // The ancillary data handle to return
    var ancillaryDataEntry;

    // First look for Can data
    ancillaryDataEntry = parseCanAncillaryDataFromLine(line, timestamp);

    // If not found, look for CTD data
    if (!ancillaryDataEntry) {
        ancillaryDataEntry = parseCTDAncillaryDataFromLine(line, timestamp);
    }

    // Now return the entry
    return ancillaryDataEntry;
}

// This function looks for ancillary data to return, since a single line can contain
// ancillary data from more than one source (i.e. Can and/or CTD), this functions
// returns an array of JSON objects containing ancillary data.
function lookForAncillaryDataPoints(line, timestamp) {

    // The handle that will be returned (defaults to nothing)
    var ancillaryDataToReturn = [];

    // Let's first see if there is any indication that the line might contain ancillary data
    if (line.indexOf('Can@') >= 0 || line.indexOf('CTD@') >= 0 || line.indexOf('ISUS@') >= 0) {
        // The first thing we need to do is figure out if the line is actually made up
        // of multiple lines separated by \n.
        var lineSeparator;

        // Depending on the configuration of the log file writer, there can be several
        // line separators.  They can be '\', '\n' or '\\n' so let's start with the most
        // specific
        if (line.indexOf('\\n') >= 0) {
            lineSeparator = '\\n';
        } else {
            if (line.indexOf('\n') >= 0) {
                lineSeparator = '\n';
            } else {
                if (line.indexOf('\\') >= 0) {
                    lineSeparator = '\\';
                }
            }
        }

        // If we have a line separator, try to split the line into separate entries
        if (lineSeparator) {
            var lineSplitOnNewLines = line.split(lineSeparator);

            // Now iterate over that array of lines to look for ancillary data
            for (var i = 0; i < lineSplitOnNewLines.length; i++) {
                var parsedAncillaryData = parseAncillaryDataFromLine(lineSplitOnNewLines[i], timestamp);
                if (parsedAncillaryData) {
                    ancillaryDataToReturn.push(parsedAncillaryData);
                }
            }
        }
    }

    // Now return it
    return ancillaryDataToReturn;
}

// This function looks to see if the line indicates the start of any protocol runs.
function lookForProtocolRunStart(line, timestamp) {

    // The protocol run to return
    var protocolRunStart;

    // Debug to indicate might have protocol run
    if (line.indexOf('sampling at most') >= 0) {
        logger.debug('Possible protocol start line:');
        logger.debug(line);
    }
    // This is the regular expression we will use to look a protocol runs in out files
    var protocolRunStartPattern = new RegExp(/^(.*)\s+sampling at most (\d+\.*\d*)ml\s*$/);

    // This is the regular expression to indicate a follow on WCR
    var wcrRunStartPattern = new RegExp(/^\S+\s+(.*)Whole\s+Cell\s+Archive\s+sampling\s+(\d+\.*\d*)ml/);

    // Look for the normal protocol run start expression
    var protocolRunStartMatch = line.match(protocolRunStartPattern);
    if (protocolRunStartMatch && protocolRunStartMatch.length > 0) {
        // First thing to check is to make sure we strip off any actor definition from the protocol name
        var protocolName = protocolRunStartMatch[1].trim();
        if (protocolName.indexOf('>') >= 0) {
            protocolName = protocolName.substring(protocolName.indexOf('>'));
        }
        protocolRunStart = {
            'timestamp': timestamp.valueOf(),
            'name': protocolName,
            'targetVol': Number(protocolRunStartMatch[2])
        };

    } else {
        // Look for the WCR expression
        var wcrRunMatch = line.match(wcrRunStartPattern);
        if (wcrRunMatch && wcrRunMatch.length > 0) {
            protocolRunStart = {
                'timestamp': timestamp.valueOf(),
                'name': 'wcr',
                'targetVol': Number(wcrRunMatch[2])
            };
        }
    }

    // Return the result
    return protocolRunStart;
}

// This function looks to see if the line indicates the start of a sample
function lookForSampleStart(line, timestamp) {
    // The sample start info
    var sampleStart;

    // This is the regular expression to use to look for a sample start
    if (line.indexOf(' Sampling') >= 0) {
        logger.debug('Possible sample start line:');
        logger.debug(line);
    }
    var sampleStartPattern = new RegExp(/Sampling\s+(\d+\.*\d*)ml.*$/);

    // Try to match to the incoming line
    var sampleStartMatch = line.match(sampleStartPattern);
    if (sampleStartMatch && sampleStartMatch.length > 0) {
        sampleStart = {
            'timestamp': timestamp.valueOf(),
            'targetVolume': Number(sampleStartMatch[1])
        }
    }
    // Return the result
    return sampleStart;
}

// This function looks to see if the line indicates the end of a sample
function lookForSampleEnd(line, timestamp) {
    // The sample end info
    var sampleEnd;

    // This is the regular expression used to look for sample end
    if (line.indexOf('Sampled') >= 0) {
        logger.debug('Possible sample end line:');
        logger.debug(line);
    }
    var sampleStopPattern = new RegExp(/Sampled\s+(\d+\.*\d*)ml.*$/);

    // Try to match to incoming line
    var sampleStopMatch = line.match(sampleStopPattern);
    if (sampleStopMatch && sampleStopMatch.length > 0) {
        sampleEnd = {
            'timestamp': timestamp.valueOf(),
            'actualVolume': Number(sampleStopMatch[1])
        }
    }

    // Return the result
    return sampleEnd;
}

// This function looks to see if the line indicates an image
function lookForImage(line, timestamp) {
    // The image info
    var image;

    // Remove any newlines first
    var lineWithoutNewlines = line.replace(/\n/g, ' ');

    // The regular expression to search for images
    if (lineWithoutNewlines.indexOf('image') >= 0) {
        logger.debug('Possible image line:');
        logger.debug(lineWithoutNewlines);
    }
    var imagePattern = new RegExp(/Exposing\s+(\d+)x(\d+)\s+pixel\s+(\d+)-bit\s+image\s+for\s+(\d+\.*\d*)\s+seconds\\*\s*(.*)\/([a-zA-Z0-9#]+\.tif)/);

    // Try to match to incoming line
    var imageMatch = lineWithoutNewlines.match(imagePattern);
    if (imageMatch && imageMatch.length > 0) {
        image = {
            'timestamp': timestamp.valueOf(),
            'xPixels': Number(imageMatch[1]),
            'yPixels': Number(imageMatch[2]),
            'bits': Number(imageMatch[3]),
            'exposure': Number(imageMatch[4]),
            'imageFilename': imageMatch[6],
            'fullImagePath': imageMatch[5] + '/' + imageMatch[6]
        }
    }

    // Return the result
    return image;
}

// This method takes in a buffer and parses for information and attaches to the parsedObject if found
function parseLine(parsedObject, completeLineBuffer, timestamp, lineNumber, currentActor, remoteDataDirectory) {

    // Convert the line into a string
    var line = completeLineBuffer.toString();

    // OK, so we have an accurate date and time of the incoming log line, let's run through the
    // test to parse the line
    var error = lookForError(line, timestamp);
    if (error) {
        // Add the timestamp and add to the parsed object
        parsedObject['errors'][error['timestamp']] = {
            'actor': currentActor,
            'subject': error['subject'],
            'message': error['message']
        }
        logger.debug('Line ' + lineNumber + ' contains an error: ' + line);
        logger.debug(JSON.stringify(parsedObject['errors'][error['timestamp']], null, 2));
    } else {
        // Look for ancillary data (can be more than one entry in a line so we get back an array)
        var ancillaryDataPoints = lookForAncillaryDataPoints(line, timestamp);
        if (ancillaryDataPoints && ancillaryDataPoints.length > 0) {
            logger.debug('Line ' + lineNumber + ' contains ancillary data: ' + line);
            // Loop over the array of ancillary data points
            for (var i = 0; i < ancillaryDataPoints.length; i++) {
                // Grab the data point
                var dataPoint = ancillaryDataPoints[i];
                logger.debug(dataPoint);

                // We need to look at each entry of the data point and make sure we register
                // that there is this type of data for each point on the parsed object.
                var dataPointSource = dataPoint['source'];
                logger.trace('dataPointSource = ' + dataPointSource);

                // Grab the keys of the data object which are the units of each data point
                var unitKeys = Object.keys(dataPoint['data']);

                // Now loop over those unit keys
                for (var j = 0; j < unitKeys.length; j++) {
                    logger.trace('unitKey = ' + unitKeys[j]);
                    // Check to see if the ancillary data lookup on the parsed object
                    // contains an entry for this source-unit combination
                    if (parsedObject['ancillaryData'] &&
                        parsedObject['ancillaryData'][dataPointSource] &&
                        parsedObject['ancillaryData'][dataPointSource][unitKeys[j]]) {
                        logger.trace('Entry for ' + dataPointSource + '->' + unitKeys[j] + ' is already on parsed object');
                    } else {
                        // Need to add it from the lookup
                        if (!parsedObject['ancillaryData'][dataPointSource]) parsedObject['ancillaryData'][dataPointSource] = {};
                        parsedObject['ancillaryData'][dataPointSource][unitKeys[j]] = ancillaryDataLookup[dataPointSource][unitKeys[j]];
                    }
                }
                // Make sure there is an object for the source
                if (!parsedObject['ancillaryDataPoints'][ancillaryDataPoints[i]['source']]) {
                    parsedObject['ancillaryDataPoints'][ancillaryDataPoints[i]['source']] = {};
                }
                // Now add the data using timestamp as key (if it's not there already)
                if (!parsedObject['ancillaryDataPoints'][ancillaryDataPoints[i]['source']][ancillaryDataPoints[i]['timestamp']]) {
                    parsedObject['ancillaryDataPoints'][ancillaryDataPoints[i]['source']][ancillaryDataPoints[i]['timestamp']] = ancillaryDataPoints[i]['data'];
                } else {
                    logger.debug('Line ' + lineNumber + ': ' + ancillaryDataPoints[i]['source'] + ' data at ' + moment.unix(ancillaryDataPoints[i]['timestamp'] / 1000).format() + ' already parsed, will skip');
                }
            }
        } else {
            // Let's see if the line indicates the start of a protocol(s)
            var protocolRunStart = lookForProtocolRunStart(line, timestamp);
            if (protocolRunStart) {
                // // Add the protocol run start to the list of protocol runs
                parsedObject['protocolRuns'][protocolRunStart['timestamp']] = {
                    'actor': currentActor,
                    'name': protocolRunStart['name'],
                    'targetVol': protocolRunStart['targetVol']
                };
                logger.debug('Line ' + lineNumber + ' contains a procotocol start: ' + line);
                logger.debug(JSON.stringify(parsedObject['protocolRuns'][protocolRunStart['timestamp']], null, 2));
            } else {
                // Let's look for sample start
                var sampleStart = lookForSampleStart(line, timestamp);
                if (sampleStart) {
                    // Add a sample indexed by start time
                    parsedObject['samples'][sampleStart['timestamp']] = {
                        'actor': currentActor,
                        'targetVolume': sampleStart['targetVolume']
                    }
                    logger.debug('Line ' + lineNumber + ' contains a sample start' + line);
                    logger.debug(JSON.stringify(parsedObject['samples'][sampleStart['timestamp']], null, 2));
                } else {
                    // Let's look for the end of a sample
                    var sampleEnd = lookForSampleEnd(line, timestamp);
                    if (sampleEnd) {
                        // We need to find the most recent sample that was started so we can complete it
                        // Grab all the timestamp keys
                        var timestamps = Object.keys(parsedObject['samples']);
                        if (timestamps && timestamps.length > 0) {
                            // Sort the timestamps
                            timestamps.sort();
                            // Grab the most recent timestamp
                            var lastestSampleTimestamp = timestamps[timestamps.length - 1];
                            var latestSample = parsedObject['samples'][lastestSampleTimestamp];
                            if (latestSample && !latestSample['actualVolume']) {
                                parsedObject['samples'][lastestSampleTimestamp]['actualVolume'] = sampleEnd['actualVolume'];
                                parsedObject['samples'][lastestSampleTimestamp]['endts'] = Number(sampleEnd['timestamp']);
                                logger.debug('Line ' + lineNumber + ' contains a sample end: ' + line);
                                logger.debug(JSON.stringify(parsedObject['samples'][lastestSampleTimestamp], null, 2));
                            } else {
                                //logger.error('Either could not find latest sample or it already has actualVolume!');
                            }
                        } else {
                            //logger.error('Recording a sample end, but I do not have any started samples!');
                        }
                    } else {
                        // Look for an image
                        var image = lookForImage(line, timestamp);
                        if (image) {

                            // Let's first check and see if the remote directory is defined in as that will help us
                            // build local paths to the file if it was downloaded
                            if (remoteDataDirectory) {
                                logger.debug('remote data directory is ' + remoteDataDirectory);

                                // Get the length of the remote file path
                                var remoteDataDirectoryLength = remoteDataDirectory.length;
                                logger.debug('Remote data directory length is ' + remoteDataDirectoryLength);
                                logger.debug('fullImagePath is ' + image['fullImagePath']);

                                // Use the length of the remote path to grab just the relative path of the image on the
                                // remote host
                                var remoteRelativeImagePath = image['fullImagePath'].substring(remoteDataDirectoryLength + 1);
                                image['relativePath'] = remoteRelativeImagePath;
                            }

                            parsedObject['images'][image['timestamp']] = JSON.parse(JSON.stringify(image));
                            logger.debug('Line ' + lineNumber + ' contains and image: ' + line);
                            logger.debug(JSON.stringify(parsedObject['images'][image['timestamp']], null, 2));
                        }
                    }
                }
            }
        }
    }
}

// This function takes in a CVS file and parses out the ancillary data from it and attaches
// it to the supplied object.
function parseCSVFile(parsedObject, fileToParse) {

    // The first thing to do is figure out what the source is and for now, we will
    // just use the name of the file as the source
    var source;
    if (path.basename(fileToParse) == 'CTD.csv') {
        source = 'CTD'
    }

    // If a source was determined, parse the file
    if (source) {

        // Import the parser
        var parse = require('csv-parse/lib/sync');

        // Read all the records into memory
        const records = parse(fs.readFileSync(fileToParse));
        logger.debug('Records read from file');
        logger.debug(records);

        // Let's grab the first row
        var firstRow = records[0];

        // Loop over the entries, looking for timestamp header
        var timestampColumn;
        var timestampHeader;
        for (var i = 0; i < firstRow.length; i++) {
            // Look for the DOY (Day of year)
            if (firstRow[i] == 'Epoch seconds' ||
                firstRow[i] == 'Epoch millis' ||
                firstRow[i] == 'Date') {
                timestampColumn = i;
                timestampHeader = firstRow[i];
                logger.debug('I think timestamp column is ' + i + ' with header ' + firstRow[i]);
                break;
            }
        }

        // Check to see if we think we found timestamp column
        if (timestampColumn >= 0) {

            // OK, we think we have timestamp column, let's iterate over the data rows
            for (var i = 1; i < records.length; i++) {
                // Grab the row
                var record = records[i];

                // Grab the timestamp first
                var timestamp;
                if (timestampHeader == 'Epoch seconds') {
                    try {
                        timestamp = moment.unix(Number(record[timestampColumn]));
                    } catch (err) {
                        logger.warn('Error caught trying to convert from epoch seconds to date: ' + record[timestampColumn]);
                        logger.warn(err);
                    }
                } else if (timestampHeader == 'Epoch millis') {
                    try {
                        timestamp = moment(Number(record[timestampColumn]));
                    } catch (err) {
                        logger.warn('Error caught trying to convert from epoch millis to date: ' + record[timestampColumn]);
                        logger.warn(err);
                    }
                } else if (timestampHeader == 'Date') {
                    try {
                        timestamp = moment(record[timestampColumn]);
                    } catch (err) {
                        logger.warn('Error caught trying to convert from iso to date: ' + record[timestampColumn]);
                        logger.warn(err);
                    }
                }

                // Now iterate over the columns
                if (timestamp) {
                    logger.trace('Timestamp for row ' + i + ' is ' + timestamp.format());
                    for (var j = 0; j < record.length; j++) {
                        if (j != timestampColumn) {
                            // Grab the header of the row
                            var columnHeader = records[0][j];

                            // Grab the var name and the units
                            var varUnitsRegExp = new RegExp(/.*\((.*)\)/);

                            // Create a matcher
                            var varUnitsMatcher = columnHeader.match(varUnitsRegExp);

                            // Check to see if a match occurred
                            if (varUnitsMatcher && varUnitsMatcher.length > 0) {
                                var units = varUnitsMatcher[1].trim();

                                // Now that I have the units, I need to first make sure the incoming
                                // parsed object has the right lookup for this ancillary data attached
                                if (parsedObject['ancillaryData'] &&
                                    parsedObject['ancillaryData'][source] &&
                                    parsedObject['ancillaryData'][source][units]) {
                                    logger.trace('Entry for ' + source + '->' + units + ' is already on parsed object');
                                } else {
                                    // Need to add it from the lookup
                                    if (!parsedObject['ancillaryData'][source]) parsedObject['ancillaryData'][source] = {};
                                    parsedObject['ancillaryData'][source][units] = ancillaryDataLookup[source][units];
                                }

                                // Make sure there is an object for the source
                                if (!parsedObject['ancillaryDataPoints'][source]) {
                                    parsedObject['ancillaryDataPoints'][source] = {};
                                }
                                // Now add the data using timestamp as key (if it's not there already)
                                if (!parsedObject['ancillaryDataPoints'][source][timestamp.valueOf()]) {
                                    parsedObject['ancillaryDataPoints'][source][timestamp.valueOf()] = {};
                                }

                                // Now add the data
                                parsedObject['ancillaryDataPoints'][source][timestamp.valueOf()][units] = Number(record[j]);
                            }
                        }
                    }
                    logger.trace('Added data point at time ' + timestamp.format());
                    logger.trace(parsedObject['ancillaryDataPoints'][source][timestamp.valueOf()]);
                }
            }
        } else {
            logger.warn('Could not find a timestamp column in ' + fileToParse);
        }
    }
}

// This function parses a file synchronously and returns a JSON object with all 
// the parsed data attached
function parseFileSync(fileToParse, remoteDataDirectory, numberOfTicksPerSecond) {

    // Set the number of ticks per second
    var logFileNumberOfTicksPerSecond = Number(numberOfTicksPerSecond) || 100;

    // This is an object where the parsed data will be stored
    var parsedObject = {
        protocolRuns: {},
        samples: {},
        images: {},
        errors: {},
        ancillaryData: {},
        ancillaryDataPoints: {}
    }

    // Let's make sure the file exists first
    if (fs.existsSync(fileToParse)) {
        logger.debug('Will parse file ' + fileToParse);

        // First determine which type of file is being parsed, a .out or a .log
        var fileType;
        if (fileToParse.endsWith('.log')) fileType = 'log';
        if (fileToParse.endsWith('.out')) fileType = 'out';
        if (fileToParse.endsWith('.csv')) fileType = 'csv';
        logger.debug('File being parsed is of type ' + fileType);

        // Make sure we found a file type
        if (fileType && (fileType == 'log' || fileType == 'out')) {

            // This is an array of line segments used to concatenate multiline entries in .log files
            var lineSegments = [];

            // This is a variable to use to track multiline entries in .out files
            //var previousLine;

            // This is the Moment object that contains the most recent date and time parsed
            var previousTimestamp;

            // This variable holds the most recent line read
            var line;

            // This variable holds the number of the most recent line read
            var lineNumber = 0;

            // The is an object that keeps track of the current actor aliases that are used
            // in .log files to keep track of actors in an efficient way
            var actorLegend = {};

            // This is a variable that holds the most recent actor
            var currentActor = '';

            // read contents of the file
            const data = fs.readFileSync(fileToParse, 'UTF-8');

            // // split the contents by new line
            const lines = data.split(/\n/);
            logger.debug('readSync give a grand total of ' + lines.length + ' lines');

            // This is a flag to indicate the the line segments contain everything to be parsed
            var readyToParseBuffer = false;

            // Loop over file line by line
            lines.forEach((lineString) => {
                // Convert to Buffer
                var line = Buffer.from(lineString);

                // First, bump the line number
                lineNumber++;
                logger.trace('Line ' + lineNumber + ': ' + line.toString('ascii'));

                // Before we actually parse information out of a line from a log file, we need 
                // to determine if the current line indicates a completion of a line
                // read.  This is important because log files can contain multi-line entries
                // and the way we look for them is different depending on the file type
                if (fileType == 'out') {

                    // If the current line starts with a '@', that means the previous line
                    // is complete and is ready for parsgin
                    if (!line.toString('ascii').startsWith('@')) {
                        lineSegments.push(line);
                    } else {
                        // Set the flag that the line buffer is ready to parse
                        readyToParseBuffer = true;
                    }
                } else {
                    if (fileType == 'log') {
                        // Push the line on the segment array
                        lineSegments.push(line);

                        // If there is no line continuation at the end of the line, we
                        // are done reading all line segments
                        if (line[line.length - 1] !== 92) {
                            readyToParseBuffer = true;
                        }
                    }
                }

                // Now check to see if the ready to parse flag is set
                if (readyToParseBuffer) {

                    // Grab the complete buffer from the segments
                    var completeLineBuffer = Buffer.concat(lineSegments);
                    logger.trace('Ready to parse line ' + lineNumber + ': ' + completeLineBuffer.toString());

                    // First thing to do is see if the line has any indication of a timestamp update
                    var newTimestamp = updateTimestamp(fileType, completeLineBuffer, previousTimestamp, logFileNumberOfTicksPerSecond);
                    if (newTimestamp) {
                        logger.trace('Timestamp was updated to ' + newTimestamp.format());
                        previousTimestamp = newTimestamp;
                    }

                    // Now try to find if there is an actor specified in the given line
                    var actorFromLine = findActor(fileType, completeLineBuffer, actorLegend);
                    if (actorFromLine) {
                        currentActor = actorFromLine;
                        logger.trace('Actor set to ' + currentActor);
                    }

                    // Now that we have the full line, the timestamp and the actor, let's strip off the front part of the line and
                    // just get the body of the message to parse.
                    var messageBody = getMessageBody(fileType, completeLineBuffer, actorLegend);
                    logger.trace('Extracted message body was ' + messageBody.toString());

                    // Call the method to parse the line into the data object
                    parseLine(parsedObject, messageBody, previousTimestamp, lineNumber, currentActor, remoteDataDirectory);

                    // Now reset the line buffer depending on the file type
                    if (fileType == 'out') {
                        lineSegments = [line];
                    } else {
                        if (fileType == 'log') {
                            lineSegments = [];
                        }
                    }

                    // Reset the flag to parse the line buffer.
                    readyToParseBuffer = false;
                }
            });

            // Becuase in .out files, we had to read a line ahead before knowing if the line was complete,
            // that leaves the last buffer un-parsed, so let's parse it
            if (fileType == 'out') {
                var completeLineBuffer = Buffer.concat(lineSegments);
                logger.trace('Parsing last line of .out file ' + lineNumber + ': ' + completeLineBuffer.toString());
                // TODO kgomes - finish parsing this, it's not done
            }

        } else {
            // Not a log or out file, check for csv
            if (fileType == 'csv') {
                logger.debug('The file is a CSV file and will try to parse out data');
                parseCSVFile(parsedObject, fileToParse);
            } else {
                logger.warn('A file type could not be determined for file ' + fileToParse);
            }
        }
    } else {
        logger.warn('File submitted (' + fileToParse + ') does not exist');
    }

    // Now return the parsed object
    return parsedObject;
}

// Export an object that represents the OutParser 'instance'
module.exports = {
    setLogDirectory: setLogDirectory,
    setLogLevel: setLogLevel,
    setAncillaryDataLookup: setAncillaryDataLookup,
    parseFileSync: parseFileSync
}