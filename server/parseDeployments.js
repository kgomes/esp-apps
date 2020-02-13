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

// This function takes in a deployment and then parses the files listed in the deployment and
// attaches the parsed data to the deployment
var parseDeploymentData = function (deployment) {
    // Make sure we have enough info in the deployment
    if (deployment['name'] && deployment['esp'] &&
        deployment['esp']['name'] &&
        deployment['esp']['filesToParse'] &&
        deployment['esp']['dataDirectory']) {

        // Using the ESP and Deployment name, find the local data directory for this deployment
        var localDataDirectory = path.join(espCfg['dataDir'], 'instances',
            deployment['esp']['name'], 'deployments', deployment['name'], 'data', 'raw', 'esp');
        logger.debug('Deployment ' + deployment['name'] + ' of ESP ' +
            deployment['esp']['name'] + ' data is located locally at:');
        logger.debug(localDataDirectory);

        // Make sure the local data path for the deployment exists
        if (fs.existsSync(localDataDirectory)) {
            logger.debug('That path does exist');
            // Now loop over the files that are listed in the deployment as the ones to be parsed
            for (var i = 0; i < deployment['esp']['filesToParse'].length; i++) {
                // Grab the remote file name
                var fullRemotePathOfFileToParse = deployment['esp']['filesToParse'][i];

                // Now strip off the remote data directory
                var relativeRemotePathOfFileToParse =
                    fullRemotePathOfFileToParse.substring(deployment['esp']['dataDirectory'].length + 1);

                // Now split the remote path in case it's in a sub directory
                var relativeRemotePathParts = relativeRemotePathOfFileToParse.split('/');

                // Create the local path to the same file
                var localPathOfFileToParse = localDataDirectory;
                for (var j = 0; j < relativeRemotePathParts.length; j++) {
                    localPathOfFileToParse = path.join(localPathOfFileToParse, relativeRemotePathParts[j]);
                }
                logger.debug('Will parse file ' + fullRemotePathOfFileToParse);
                logger.debug('Relative path is ' + relativeRemotePathOfFileToParse);
                if (fs.existsSync(localPathOfFileToParse)) {
                    logger.debug('Local path to same file is: ' + localPathOfFileToParse + ' and it exists');

                    // Parse the file
                    var parsedObject = outParser.parseFileSync(localPathOfFileToParse, deployment['esp']['dataDirectory']);

                    // If a parsed object was returned, merge it with the incoming deployment
                    if (parsedObject) {
                        logger.debug('parsedObject returned, will merge')

                        // Merge the data from the .out file with the incoming deployment
                        var messages = deploymentUtils.mergeDeployments(parsedObject, deployment);

                        // the mergeDeployment utility, does not merge ancillary data points, so add those
                        deployment['ancillaryDataPoints'] = parsedObject['ancillaryDataPoints'];
                        logger.debug(JSON.stringify(messages, null, 2));
                    }
                } else {
                    logger.debug('The local file does not exist, will not parse it');
                }
            }
            //parseRawDataDirectory(deployment, localDataDirectory, deployment['esp']['dataDirectory']);
        } else {
            logger.warn('Data path for deployment ' + deployment['name'] + ' of ESP ' +
                deployment['esp']['name'] + ' does not exists, will not parse anything');
        }
    }
};

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
                //logger.debug(JSON.stringify(openDeployments[i], null, 2));
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

