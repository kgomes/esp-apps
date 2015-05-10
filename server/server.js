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
var appServer = require('./AppServer').createAppServer(da, espCfg.appServerOptions, espCfg.logDir);

// Setup Socket.IO on the express server
var io = io.listen(appServer.getServer());

// Create an event handler
require('./EventHandler').createEventHandler(io, espCfg.eventHandlerOptions, espCfg.logDir);
