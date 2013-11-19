// Where the data is stored
var dataDir = '/Users/kgomes/Documents/Web/esp/services/espweb/data';

// Here are the configurations for the object used in this test
var dataStoreOptions = {
    couchHost: 'localhost',
    couchPort: 5984,
    couchSSL: false,
    couchUsername: 'espdba',
    couchPassword: 'leghorn',
    couchDatabase: 'esp',
    pgProtocol: 'postgres',
    pgHost: 'localhost',
    pgPort: 5432,
    pgUsername: 'espdba',
    pgPassword: 'leghorn',
    pgDatabase: 'esp_ancillary',
    loggerLevel: 'debug',
    numAncillaryPointsToBatch: 1000
};

// The LogParser options
var logParserOptions = {
    loggerLevel: 'debug',
    useAncillaryTimestamps: true,
    numberOfTicksPerSecond: 100,
    tempDir: '/tmp',
    // The timezone lookup table
    timezoneLookup: {
        'EDT': {
            stringRep: '-0400',
            hourOffset: -4
        },
        'GMT': {
            stringRep: '0000',
            hourOffset: 0
        },
        'PDT': {
            stringRep: '-0700',
            hourOffset: -7
        },
        'PST': {
            stringRep: '-0800',
            hourOffset: -8
        },
        'UTC': {
            stringRep: '0000',
            hourOffset: 0
        }
    },
    // The ancillary data lookup table
    ancillaryLookup: {
        CTD: {
            'C': {
                varName: 'Temp',
                varLongName: 'Temperature',
                units: 'Degrees C'
            },
            'm': {
                varName: 'Depth',
                varLongName: 'Depth',
                units: 'meters'
            },
            'psu': {
                varName: 'Sal',
                varLongName: 'Salinity',
                units: 'psu'
            },
            'mg/m^3': {
                varName: 'Chl',
                varLongName: 'Chlorophyll',
                units: 'mg/m^3'
            },
            '%': {
                varName: 'Light Tx',
                varLongName: 'Light Transmission',
                units: '%'
            },
            'ml/L': {
                varName: 'Diss O2',
                varLongName: 'Computed Dissolved Oxygen',
                units: 'ml/L'
            }
        },
        Can: {
            'C': {
                varName: 'Temp',
                varLongName: 'Temperature',
                units: 'Degrees C'
            },
            '% humidity': {
                varName: '% Humidity',
                varLongName: 'Percent Humidity',
                units: '%'
            },
            'psia': {
                varName: 'Press',
                varLongName: 'Pressure',
                units: 'psia'
            },
            'V': {
                varName: 'Volt',
                varLongName: 'Battery Voltage',
                units: 'V'
            },
            'A': {
                varName: 'Inst Curr',
                varLongName: 'Instantaneous Current',
                units: 'A'
            },
            'A avg': {
                varName: 'Avg Curr',
                varLongName: 'Average Current',
                units: 'A'
            },
            'W': {
                varName: 'Power',
                varLongName: 'Power',
                units: 'W'
            }
        },
        ISUS: {
            'uM/L no^3': {
                varName: 'Nitrate',
                varLongName: 'Nitrate',
                units: 'uM/L no^3'
            },
            'uM/L hs': {
                varName: 'Nitrate 2',
                varLongName: 'Nitrate 2',
                units: 'uM/L hs'
            },
            'psu': {
                varName: 'PSU',
                varLongName: 'PSU',
                units: 'psu'
            }
        }
    }
};


// Set up logger
var log4js = require('log4js');

// Use a file appender
log4js.loadAppender('file');
log4js.addAppender(log4js.appenders.file('logs/testLogParser.log'), 'testLogParser');

// Grab the logger
var logger = log4js.getLogger('testLogParser');

// Set the default logging level from the config
logger.setLevel("trace");

// Read in the test deployment
var testDeployment = require("./deployment1.json");
logger.debug("Test starts with deployment " + testDeployment.name + " of esp " + testDeployment.esp.name);

// Create the object used to interface to the data stores
var da = require('../DataAccess').createDataAccess(dataStoreOptions);

// Create a LogParser object
var lp = require('../LogParser').createLogParser(da, dataDir, logParserOptions);

// First let's insert the test deployment
da.persistDeployment(testDeployment, function (err, deployment) {
    // Check for error
    if (err) {
        logger.fatal("ERROR during test run:");
        logger.fatal(err);
    } else {
        logger.debug("Deployment after persisting has id " + deployment._id);

        // The corresponding log file
        var logFile1 = './real.log';

        // Run the parser after a pause of 5 seconds
        lp.submitLogFileForParsing(deployment, logFile1, function (err, deployment) {
            logger.debug("After parsing, deployment looks like");
            logger.debug(deployment);
            // TODO deleted the ancillary sources and ancillary data from data storage
            /*  da.removeDeployment(deployment, function (res) {
             logger.debug("Result from delete");
             logger.debug(res);
             });*/
        });
    }
});
