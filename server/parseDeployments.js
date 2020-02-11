/*
 * This is a top level script meant to be run via command line (or cron job) that uses
 * the ESP web portal API to get a list of all the curently open deployments.  It then
 * looks for a local directory (specfied in the configuration) for the raw files from
 * that deployment. It recursively crawls this raw directory and parses all the applicable
 * information from the files in that directory and then submits the updated deployment
 * back to the web portal API.
 */

// First, let's red in the configuration file and initialize the configuration
var espCfg = require('./config.js');
espCfg.init();

// Import the Axios library for HTTP interaction
const axios = require('axios');

// Library for file manipulations
const fs = require('fs');

// Library for path manipulations
const path = require('path');

// Some utilities for dealing with deployments
const deploymentUtils = require('./DeploymentUtils');

// The parser for .out files
const outParser = require('./OutParser');
outParser.setLogDirectory(espCfg['logDir']);
outParser.setLogLevel('debug');
outParser.setAncillaryDataLookup(espCfg['ancillaryDataLookup']);

// Import the logging library
var log4js = require('log4js');

// Configure the logger to use a file appender
log4js.loadAppender('file');

// Set log directory
log4js.addAppender(log4js.appenders.file(path.join(espCfg.logDir, 'parseDeployment.log')), 'parseDeployment');

// Grab the logger
var logger = log4js.getLogger('parseDeployment');

// Set the default logging level from the config
if (espCfg.parseDeploymentOptions.loggerLevel) {
    logger.setLevel(espCfg.parseDeploymentOptions.loggerLevel);
}
logger.info('Starting parse deployment run at ' + new Date());

// Define the functions we need
var parseDeploymentData = function (deployment) {
    // Make sure we have enough info in the deployment
    if (deployment['name'] && deployment['esp'] && deployment['esp']['name']) {
        // Using the ESP and Deployment name, find the data directory locally
        var localDataDirectory = path.join(espCfg['dataDir'], 'instances',
            deployment['esp']['name'], 'deployments', deployment['name'], 'data', 'raw');
        logger.debug('Deployment ' + deployment['hame'] + ' data is located at:');
        logger.debug(localDataDirectory);
        if (fs.existsSync(localDataDirectory)) {
            logger.debug('That path does exist');
            parseRawDataDirectory(deployment, localDataDirectory, deployment['esp']['dataDirectory']);
        } else {
            logger.warn('Data path for deployment ' + deployment['name'] + ' of ESP ' +
                deployment['esp']['name'] + ' does not exists, will not parse anything');
        }
    }
};

// This method takes in a deployment and a directory and parses
// files in that directory, attaching information from those
// parsed files to the deployment
var parseRawDataDirectory = function (deployment, localDataDirectory, remoteDataDirectory) {
    logger.debug('Will parse deployment data from directory ' + localDataDirectory);
    logger.debug('Remote ESP data directory is ' + remoteDataDirectory);

    // Read the directory contents
    var dirListing = fs.readdirSync(localDataDirectory);

    // Make sure there are files
    if (dirListing && dirListing.length > 0) {
        // Loop over the listing
        for (var i = 0; i < dirListing.length; i++) {

            // Grab the file name from the array and create a full path
            var fullPathToFile = path.join(localDataDirectory, dirListing[i]);
            logger.debug('Looking at ' + fullPathToFile);

            // Grab the file stats
            var fileStats = fs.statSync(fullPathToFile);

            // Check to see if it is a directory and recursive if so
            if (fileStats && fileStats.isDirectory()) {
                parseRawDataDirectory(deployment, fullPathToFile, remoteDataDirectory);
            } else {
                // Check to see if it's a a file we care about
                if (fullPathToFile.endsWith('.out')) {
                    // Parse the .out file
                    var parsedObject = outParser.parseFileSync(fullPathToFile, localDataDirectory, remoteDataDirectory);

                    // Merge the data from the .out file with the incoming deployment
                    var messages = deploymentUtils.mergeDeployments(parsedObject, deployment);
                    logger.debug(JSON.stringify(messages, null, 2));
                }
            }
        }
    }
}

// Call the API to get a list of the open deployments
axios.get(espCfg.hostBaseUrl + ':' + espCfg.port + '/deployments?openOnly=true')
    .then(function (response) {
        // Grab the array of Deployments
        var openDeployments = response.data;
        if (openDeployments && openDeployments.length > 0) {
            logger.debug('Will parse ' + openDeployments.length + ' deployment(s)');
            // Loop over the open deployments
            for (var i = 0; i < openDeployments.length; i++) {
                // Call the method to parse all the data for this deployment
                parseDeploymentData(openDeployments[i]);
                logger.debug(JSON.stringify(openDeployments[i], null, 2));
                // Now the deployment object should have all the information from all
                // parsed files.
                // Now call the API to persist any changes to the deployment
                var patchUrl = espCfg.hostBaseUrl + ':' + espCfg.port + '/deployments/' + openDeployments[i]['_id'];
                axios.patch(patchUrl, openDeployments[i])
                    .then(function (response) {
                        logger.debug('Done processing deployment');
                        logger.debug(response.data);
                    })
                    .catch(function (error) { 
                        logger.error('Error trying to udpate deployment');
                        logger.error(error);
                    });
            }
        } else {
            logger.debug('No open deployments found');
        }
    })
    .catch(function (error) {
        logger.error('Error caught trying to get open deployments from the portal API');
        logger.error(error);
    })
    .then(function () {
        // always executed
    });

