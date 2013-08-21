// Configure logging
var log4js = require('log4js');
log4js.loadAppender('file');
log4js.addAppender(log4js.appenders.file('./logs/DeploymentRouter.log'), 'DeploymentRouter');

// Grab the logger
var logger = log4js.getLogger('DeploymentRouter');

// The constructor function
function DeploymentRouter(dataAccess, opts) {
    // If the options specify a logger level, set it
    if (opts.loggerLevel) {
        logger.setLevel(opts.loggerLevel);
    }
    logger.debug('Creating DeploymentRouter');

    // Grab a handle to this instance for scoping
    var me = this;

    // Grab the DataAccess
    this.dataAccess = dataAccess;

    // This is the handler for the route which requests all deployments
    this.getDeployments = function (req, res) {
        logger.debug('getDeployments called');

        // Set the content type to JSON
        res.contentType('application/json');

        // There is an option to filter the results to only those deployments with a certain
        // name.  Let's look at the parameters to see if there is a 'name' parameter
        if (req.query.name) {
            logger.debug('A name filter was requested and is ' + req.query.name);
            // Since a name filter was requested, query for deployments with that name
            me.dataAccess.getDeploymentsByName(req.query.name, function (err, response) {
                if (err) {
                    // TODO kgomes: handle this error so client knows there was an error
                    logger.error('Error trying to get deployments by name ' + req.query.name);
                    logger.error(err);
                } else {
                    logger.debug('Should have the list of deployments with name: ' + req.query.name);
                    logger.debug(response);
                    res.json(response);
                }
            });
        } else if (req.query.open) {
            logger.debug("The request is for open deployments only");
            me.dataAccess.getOpenDeployments(function (err, response) {
                if (err) {
                    // TODO kgomes: handle the error properly
                } else {
                    // Send the results of the query
                    res.json(response);
                }
            });
        } else {
            logger.debug('No filters, so all deployments will be returned')
            // First thing to do is see if there is a parameter that is asking for just the names
            me.dataAccess.getAllDeployments(function (err, response) {
                if (err) {
                    // TODO kgomes: handle the error properly
                } else {
                    // Send the results of the query
                    res.json(response);
                }
            });
        }
    }

    // This is the handler to handle requests for the names of all deployments
    this.getDeploymentNames = function (req, res) {
        logger.debug('getDeploymentNames called');

        // Set the content type to JSON
        res.contentType('application/json');

        me.dataAccess.getDeploymentNames(function (err, response) {
            if (err) {
                // TODO handle the error back to caller
            } else {
                logger.debug('Got response:');
                logger.debug(response);
                res.json(response);
            }
        })

    }
}

// Export the factory method
exports.createDeploymentRouter = function (dataAccess, opts) {
    // Create the new DeploymentRouter
    return new DeploymentRouter(dataAccess, opts);
}