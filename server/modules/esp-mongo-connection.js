
// Configure logging for the DataStore
var log4js = require('log4js');
log4js.loadAppender('file');

// Create a logger
var logger = log4js.getLogger('esp-mongo-connection');

