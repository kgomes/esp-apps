// Configure logging for the MongoDB connection
var log4js = require('log4js');
log4js.loadAppender('file');

// Create a logger
var logger = log4js.getLogger('esp-model');

// Export the factory function
exports.createESPModel = function(mongoose, opts, logDir) {

    // If the opts specifies the logging level, set it
    if (opts.loggerLevel) {
        logger.setLevel(opts.loggerLevel);
    }

    // Set the log directory
    if (logDir) {
        log4js.addAppender(log4js.appenders.file(logDir + '/esp-model.log'), 'esp-model');
    }

    // Check for the mongoose connection
    if (!mongoose){
        logger.error("No mongoose connection supplied in ESP model factory call");
        return new Error("No mongoose connection supplied in ESP model factory call");
    }

    // Create the ESP Schema
    var espSchema = mongoose.Schema({
        name: String,
        mode: String,
        logFile: String,
        ftpHost: String,
        ftpPort: String,
        ftpUsername: String,
        ftpPassword: String,
        ftpWorkingDirectory: String
    });

    // Now compile into a model and return
    return mongoose.model('ESP', espSchema);
};