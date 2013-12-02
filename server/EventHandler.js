// Read in the ESP application configuration
var path = require('path');

// Configure logging
var log4js = require('log4js');
log4js.loadAppender('file');
log4js.addAppender(log4js.appenders.file('./logs/EventHandler.log'), 'EventHandler');

// Grab the logger
var logger = log4js.getLogger('EventHandler');

// The constructor
//function EventHandler(io, deploymentFileSync, dataAccess, logParser, baseDir, opts) {
function EventHandler(io, opts) {
    logger.info("Creating EventHandler with logger level " + opts.loggerLevel);
    // Check for logging level
    if (opts.loggerLevel) {
        logger.setLevel(opts.loggerLevel);
    }

    // Grab a handle to this object for scope management
    var me = this;

    // Assign the socket.io instance locally
    this.io = io;

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

    }

    // *****************************************************************************
    // This is the function to handle the event when a client connects via socket.io
    // *****************************************************************************
    this.handleIOSocketConnection = function (socket) {
        logger.debug("Client connected: ", socket);

        // The method to call when a message comes from the client
        socket.on('message', function (data) {
            logger.debug("Message received, will broadcast: ", data);
            socket.broadcast.emit('serverMessage', data);
            socket.emit('serverMessage', data);
        });

        // Assign a handler to handle when the client disconnects
        socket.on('disconnect', function () {
            logger.debug("Client disconnected.");
        });
    };
}

// Export the factory method
exports.createEventHandler = function (io, opts) {
    // Create the new EventHandler
    var newEventHandler = new EventHandler(io, opts);

    // Now setup the event handlers for both
    newEventHandler.setupHandlers();

    // Now return it
    return newEventHandler;
}