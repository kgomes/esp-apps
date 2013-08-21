// Read in the ESP application configuration
var espCfg = require('./config.js');

// Import 3rd party library dependencies
var log4js = require('log4js');
var connect = require('connect');
var express = require('express');
var io = require('socket.io');
var url = require('url');
var port = (espCfg.serverOptions.port || process.env.PORT || 8081);

// Configure the logger to use a file appender
log4js.loadAppender('file');
log4js.addAppender(log4js.appenders.file('./logs/server.log'), 'server');

// Grab the logger
var logger = log4js.getLogger('server');

// Set the default logging level from the config
if (espCfg.serverOptions.loggerLevel) {
    logger.setLevel(espCfg.serverOptions.loggerLevel);
}

// Log the configuration at startup
logger.info('Staring up ESP Web Application Server with options: ', espCfg);

// Create the object used to interface to the data stores
var da = require('./DataAccess').createDataAccess(espCfg.dataStoreOptions);

// Create the object that will be responsible for handling the
// synchronization of files from FTP servers
var ftp = require('./FTPSync').createFTPSync(espCfg.ftpSyncOptions);

// The directory where the esp applications and data live
var espDataDir = espCfg.dataDir;

// Create a LogParser object
var lp = require('./LogParser').createLogParser(da, espCfg.dataDir, espCfg.logParserOptions);

// Now create the application server
var appServer = require('./AppServer').createAppServer(da, espCfg.appServerOptions);

// Setup Socket.IO on the express server
var io = io.listen(appServer.getServer());

// Create an event handler
require('./EventHandler').createEventHandler(io, ftp, da, lp, espCfg.dataDir, espCfg.eventHandlerOptions);

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
}, espCfg.serverOptions.ftpSyncIntervalMillis);

// **************************************************************************************************
// The function to take in deployment information, connect up to the FTP server and process the data
// **************************************************************************************************
function processDeployment(deployment) {
    logger.debug('Processing deployment ' + deployment.name + ' of ESP ' + deployment.esp.name);

    // Check deployment parameters and process the directory recursively
    if (deployment &&
        deployment.esp &&
        deployment.esp.ftp_host &&
        deployment.esp.ftp_port &&
        deployment.esp.name &&
        deployment.name &&
        deployment.esp.ftp_working_dir &&
        espDataDir) {
        try {
            ftp.syncDeployment(deployment, espDataDir, function (error) {
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
