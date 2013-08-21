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

    // This is the handler for the route which requests all deployments
    this.getESPs = function (req, res) {
        logger.debug('getESPs called: ', req);

        // Set the content type to JSON
        res.contentType('application/json');

        // There is an option to filter the results to only those ESPs that are part of a
        // deployment specified by a filter parameter called 'deploymentName'
        if (req.query.deploymentName) {
            logger.debug("A deploymentName filter was requested and is " + req.query.deploymentName);
            me.dataAccess.getESPsInDeployment(req.query.deploymentName, function (err, response) {
                if (err) {
                    // TODO handle the error
                } else {
                    logger.debug('Got the response:', response);
                    res.send(response);
                }
            });
        } else {
            logger.debug("No filters, so all ESPs will be returned")
            me.dataAccess.getAllESPs(function (err, response) {
                if (err) {
                    // TODO kgomes: handle the error properly
                } else {
                    // Send the results of the query
                    res.json(response);
                }
            });
        }
    }

    // *****************************************************************
    // This method handles the request for all the names of the ESPs
    // *****************************************************************
    this.getESPNames = function (req, res) {
        logger.debug('getESPNames')

        // Set the content type to JSON
        res.contentType('application/json');

        if (req.query.deploymentName) {
            logger.debug('A deploymentName filter was requested and is ' + req.query.deploymentName);
            me.dataAccess.getESPNamesInDeployment(req.query.deploymentName, function (err, response) {
                if (err) {
                    // TODO handle the error
                } else {
                    logger.debug('Got the response:', response);
                    res.send(response);
                }
            });
        } else {
            logger.debug('No filters, so all ESP names will be returned')
            me.dataAccess.getAllESPNames(function (err, response) {
                if (err) {
                    // TODO kgomes: handle the error properly
                } else {
                    // Send the results of the query
                    res.json(response);
                }
            });
        }
    }
}

// Export the factory method
exports.createESPRouter = function (dataAccess, opts) {
    // Create the new ESPRouter
    return new ESPRouter(dataAccess, opts);
}