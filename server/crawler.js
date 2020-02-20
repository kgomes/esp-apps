/*
 This is the script that runs in the background and collects information from the deployed ESPs
 */

// Read in the ESP application configuration
var espCfg = require('./config.js');
espCfg.init();

// Import the Axios library for HTTP interaction
const axios = require('axios');

// Import 3rd party library dependencies
var log4js = require('log4js');

// Configure the logger to use a file appender
log4js.loadAppender('file');

// Set log directory
log4js.addAppender(log4js.appenders.file(espCfg.logDir + '/crawler.log'), 'crawler');

// Grab the logger
var logger = log4js.getLogger('crawler');

// Set the default logging level from the config
if (espCfg.crawlerOptions.loggerLevel) {
    logger.setLevel(espCfg.crawlerOptions.loggerLevel);
}

// Create the object that will be responsible for handling the
// synchronization of files from FTP servers
var dfs = require('./DeploymentFileSync').createDeploymentFileSync(espCfg.deploymentFileSyncOptions, espCfg.dataDir, espCfg.logDir);

// Set up the interval to walk through the list of deployments for processing
setInterval(function () {
    try {
        // Call the API to get a list of the open deployments
        axios.get(espCfg.hostBaseUrl + '/deployments?openOnly=true')
            .then(function (response) {
                // Grab the array of Deployments
                var openDeployments = response.data;
                if (openDeployments && openDeployments.length > 0) {
                    logger.debug('Will parse ' + openDeployments.length + ' deployment(s)');
                    // Loop over the open deployments
                    for (var i = 0; i < openDeployments.length; i++) {
                        // Call the method to parse all the data for this deployment
                        processDeployment(openDeployments[i]);
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

    } catch (error) {
        logger.error('Error caught trying to process deployments');
        logger.error(error);
    }
}, espCfg.crawlerOptions.ftpSyncIntervalMillis);


// **************************************************************************************************
// The function to take in deployment information, connect up to the FTP server and process the data
// **************************************************************************************************
function processDeployment(deployment) {
    logger.debug('Processing deployment ' + deployment.name + ' of ESP ' + deployment.esp.name);

    // Check deployment parameters and process the directory recursively
    if (deployment &&
        deployment.esp &&
        deployment.esp.ftpHost &&
        deployment.esp.ftpPort &&
        deployment.esp.name &&
        deployment.name &&
        deployment.esp.ftpWorkingDir) {
        try {
            dfs.syncDeployment(deployment, function (error) {
                if (error) {
                    logger.error('Error returned from FTP sync for deployment ' + deployment.name);
                    logger.error(error);
                } else {
                    logger.debug('Done processing deployment ' + deployment.name);
                }
            });
        } catch (error) {
            logger.error('Error trapped while processing deployment ' + deployment.name +
                ' of esp ' + deployment.esp.name);
            logger.error(error);
        }
    } else {
        logger.warn('Deployment ' + deployment.name +
            ' did not have enough information to be synchronized');
    }
}
