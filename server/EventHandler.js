// Read in the ESP application configuration
var path = require('path');

// Configure logging
var log4js = require('log4js');
log4js.loadAppender('file');
log4js.addAppender(log4js.appenders.file('./logs/EventHandler.log'), 'EventHandler');

// Grab the logger
var logger = log4js.getLogger('EventHandler');

// The constructor
function EventHandler(io, ftpSync, dataAccess, logParser, baseDir, opts) {
    logger.info("EventHandler will use base directory located at " + baseDir);
    logger.info("Creating EventHandler with logger level " + opts.loggerLevel);
    // Check for logging level
    if (opts.loggerLevel) {
        logger.setLevel(opts.loggerLevel);
    }

    // Grab a handle to this object for scope management
    var me = this;

    // Assign the socket.io instance locally
    this.io = io;

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

        // Set the logging level for socket.io
        this.io.set('log level', 1);

        // Handle connection event for socket.io
        this.io.sockets.on('connection', this.handleIOSocketConnection);

        // This event happens when the FTP crawler downloads or updates a file local
        // on this server
        this.ftpSync.on('ftp_file_updated', this.handleFTPFileUpdated);

        // This event happens when ancillary data has been updated in the
        // persistent store
        this.dataAccess.on('ancillary_data_persisted', this.handleAncillaryDataPersisted);
    }

    // *****************************************************************************
    // This is the function to handle the event when a client connects via socket.io
    // *****************************************************************************
    this.handleIOSocketConnection = function (socket) {
        logger.debug("Client connected: ", socket);

        // The method to call when a message comes from the client
        socket.on('message', function (data) {
            logger.debug("Message received, will broadcast: ", data);
            socket.broadcast.emit('server_message', data);
            socket.emit('server_message', data);
        });

        // Assign a handler to handle when the client disconnects
        socket.on('disconnect', function () {
            logger.debug("Client disconnected.");
        });
    };

    // *************************************************************************
    // This is the function to handle the event when a file was updated locally
    // from an FTP server
    // *************************************************************************
    this.handleFTPFileUpdated = function (data) {
        logger.debug('FTP client updated the local file: ', data.file);

        // Make sure we have a deployment
        if (data.deployment) {
            // Make sure it has an esp
            if (data.deployment.esp) {
                // Make sure it has a log file listed
                if (data.deployment.esp.log_file) {
                    // Make sure the incoming event has a local file listed
                    if (data.file) {

                        // Now build the location of where the deployment's log file should be locally
                        var localLogFile = me.baseDir + path.sep + 'instances' + path.sep +
                            data.deployment.esp.name + path.sep + 'deployments' + path.sep + data.deployment.name +
                            path.sep + 'data' + path.sep + 'raw' + path.sep + data.deployment.esp.log_file;
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
        dataAccess.syncAncillaryDataFileWithDatabase(eventData.deployment, me.baseDir);
    };
}

// Export the factory method
exports.createEventHandler = function (io, ftpSync, dataAccess, logParser, baseDir, opts) {
    // Create the new EventHandler
    var newEventHandler = new EventHandler(io, ftpSync, dataAccess, logParser, baseDir, opts);

    // Now setup the event handlers for both
    newEventHandler.setupHandlers();

    // Now return it
    return newEventHandler;
}