// Set up logger
var log4js = require('log4js');

// Use a file appender
log4js.loadAppender('file');
log4js.addAppender(log4js.appenders.file('logs/testFtpSync.log'), 'testFtpSync');

// Grab the logger
var logger = log4js.getLogger('testFtpSync');

// Set the default logging level from the config
logger.setLevel("trace");

// The FTP sync object
var ftpsync = require('../ftpsync').ftpSync;

// Grab the test deployment
var deployment = require('./deployment1.json');
var basedir = '/Users/kgomes/Documents/Web/esp/services/espweb/static/data';
logger.info("Test of ftpSync will be done using deployment:");
logger.info(deployment);
logger.info("And basedir " + basedir);

// Create the FTP synchronizer
var ftp = new ftpsync("trace");

// Now syncronize the deployment
ftp.syncDeployment(deployment, basedir, function(err){
    logger.info("Test should be done");
    if(err) {
        logger.error("There was an error in the test though");
        logger.error(err);
    }
});