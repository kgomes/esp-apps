// Set up logger
var log4js = require('log4js');

// Use a file appender
log4js.loadAppender('file');
log4js.addAppender(log4js.appenders.file('logs/scopePlay.log'), 'scopePlay');

// Grab the logger
var logger = log4js.getLogger('scopePlay');

// Set the default logging level from the config
logger.setLevel("trace");

// The FTP sync object
var ftpsync = require('../ftpsync').ftpSync;

// Create the FTP synchronizer
var ftp = new ftpsync("trace");

logger.debug(ftp);