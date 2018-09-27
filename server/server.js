// First, let's read in the ESP application configuration and initialize it
var espCfg = require('./config.js');
espCfg.init();

// Now other libraries
var log4js = require('log4js');

// Configure the logger to use a file appender
log4js.loadAppender('file');
log4js.addAppender(log4js.appenders.file(espCfg.logDir + '/server.log'), 'server');

// Grab the logger
var logger = log4js.getLogger('server');

// Set the default logging level from the config
if (espCfg.serverOptions.loggerLevel) {
    logger.setLevel(espCfg.serverOptions.loggerLevel);
}

// Log the configuration at startup
logger.info('Staring up ESP Web Application Server with options: ', espCfg);

// Create the object used to interface to the data stores
var da = require('./DataAccess').createDataAccess(espCfg.dataStoreOptions, espCfg.logDir);

// Now create the application server
var appServer = require('./AppServer').createAppServer(da, espCfg.dataDir, espCfg.appServerOptions, espCfg.logDir);
