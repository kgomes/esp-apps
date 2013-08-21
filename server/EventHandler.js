// Read in the ESP application configuration
var espCfg = require('./../cfg/esp_cfg.json');
var path = require('path');

// Grab a log parser to use for parsing the .log file
var logParser = require('./logParser').logParser;

// Import logging library
var log4js = require('log4js');

// Set up a file appender
log4js.loadAppender('file');
log4js.addAppender(log4js.appenders.file('logs/EventHandler.log'), 'eventHandler');

// Grab the logger
var logger = log4js.getLogger('eventHandler');

// Set a default logging level of info
var defaultLogLevel = 'debug';
logger.setLevel(defaultLogLevel);

// Export the constructor
exports.EventHandler = EventHandler;

// The constructor
function EventHandler(io, ftpsync, dataAccess) {
    // Assign the socket.io instance locally
    this.io = io;

    // Assign the ftp synchronization client locally
    this.ftpsync = ftpsync;

    // Assign the dataAccess object
    this.dataAccess = dataAccess;

    // The log parser to use
    this.lp = new logParser(espCfg.logger_levels.logParser, this.dataAccess);

    // Now setup the event handlers for both
    this.setupHandlers();
}

// This sets up the various handlers on the FTP synchronizer and the
// socket.io client<->server interactions
EventHandler.prototype.setupHandlers = function () {
    // Grab reference to self
    var self = this;

    // Set the logging level for socket.io
    this.io.set('log level', 1);

    // Handle connection event for socket.io
    this.io.sockets.on('connection', function (socket) {

        // The method to call when a message comes from the client
        socket.on('message', function (data) {
            socket.broadcast.emit('server_message', data);
            socket.emit('server_message', data);
        });

        // Assign a handler to handle when the client disconnects
        socket.on('disconnect', function () {
            console.log('Client Disconnected.');
        });
    });

    // This event happens when the FTP crawler downloads or updates a file local
    // on this server
    self.ftpsync.on('ftp_file_updated', function (data) {
        logger.debug("FTP client updated the local file: ");
        logger.debug(data.file);

        // Make sure we have a deployment
        if (data.deployment) {
            // Make sure it has an esp
            if (data.deployment.esp) {
                // Make sure it has a log file liste
                if (data.deployment.esp.log_file) {
                    // Make sure the incoming event has a local file listed
                    if (data.file) {
                        // Now build the location of where the deployment's log file should be locally
                        var localLogFile = espCfg.espdir + path.sep + "instances" + path.sep +
                            data.deployment.esp.name + path.sep + "deployments" + path.sep + data.deployment.name +
                            path.sep + "data" + path.sep + "raw" + path.sep + data.deployment.esp.log_file;
                        logger.debug("Deployment says log file should be located at " + localLogFile);

                        // Now match against what came in
                        if (localLogFile === data.file) {
                            logger.debug("It's the log file, parse it!");
                            self.lp.submitLogFileForParsing(data.deployment, data.file, function (err, deployment) {
                                logger.debug("Log file for deployment " + deployment.name + " of ESP " + deployment.esp.name +
                                    " finished parsing");
                            });
                        }
                    }
                }
            }
        }
    });
}