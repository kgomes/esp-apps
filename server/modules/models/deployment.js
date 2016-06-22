// Configure logging
var log4js = require('log4js');
log4js.loadAppender('file');

// Create a logger
var logger = log4js.getLogger('deployment-model');

// Export the factory function
exports.createDeploymentModel = function (mongoose, opts, logDir) {

    // If the opts specifies the logging level, set it
    if (opts.loggerLevel) {
        logger.setLevel(opts.loggerLevel);
    }

    // Set the log directory
    if (logDir) {
        log4js.addAppender(log4js.appenders.file(logDir + '/deployment-model.log'), 'deployment-model');
    }

    // Check for the mongoose connection
    if (!mongoose) {
        logger.error("No mongoose connection supplied in model factory call");
        return new Error("No mongoose connection supplied in model factory call");
    }

    // Create the Deployment Schema
    var deploymentSchema = mongoose.Schema({
            name: String,
            description: String,
            startDate: Date,
            endDate: Date,
            outputs: [{
                type: mongoose.Schema.Types.ObjectId,
                ref: 'DataContainer'
            }],
            childDeployments: [{
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Deployment'
            }]
        });

    // Now compile into a model and return
    return mongoose.model('Deployment', deploymentSchema);
};