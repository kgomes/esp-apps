// Configure logging
var log4js = require('log4js');
log4js.loadAppender('file');
log4js.addAppender(log4js.appenders.file('./logs/ESPRouter.log'), 'ESPRouter');

// Grab the logger
var logger = log4js.getLogger('ESPRouter');

// The constructor function
function ESPRouter(dataAccess, opts) {
    // If the options specify a logger level, set it
    if (opts.loggerLevel) {
        logger.setLevel(opts.loggerLevel);
    }
    logger.debug("Creating ESPRouter");

    // Grab a handle to this instance for scoping
    var me = this;

    // Grab the DataAccess
    this.dataAccess = dataAccess;

    // *****************************************************************
    // This is the handler for the route which requests all ESPs
    // *****************************************************************
    this.getESPs = function (req, res) {
        logger.debug('getESPs called: ', req);

        // Set the content type to JSON
        res.contentType('application/json');

        // There is a possibility of two query parameters, nameOnly and deploymentName
        var nameOnly = req.query.nameOnly;
        var deploymentName = req.query.deploymentName;

        // Call the function and return the results
        me.dataAccess.getAllESPs(nameOnly, deploymentName, function (err, response) {
            if (err) {
                // TODO kgomes: handle the error properly
            } else {
                // Send the results of the query
                res.json(response);
            }
        });
    }
}

// Export the factory method
exports.createESPRouter = function (dataAccess, opts) {
    // Create the new ESPRouter
    return new ESPRouter(dataAccess, opts);
}