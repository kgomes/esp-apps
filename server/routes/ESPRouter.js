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
    logger.debug("Creating DeploymentRouter");

    // Grab a handle to this instance for scoping
    var me = this;

    // Grab the DataAccess
    var dataAccess = dataAccess;

    // This is the handler for the route which requests all deployments
    this.handleDeployments = function (req, res) {
        logger.debug('handleDeployments called');
        // There is an option to filter the results to only those deployments with a certain
        // name.  Let's look at the parameters to see if there is a 'name' parameter
        if (req.params.name) {
            logger.debug("A name filter was requested and is " + req.params.name);
            // Since a name filter was requested, query for deployments with that name
            me.dataAccess.getDeploymentsByName(req.params.name, function (err, response) {
                if (err) {
                    // TODO kgomes: handle this error so client knows there was an error
                    logger.error('Error trying to get deployments by name ' + req.query.key);
                    logger.error(err);
                } else {
                    logger.debug('Should have the list of deployments with name: ' + req.params.name);
                    logger.debug(response);
                    res.json(response);
                }
            });
        } else {
            logger.debug("No filters, so all deployments will be returned")
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
    this.handleDeploymentNames = function (req, res) {
        logger.debug('handleDeploymentNames called');
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