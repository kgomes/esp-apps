// Read in the ESP application configuration
var path = require('path');

// Configure logging
var log4js = require('log4js');
log4js.loadAppender('file');
log4js.addAppender(log4js.appenders.file('./logs/CrawlerEventHandler.log'), 'CrawlerEventHandler');

// Grab the logger
var logger = log4js.getLogger('CrawlerEventHandler');

// The constructor
function CrawlerEventHandler(ftpSync, dataAccess, logParser, baseDir, opts) {
    logger.info("CrawlerEventHandler will use base directory located at " + baseDir);
    logger.info("Creating CrawlerEventHandler with logger level " + opts.loggerLevel);
    // Check for logging level
    if (opts.loggerLevel) {
        logger.setLevel(opts.loggerLevel);
    }

    // Grab a handle to this object for scope management
    var me = this;

    // Assign the ftp synchronization client locally
    this.ftpSync = ftpSync;

    // Assign the DataAccess object
    this.dataAccess = dataAccess;

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
        this.ftpSync.on('ftpFileUpdated', this.handleFTPFileUpdated);

        // This event happens when ancillary data has been updated in the
        // persistent store
        this.logParser.on('ancillaryDataPersisted', this.handleAncillaryDataPersisted);
    }

    // *************************************************************************
    // This is the function to handle the event when a file was updated locally
    // from an FTP server
    // *************************************************************************
    this.handleFTPFileUpdated = function (data) {
        logger.info('FTP client updated the local file: ', data.file);

        // Make sure we have a deployment
        if (data.deployment) {
            // Make sure it has an esp
            if (data.deployment.esp) {
                // Make sure it has a log file listed
                if (data.deployment.esp.logFile) {
                    // Make sure the incoming event has a local file listed
                    if (data.file) {

                        // TODO kgomes, if the file is a .tif file and the deployment has an entry in the image
                        // list, make sure the onDisk flag is set (this aligns things if image files are downloaded
                        // after their log entries are parsed).

                        // Now build the location of where the deployment's log file should be locally
                        var localLogFile = me.baseDir + path.sep + 'instances' + path.sep +
                            data.deployment.esp.name + path.sep + 'deployments' + path.sep + data.deployment.name +
                            path.sep + 'data' + path.sep + 'raw' + path.sep + data.deployment.esp.logFile;
                        logger.debug('Deployment says log file should be located at ' + localLogFile);

                        // Now match against what came in
                        if (localLogFile === data.file) {
                            logger.debug('It\'s the log file, parse it!');
                            me.logParser.submitLogFileForParsing(data.deployment, data.file, function (err, deployment) {
                                logger.debug('Log file for deployment ' + deployment.name + ' of ESP ' + deployment.esp.name +
                                    ' finished parsing');
                            });
                        }
                    }
                }
            }
        }
    };

    // *************************************************************************
    // This function handles the event that some ancillary data was updated
    // in the persistent store.  It basically calls the method to synchronize
    // the database ancillary data with the file representation of it.
    // *************************************************************************
    this.handleAncillaryDataPersisted = function(eventData) {
        logger.debug("Got event that ancillary data was persisted from deployment " +
            eventData.deployment.name + ' using basedir ' + me.baseDir);
        dataAccess.syncAncillaryDataFileWithDatabase(eventData.deployment, me.baseDir, function(err, result){
           logger.debug("syncAncillaryDataFileWithDatabase callback called");
        });
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