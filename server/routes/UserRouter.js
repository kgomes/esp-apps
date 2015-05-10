// Configure logging
var log4js = require('log4js');
log4js.loadAppender('file');

// Grab the logger
var logger = log4js.getLogger('UserRouter');

// The constructor function
function UserRouter(dataAccess, opts, logDir) {
    // If the options specify a logger level, set it
    if (opts.loggerLevel) {
        logger.setLevel(opts.loggerLevel);
    }
    logger.debug("Creating UserRouter");

    // Set log directory
    log4js.addAppender(log4js.appenders.file(logDir + '/UserRouter.log'), 'UserRouter');

    // Grab a handle to this instance for scoping
    var me = this;

    // Grab the DataAccess
    this.dataAccess = dataAccess;

    // This is the handler for the route which requests all Users
    this.getUsers = function (req, res) {
        logger.debug('getUsers called: ', req);

        // Set the content type to JSON
        res.contentType('application/json');

        // There is an option to filter the results to only those users with a given email
        if (req.query.email) {
            logger.debug("A email filter was requested and is " + req.query.email);
//            me.dataAccess.getESPsInDeployment(req.query.deploymentName, function (err, response) {
//                if (err) {
//                    // TODO handle the error
//                } else {
//                    logger.debug('Got the response:', response);
//                    res.send(response);
//                }
//            });
        } else {
            logger.debug("No filters, so all Users will be returned")
            me.dataAccess.getAllUsers(function (err, response) {
                if (err) {
                    // TODO kgomes: handle the error properly
                } else {
                    // Send the results of the query
                    res.json(response);
                }
            });
        }
    }

    // This is a handler to find a specific user by ID
    this.getUserById = function (req, res) {
        logger.debug("getUserByID called with params: ", req.params);

        // Set the content type to JSON
        res.contentType('application/json');

        // Verify there is an ID first
        if (req.params.id) {
            logger.debug("Will look for user with ID " + req.params.id);
            me.dataAccess.getUserById(req.params.id, function (err, response) {
               if (err){
                   // TODO kgomes: handle this error
               } else {
                   // Send the results
                   res.json(response);
               }
            });
        } else {
            logger.warn("No ID specified in getUserById");
        }
    }
}

// Export the factory method
exports.createUserRouter = function (dataAccess, opts, logDir) {
    // Create the new UserRouter
    return new UserRouter(dataAccess, opts, logDir);
}