// Read in the ESP application configuration
var path = require('path');

// Configure logging
var log4js = require('log4js');
log4js.loadAppender('file');
log4js.addAppender(log4js.appenders.file('./logs/CrawlerEventHandler.log'), 'CrawlerEventHandler');

// Grab the logger
var logger = log4js.getLogger('CrawlerEventHandler');

// The constructor
function CrawlerEventHandler(deploymentFileSync, logParser, baseDir, opts) {
    logger.info("CrawlerEventHandler will use base directory located at " + baseDir);
    logger.info("Creating CrawlerEventHandler with logger level " + opts.loggerLevel);
    // Check for logging level
    if (opts.loggerLevel) {
        logger.setLevel(opts.loggerLevel);
    }

    // Grab a handle to this object for scope management
    var me = this;

    // Assign the ftp synchronization client locally
    this.deploymentFileSync = deploymentFileSync;

    // Assign the logParser
    this.logParser = logParser;

    // Assign the local base directory where all data should be
    this.baseDir = baseDir;

    // ****************************************************************
    // This sets up the various handlers on the FTP synchronizer and the
    // socket.io client<->server interactions
    // ****************************************************************
    this.setupHandlers = function () {
        logger.debug("Setting up event handlers");

        // This event happens when the FTP crawler downloads or updates a file local
        // on this server
        this.deploymentFileSync.on('ftpFileUpdated', this.handleFTPFileUpdated);
    }

    // *************************************************************************
    // This is the function to handle the event when a file was updated locally
    // from an FTP server
    // *************************************************************************
    this.handleFTPFileUpdated = function (message) {
        logger.debug('FTP client updated the local file: ', message.file);

        // Make sure we have a deployment
        if (message.deployment) {
            // Make sure it has an esp
            if (message.deployment.esp) {
                // Make sure it has a log file listed
                if (message.deployment.esp.logFile) {
                    // Make sure the incoming event has a local file listed
                    if (message.file) {

                        // Now build the location of where the deployment's log file should be locally
                        var localLogFile = me.baseDir + path.sep + 'instances' + path.sep +
                            message.deployment.esp.name + path.sep + 'deployments' + path.sep + message.deployment.name +
                            path.sep + 'data' + path.sep + 'raw' + path.sep + message.deployment.esp.logFile;
                        logger.debug('Deployment says log file should be located at ' + localLogFile);

                        // Now match against what came in
                        if (localLogFile === message.file) {
                            logger.info('Local log file ' + localLogFile + ' was updated and needs parsing');
                            me.logParser.parseLogFile(message.deployment, message.file, message.stats, function (err) {
                                if (err)
                                    logger.error("Error returned submitting a log file for parsing:", err);
                            });
                        }
                    }
                }
            }
        }
    };
}

// Export the factory method
exports.createCrawlerEventHandler = function (ftpSync, dataAccess, logParser, baseDir, opts) {
    // Create the new EventHandler
    var newEventHandler = new CrawlerEventHandler(ftpSync, dataAccess, logParser, baseDir, opts);

    // Now setup the event handlers for both
    newEventHandler.setupHandlers();

    // Now return it
    return newEventHandler;
}