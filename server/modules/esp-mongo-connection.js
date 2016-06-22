// Configure logging for the MongoDB connection
var log4js = require('log4js');
log4js.loadAppender('file');

// Create a logger
var logger = log4js.getLogger('esp-mongo-connection');

// Require the necessary modules
var mongoose = require('mongoose');

// This is the function that holds all the functionality to interact with the MongoDB
function MongoConnection(opts, logDir) {

    // If the opts specifies the logging level, set it
    if (opts.loggerLevel) {
        logger.setLevel(opts.loggerLevel);
    }

    // Set the log directory
    if (logDir) {
        log4js.addAppender(log4js.appenders.file(logDir + '/esp-mongo-connection.log'), 'esp-mongo-connection');
    }

    // Verify the options specify the MongoDB host and database name
    logger.debug("Setting up connection to MongoDB ...");
    if (!opts.connectionUrl) {
        logger.error("MongoDB connection URL not specified.");
        return new Error("MongoDB connection URL not specified");
    }

    // Store the URL
    var connectionUrl = opts.connectionUrl;
    
    // Grab the Mongoose connection object
    var db = mongoose.connection;

    // Set up event handlers for MongoDB connection
    db.on('connecting', function () {
        logger.info('connecting to MongoDB...');
    });
    db.on('error', function (error) {
        logger.error('Error in MongoDB connection: ' + error);
        mongoose.disconnect();
    });
    db.on('connected', function () {
        logger.info('MongoDB connected');
    });
    db.once('open', function () {
        logger.info('MongoDB connection opened');
    });
    db.on('reconnected', function () {
        logger.info('MongoDB reconnected');
    });
    db.on('disconnected', function () {
        logger.warn('MongoDB disconnected');
        mongoose.connect(connectionUrl, {server: {auto_reconnect: true}});
    });

    // Connect using the string given
    mongoose.connect(connectionUrl, {server: {auto_reconnect: true}});
    
    // Now let's create our models
    var source = require('./models/source').createSourceModel(mongoose, opts.sourceOpts, logDir);
    var dataContainer = require('./models/data-container').createDataContainerModel(mongoose, opts.dataContainerOpts, logDir);
    var deployment = require('./models/deployment').createDeploymentModel(mongoose, opts.deploymentOpts, logDir);

    // The method to return the ESP model
    this.getSourceModel = function () {
        return source;
    }

    // The method to return the DataContainer model
    this.getDataContainerModel = function () {
        return dataContainer;
    }

    // The method to return the Deployment model
    this.getDeploymentModel = function () {
        return deployment;
    }
}

// Export the factory method
exports.createMongoConnection = function (opts, logDir) {
    return new MongoConnection(opts, logDir);
};