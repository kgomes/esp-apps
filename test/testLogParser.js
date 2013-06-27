// Application libraries
var dataAccess = require('../dataAccess').dataAccess;

// Grab the log parser
var logParser = require('../logParser').logParser;

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

// Create a connection to the databases
var da = new dataAccess("localhost", 5984, false,
    "espdba", "leghorn", "esp",
    "postgres", "localhost", 5432,
    "espdba", "leghorn", "esp_ancillary");

// Create the log parser
var lp = new logParser('debug', da);

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
