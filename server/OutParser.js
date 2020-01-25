/*
 * This is a module (CommonJS format) that is responsible for dealing with .out files.  
 * .out files are basically log files from the ESP but have been run through the 'dumplog'
 * utility, which makes them more human readable.  This class has the knowledge of how to 
 * parse those files and report back all the contents of that log file so that a calling 
 * program can use that information
 */

// Import fs module
const fs = require('fs');

// Import the path module
const path = require('path');

// Import the readline module
const readline = require('readline');

// The moment module
const moment = require('moment');

// Import the time zone lookup
const timezoneLookup = require('./TimeZoneLookup');

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

// This is a function that takes in a line and the previous date and returns the updated date from
// the line entry
function updateTimestamp(line, timestamp) {
    // The date object to return
    var dateToReturn;

    // These are the two regular expressions for parsing timestamps
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
                // We use the format YY-MMM-DDThh:mm:ss.sTZD
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
                var ts2Matches = timeIndicator.toString().match(timestampPattern2);
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
                        //logger.error('Error caught trying to update cloned timestamp with ' + timeIndicator);
                        //logger.error(error);
                    }
                }
            }
        }
    }

    // Return the updated date
    return dateToReturn;
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
        //logger.debug('Found error in line: ' + line);
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
                parseResults['data'][variableMatcher[2]] = Number(variableMatcher[1]);
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
        //logger.debug('Found ancillary can data in email line: ' + line);

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
        //logger.debug('Found ancillary CTD data in email line: ' + line);

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
            //logger.debug('Found ancillary CTD data in non-email line: ' + line);

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
function lookForAncillaryData(line, timestamp) {
    // The handle that will be returned (defaults to nothing)
    var ancillaryDataToReturn = [];

    // The first thing we need to do is figure out if the line is actually made up
    // of multiple lines separated by \n.
    var lineSplitOnNewLines = line.split('\n');

    // Now iterate over that array of lines to look for ancillary data
    for (var i = 0; i < lineSplitOnNewLines.length; i++) {
        var parsedAncillaryData = parseAncillaryDataFromLine(lineSplitOnNewLines[i], timestamp);
        if (parsedAncillaryData) {
            ancillaryDataToReturn.push(parsedAncillaryData);
        }
    }

    // Now return it
    return ancillaryDataToReturn;
}

