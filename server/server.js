// First, let's read in the ESP application configuration and initialize it
var espCfg = require('./config.js');
var serverCfg = espCfg['server'];

//espCfg.init();

// Now other libraries
var log4js = require('log4js');

// Configure the logger to use a file appender
log4js.loadAppender('file');
log4js.addAppender(log4js.appenders.file(serverCfg.logDir + '/server.log'), 'server');

// Grab the logger
var logger = log4js.getLogger('server');

// Set the default logging level from the config
if (serverCfg && serverCfg.loggingLevels && serverCfg.loggingLevels.server) {
    logger.setLevel(serverCfg.loggingLevels.server);
}

// Log the configuration at startup
logger.info('Staring up ESP Portal Web Application Server');
logger.info('API Base URL is ' + serverCfg.apiBaseUrl);
logger.info('Port server will listen on is ' + serverCfg.port);
logger.info('Data directory is located at ' + serverCfg.dataDir);
logger.info('Log directory is ' + serverCfg.logDir);
logger.info('Will connect to CouchDB on host ' + serverCfg.dataAccessOptions.couchHost);
logger.info('Will connect to PostgreSQL on host ' + serverCfg.dataAccessOptions.pgHost);
if (serverCfg.slackWebHookURL) {
    logger.info('Slack connection configured');
}

// Create the object used to interface to the data stores
var da = require('./DataAccess').createDataAccess(serverCfg.dataAccessOptions, serverCfg.dataDir, 
    serverCfg.apiBaseUrl + '/data', serverCfg.slackUsername, serverCfg. slackWebHookURL, 
    serverCfg.logDir, serverCfg.loggingLevels.dataAccess);

// Now create the application server
require('./AppServer').createAppServer(da, serverCfg.dataDir, serverCfg.port, serverCfg.logDir, 
    serverCfg.loggingLevels.appServer);
