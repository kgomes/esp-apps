// Configure logging
var log4js = require('log4js');
log4js.loadAppender('file');

// Create a logger
var logger = log4js.getLogger('data-container-model');

// Export the factory function
exports.createDataContainerModel = function(mongoose, opts, logDir) {

    // If the opts specifies the logging level, set it
    if (opts.loggerLevel) {
        logger.setLevel(opts.loggerLevel);
    }

    // Set the log directory
    if (logDir) {
        log4js.addAppender(log4js.appenders.file(logDir + '/data-container-model.log'), 'data-container-model');
    }

    // Check for the mongoose connection
    if (!mongoose){
        logger.error("No mongoose connection supplied in model factory call");
        return new Error("No mongoose connection supplied in model factory call");
    }

    // Create the DataContainer Schema
    var dataContainerSchema = mongoose.Schema({
        type: String,
        name: String,
        description: String,
        startDate: Date,
        endDate: Date,
        uriString: String,
        mimeType: String,
        recordDescriptions: [{
            recordType: Number,
            bufferStyle: String,
            bufferParseType: String,
            bufferItemSeparator: String,
            bufferLengthType: String,
            parseable: Boolean,
            endian: String,
            recordParseRegExp: String,
            recordVariables: [
                {
                    name: String,
                    description: String,
                    longName: String,
                    format: String,
                    units: String,
                    columnIndex: Number,
                    validMin: String,
                    validMax: String,
                    missingValue: String,
                    parseRegExp: String
                }
            ]
        }]
    });

    // Now compile into a model and return
    return mongoose.model('DataContainer', dataContainerSchema);
};