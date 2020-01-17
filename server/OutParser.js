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

// These are the two regular expressions for parsing timestamps
const timestampPattern1 = new RegExp(/^(\d+):(\d+):(\d+)\.(\d+)(\D+)(\d+)-(\D+)-(\d+)/);
const timestampPattern2 = new RegExp(/^(\d+):(\d+):(\d+)\.(\d+)/);

// Create a placeholder for the logger that will depend on the directory being set
const logger = log4js.getLogger('OutParser');
logger.info('Creating OutParser');

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
                        logger.error('Error caught trying to update cloned timestamp with ' + timeIndicator);
                        logger.error(error);
                    }
                }
            }
        }
    }

    // Return the updated date
    return dateToReturn;
}

// This method takes in a line and parses out information in the line
function parseLine(parsedObject, line, previousTimestamp) {
    // First update the timestamp for the most recent line
    var newTimestamp = updateTimestamp(line, previousTimestamp);
    if (previousTimestamp) {
        logger.debug('TS1: ' + previousTimestamp + ', TS2: ' + newTimestamp + ', Diff: ' + (newTimestamp - previousTimestamp));
    }

    // Make sure timestamp came back OK
    if (newTimestamp) {
        // OK, so we have an accurate date and time of the incoming log line, we need to figure out what to do next
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
        protocolRuns: [],
        samples: [],
        images: [],
        errors: [],
        emails: [],
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
        logger.debug('SIGCONT caught, resuming ...');
        rl.prompt();
    });
    rl.on('SIGTSTP', () => {
        // This will override SIGTSTP and prevent the program from going to the
        // background.
        logger.error('Caught SIGTSTP.');
        callback(null, { message: 'Caught SIGTSTP while reading log file' });
    });

    // Add handler when the stream read end of file
    rl.on('close', function (err) {
        logger.info("Completed reading of file " + fileToParse);
        // Since I am using new lines to make sure I have complete lines before parsing, I need
        // to process the last line read as it may not have been processed in the loop
        parseLine(parsedObject, previousLine, previousLineTimestamp);

        // Call the callback
        if (callback) {
            callback(parsedObject, err)
        }
    });

    // This is the main method process each line out of the file
    for await (const line of rl) {
        // Bump the line number
        lineNumber++;
        logger.debug(`Line ${lineNumber}: ${line}`);

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