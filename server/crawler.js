/*
 This is the script that runs in the background and collects information from the deployed ESPs
 */

// Read in the ESP application configuration
var espCfg = require('./config.js');

// Import 3rd party library dependencies
var log4js = require('log4js');

// Configure the logger to use a file appender
log4js.loadAppender('file');
log4js.addAppender(log4js.appenders.file('./logs/crawler.log'), 'crawler');

// Grab the logger
var logger = log4js.getLogger('crawler');

// Set the default logging level from the config
if (espCfg.crawlerOptions.loggerLevel) {
    logger.setLevel(espCfg.crawlerOptions.loggerLevel);
}

// The directory where the esp and data lives
var espDataDir = espCfg.dataDir;

// Create the object that will be responsible for handling the
// synchronization of files from FTP servers
var dfs = require('./DeploymentFileSync').createDeploymentFileSync(espCfg.deploymentFileSyncOptions);

// Create the object used to interface to the data stores
var da = require('./DataAccess').createDataAccess(espCfg.dataStoreOptions);

// Create a LogParser object
var lp = require('./LogParser').createLogParser(da, espCfg.dataDir, espCfg.logParserOptions);

// Create an event handler
require('./CrawlerEventHandler').createCrawlerEventHandler(dfs, da, lp, espCfg.dataDir, espCfg.eventHandlerOptions);

// Go ahead and call the first processing of deployments since we are in start
try {
    da.getOpenDeployments(function (err, deployments) {
        for (var i = 0; i < deployments.length; i++) {
            processDeployment(deployments[i]);
        }
    });
} catch (error) {
    logger.error('Error caught from initial processing of open deployments');
    logger.error(error);
}

// Set up the interval to walk through the list of deployments for processing
setInterval(function () {
    try {
        // Load the deployment data
        da.getOpenDeployments(function (err, deployments) {
            for (var i = 0; i < deployments.length; i++) {
                processDeployment(deployments[i]);
            }
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
        deployment.esp.ftpWorkingDir &&
        espDataDir) {
        try {
            dfs.syncDeployment(deployment, espDataDir, function (error) {
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