// This function looks to see if the line indicates the start of any protocol runs.
function lookForProtocolRunStart(line, timestamp) {

    // The protocol run to return
    var protocolRunStart;

    if (line.indexOf('sampling at most') >= 0) {
        //logger.debug('Possible protocol start line:');
        //logger.debug(line);
    }
    // This is the regular expression we will use to look a protocol runs
    var protocolRunStartPattern = new RegExp(/^\S+\s+(.*)\s+sampling at most (\d+\.*\d*)ml(.*)/);

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
                'targetVol': Number(protocolRunStartMatch[2])
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
        //logger.debug('Possible sample start line:');
        //logger.debug(line);
    }
    var sampleStartPattern = new RegExp(/Sampling\s+(\d+\.*\d*)ml.*$/);

    // Try to match to the incoming line
    var sampleStartMatch = line.match(sampleStartPattern);
    if (sampleStartMatch && sampleStartMatch.length > 0) {
        sampleStart = {
            'timestamp': timestamp.valueOf(),
            'targetVol': Number(sampleStartMatch[1])
        }
        //logger.debug('Sample start')
        //logger.debug(sampleStart);
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
        //logger.debug('Possible sample end line:');
        //logger.debug(line);
    }
    var sampleStopPattern = new RegExp(/Sampled\s+(\d+\.*\d*)ml.*$/);

    // Try to match to incoming line
    var sampleStopMatch = line.match(sampleStopPattern);
    if (sampleStopMatch && sampleStopMatch.length > 0) {
        sampleEnd = {
            'timestamp': timestamp.valueOf(),
            'actualVol': Number(sampleStopMatch[1])
        }
        //logger.debug('Sample End');
        //logger.debug(sampleEnd);
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
        //logger.debug('Possible image line:');
        //logger.debug(lineWithoutNewlines);
    }
    var imagePattern = new RegExp(/Exposing\s+(\d+)x(\d+)\s+pixel\s+(\d+)-bit\s+image\s+for\s+(\d+\.*\d*)\s+seconds\s+(.*)\/([a-zA-Z0-9#]+\.tif)/);


    // Try to match to incoming line
    var imageMatch = lineWithoutNewlines.match(imagePattern);
    if (imageMatch && imageMatch.length > 0) {
        image = {
            'timestamp': timestamp.valueOf(),
            'width': Number(imageMatch[1]),
            'height': Number(imageMatch[2]),
            'bit': Number(imageMatch[3]),
            'exposure': Number(imageMatch[4]),
            'basePath': imageMatch[5],
            'filename': imageMatch[6]
        }
        //logger.debug('Image:');
        //logger.debug(image);
    }

    // Return the result
    return image;
}

// This method takes in a line and parses for information and attaches to the parsedObject if found
function parseLine(parsedObject, line, previousTimestamp) {
    // First update the timestamp for the most recent line
    var newTimestamp = updateTimestamp(line, previousTimestamp);

    // Make sure timestamp came back OK
    if (newTimestamp) {
        // OK, so we have an accurate date and time of the incoming log line, let's run through the
        // test to parse the line
        var error = lookForError(line, newTimestamp);
        if (error) {
            // Add the timestamp and add to the parsed object
            parsedObject['errors'][error['timestamp']] = {
                'subject': error['subject'],
                'message': error['message']
            }
        } else {
            // Look for ancillary data (can be more than one entry in a line so we get back an array)
            var ancillaryData = lookForAncillaryData(line, newTimestamp);
            if (ancillaryData && ancillaryData.length > 0) {
                // Loop over the array and attach
                for (var i = 0; i < ancillaryData.length; i++) {
                    // Make sure there is an object for the source
                    if (!parsedObject['ancillaryData'][ancillaryData[i]['source']]) {
                        parsedObject['ancillaryData'][ancillaryData[i]['source']] = {};
                    }
                    // Now add the data using timestamp as key (if it's not there already)
                    if (!parsedObject['ancillaryData'][ancillaryData[i]['source']][ancillaryData[i]['timestamp']]) {
                        parsedObject['ancillaryData'][ancillaryData[i]['source']][ancillaryData[i]['timestamp']] = ancillaryData[i]['data'];
                    } else {
                        logger.debug('Ancillary data already in the parsed object, will skip!');
                    }
                }
            } else {
                // Let's see if the line indicates the start of a protocol(s)
                var protocolRunStart = lookForProtocolRunStart(line, newTimestamp);
                if (protocolRunStart) {
                    // // Add the protocol run start to the list of protocol runs
                    parsedObject['protocolRuns'][protocolRunStart['timestamp']] = {
                        'name': protocolRunStart['name'],
                        'targetVol': protocolRunStart['targetVol']
                    };
                } else {
                    // Let's look for sample start
                    var sampleStart = lookForSampleStart(line, newTimestamp);
                    if (sampleStart) {
                        // Add a sample indexed by start time
                        parsedObject['samples'][sampleStart['timestamp']] = {
                            'targetVol': sampleStart['targetVol']
                        }
                    } else {
                        // Let's look for the end of a sample
                        var sampleEnd = lookForSampleEnd(line, newTimestamp);
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
                                if (latestSample && !latestSample['actualVol']) {
                                    parsedObject['samples'][lastestSampleTimestamp]['actualVol'] = sampleEnd['actualVol'];
                                } else {
                                    //logger.error('Either could not find latest sample or it already has actualVol!');
                                }
                            } else {
                                //logger.error('Recording a sample end, but I do not have any started samples!');
                            }
                        } else {
                            // Look for an image
                            var image = lookForImage(line, newTimestamp);
                            if (image) {
                                parsedObject['images'][image['timestamp']] = {
                                    'width': image['width'],
                                    'height': image['height'],
                                    'bit': image['bit'],
                                    'exposure': image['exposure'],
                                    'basePath': image['basePath'],
                                    'filename': image['filename']
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // Now return the timestamp
    return newTimestamp
}

// This method takes in a path to a file that should be in the .out format and returns and object
// contains all the related items that were extracted from that log file.  The trick with this is
// that it needs to be done in an asychronous manner.
async function parseFile(outFile, callback) {

    // Create a placeholder for the file to read
    const fileToParse = outFile;

    // This is a variable holding the most recent line (this is for multi-line entries)
    var previousLine;

    // This is a variable to hold what line we are on
    var lineNumber = 0;

    // This is variable to hold the current timestamp
    var previousLineTimestamp;

    // This is the object that will be returned
    var parsedObject = {
        protocolRuns: {},
        samples: {},
        images: {},
        errors: {},
        ancillaryData: {}
    }

    // First thing to do is create the read stream to the file
    const fileReadStream = fs.createReadStream(outFile);

    // Create an interface to read the file
    const rl = readline.createInterface({
        input: fileReadStream,
        crlfDelay: Infinity
    });

    // Add a handler interrupts
    rl.on('SIGCONT', () => {
        // `prompt` will automatically resume the stream
        //logger.debug('SIGCONT caught, resuming ...');
        rl.prompt();
    });
    rl.on('SIGTSTP', () => {
        // This will override SIGTSTP and prevent the program from going to the
        // background.
        //logger.error('Caught SIGTSTP.');
        callback(null, { message: 'Caught SIGTSTP while reading log file' });
    });

    // Add handler when the stream read end of file
    rl.on('close', function (err) {
        //logger.info("Completed reading of file " + fileToParse);
        // Since I am using new lines to make sure I have complete lines before parsing, I need
        // to process the last line read as it may not have been processed in the loop
        parseLine(parsedObject, previousLine, previousLineTimestamp);
        //        logger.debug(parsedObject);

        // Call the callback
        if (callback) {
            callback(parsedObject, err)
        }
    });

    // This is the main method process each line out of the file
    for await (const line of rl) {
        // Bump the line number
        lineNumber++;
        // logger.debug(`Line ${lineNumber}: ${line}`);

        // The first thing we need to do, is decide if this is a new line or 
        // a continuation of a previous line.  All new line entries should start
        // with the '@' symbol, so see if the line start with that
        if (line.startsWith('@')) {

            // Call the method to parse the line and get back the updated timestamp of the line
            if (previousLine) {
                previousLineTimestamp = parseLine(parsedObject, previousLine, previousLineTimestamp);
            }

            // Now assign the new line to the placeholder
            previousLine = line;
        } else {
            previousLine += '\n' + line;
        }
    }
}

// Export an object that represents the OutParser 'instance'
module.exports = {
    setLogDirectory: setLogDirectory,
    parseFile: parseFile
}