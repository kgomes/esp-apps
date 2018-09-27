// Load any dependencies
var express = require('express');

// Configure logging
var log4js = require('log4js');
log4js.loadAppender('file');

// Grab the logger
var logger = log4js.getLogger('AppServer');

// The constructor function
function AppServer(dataAccess, dataDir, opts, logDir) {
    // Grab the logging level from the options
    if (opts.loggerLevel) {
        logger.setLevel(opts.loggerLevel);
    }

    // And set log directory
    log4js.addAppender(log4js.appenders.file(logDir + '/AppServer.log'), 'AppServer');

    // A reference to the instance for scoping
    var me = this;

    // Grab the host base URL
    this.hostBaseUrl = opts.hostBaseUrl;

    // Grab the port number from the options, the environment, or a default of 8081
    this.port = (opts.port || process.env.PORT || 8081);

    // Grab the DataAccess
    this.dataAccess = dataAccess;

    // Create the UserRouter
    this.userRouter = require('./routes/UserRouter').createUserRouter(dataAccess, opts.userRouterOptions, logDir);

    // Create the ESPRouter
    this.espRouter = require('./routes/ESPRouter').createESPRouter(dataAccess, opts.espRouterOptions, logDir);

    // Create the deployment router
    this.deploymentRouter =
        require('./routes/DeploymentRouter').createDeploymentRouter(dataAccess, opts.deploymentRouterOptions, logDir);

    // Create the AncillaryData router
    this.ancillaryDataRouter =
        require('./routes/AncillaryDataRouter').createAncillaryDataRouter(dataAccess, opts.ancillaryDataRouterOptions, logDir);

    // Create the express server
    this.server = express();
    this.server.use(express.static('../app'));
    this.server.use('/data', express.static(dataDir));

    // Set up the middleware to allow CORS
    this.server.use(function(req, res, next) {
        res.header("Access-Control-Allow-Origin", "*");
        res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
        next();
    });

    // **********************************************
    // Define all the routes
    // **********************************************

    // A route for returning the list of deployments
    this.server.get('/deployments', this.deploymentRouter.getDeployments);

    // A route to just get a specific deployment by it's ID
    this.server.get('/deployments/:id', this.deploymentRouter.getDeploymentByID);

    // A route to grab the error list associated with a specific ID
    this.server.get('/deployments/:id/errors', this.deploymentRouter.getDeploymentErrors);

    // A route to grab the protocolRuns list associated with a specific ID
    this.server.get('/deployments/:id/protocolRuns', this.deploymentRouter.getDeploymentProtocolRuns);

    // A route to grab the sample list associated with a specific ID
    this.server.get('/deployments/:id/samples', this.deploymentRouter.getDeploymentSamples);

    // A route to grab the image list associated with a specific ID
    this.server.get('/deployments/:id/images', this.deploymentRouter.getDeploymentImages);

    // A route to grab the data values for a specific column name for a specific start time of a specific
    // pcr type associated with a specific deployment
    this.server.get('/deployments/:id/pcrs/:pcrType/:columnName/:epochSecs', this.deploymentRouter.getDeploymentPCRDataRecords);

    // A route to grab the list of epochseconds which are the start times associated with a specific
    // column name of a specific pcr type on a specific deployment
    this.server.get('/deployments/:id/pcrs/:pcrType/:columnName', this.deploymentRouter.getDeploymentPCREpochSeconds);

    // A route to grab the list of column names that happened on a specific PCR type on a specific deployment
    this.server.get('/deployments/:id/pcrs/:pcrType', this.deploymentRouter.getDeploymentPCRColumnNames);

    // A route to grab the list of pcr type run on a specific deployment
    this.server.get('/deployments/:id/pcrs', this.deploymentRouter.getDeploymentPCRTypes);

    // A router to get a listing of all the ESPs
    this.server.get('/esps', this.espRouter.getESPs);

    // A route for ancillary data
    this.server.get('/ancdata/:sourceID', this.ancillaryDataRouter.getAncillaryData);

    // A route to get a list of all users
    this.server.get('/users', this.userRouter.getUsers);

    // A route to get a specific user
    this.server.get('/users/:id', this.userRouter.getUserById);

    // A Route for Creating a 500 Error (Useful to keep around)
    this.server.get('/500', function (req, res) {
        throw new Error('This is a 500 Error');
    });

    // Start listening on a port
    this.server.listen(this.port);
    logger.info('Listening on port ' + this.port);

    // This method returns the Express server (I use it to connect up a SocketIO instance
    this.getServer = function () {
        // Return the server
        return me.server;
    }
}

// The factory method for constructing the server
exports.createAppServer = function (dataAccess, dataDir, opts, logDir) {
    // Create the new AppServer
    return new AppServer(dataAccess, dataDir, opts, logDir);
}