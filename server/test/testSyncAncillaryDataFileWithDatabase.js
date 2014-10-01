// Read in the ESP config file
var espCfg = require('../config.js');
// Import 3rd party library dependencies
var log4js = require('log4js');

// Configure the logger to use a file appender
log4js.loadAppender('file');
log4js.addAppender(log4js.appenders.file('./logs/testSyncAncillaryDataFileWithDatabase.log'), 'test');

// Grab the logger
var logger = log4js.getLogger('test');

// Log the configuration at startup
logger.info('Staring testAncillaryDataFileWithDatabase with options: ', espCfg);

// Create the object used to interface to the data stores
var da = require('../DataAccess').createDataAccess(espCfg.dataStoreOptions);

// The directory where the esp applications and data live
var espDataDir = espCfg.dataDir;

// Use the dataAccess to find a deployment
var deploymentToUse = da.getDeploymentByID('1a018ecf9cf3b471c614a9d5af007186', false, function (err, deployment) {
    logger.debug('Deployment that we are using is ' +  deployment.name + ' of ESP ' + deployment.esp.name);
    // Call the method to sync
    da.syncAncillaryDataFileWithDatabase(deployment, espDataDir, function(err, result) {
        if (err){
            logger.error("ERROR trying to sync data to file: ", err);
        }
        logger.debug("Sync done, result: ", result);
    });
});