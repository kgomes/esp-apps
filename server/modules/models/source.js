// Configure logging
var log4js = require('log4js');
log4js.loadAppender('file');

// Create a logger
var logger = log4js.getLogger('source-model');

// Export the factory function
exports.createSourceModel = function (mongoose, opts, logDir) {

    // If the opts specifies the logging level, set it
    if (opts.loggerLevel) {
        logger.setLevel(opts.loggerLevel);
    }

    // Set the log directory
    if (logDir) {
        log4js.addAppender(log4js.appenders.file(logDir + '/source-model.log'), 'source-model');
    }

    // Check for the mongoose connection
    if (!mongoose) {
        logger.error("No mongoose connection supplied in ESP model factory call");
        return new Error("No mongoose connection supplied in ESP model factory call");
    }

    // Create the Source Schema
    var sourceSchema = mongoose.Schema({
        name: {
            type: String,
            required: true
        },
        type: {
            type: String,
            required: true
        },
        manufacturer: {
            name: String,
            model: String,
            serialNumber: String
        },
        uuid: String,
        mode: String,
        logFile: String,
        ftpHost: String,
        ftpPort: String,
        ftpUsername: String,
        ftpPassword: String,
        ftpWorkingDirectory: String
    });

    // Now compile into a model and return
    return mongoose.model('Source', sourceSchema);
};