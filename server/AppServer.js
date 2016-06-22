// Load any dependencies
var path = require('path');
var http = require('http');
var express = require('express');
var methodOverride = require('method-override');
var session = require('express-session');
var bodyParser = require('body-parser');
var errorHandler = require('errorhandler');
var favicon = require('serve-favicon');
var jwt = require('express-jwt');
var csv = require('express-csv');
var url = require('url');

// Configure logging
var log4js = require('log4js');
log4js.loadAppender('file');

// Grab the logger
var logger = log4js.getLogger('AppServer');

// The constructor function
function AppServer(dataAccess, opts, logDir) {

    // Grab the logging level from the options
    if (opts.loggerLevel) {
        logger.setLevel(opts.loggerLevel);
    }

    // And set log directory
    log4js.addAppender(log4js.appenders.file(logDir + '/AppServer.log'), 'AppServer');

    // A reference to the instance for scoping
    //var me = this;

    var jwtCheck = jwt({
        secret: new Buffer('cfA8k_kNpe9WErWZM6t5rHIAlGaA4nacn5_-vTRjc9XfFODyb0Qw10q6XsN_3ECi', 'base64'),
        audience: 'zn8c9WnJFFqzzkVjnR7SDkVpFL54juUN'
    });

    // Grab the host base URL
    var hostBaseUrl = opts.hostBaseUrl;

    // Create the API router
    var api = require("./routes/api-router-v1").createAPIRouter(opts.apiOptions, logDir).getRouter();

    // Grab the DataAccess
    var dataAccess = dataAccess;

    // Create the UserRouter
    var userRouter = require('./routes/UserRouter').createUserRouter(dataAccess, opts.userRouterOptions, logDir);

    // Create the ESPRouter
    var espRouter = require('./routes/ESPRouter').createESPRouter(dataAccess, opts.espRouterOptions, logDir);

    // Create the deployment router
    var deploymentRouter =
        require('./routes/DeploymentRouter').createDeploymentRouter(dataAccess, opts.deploymentRouterOptions, logDir);

    // Create the AncillaryData router
    var ancillaryDataRouter =
        require('./routes/AncillaryDataRouter').createAncillaryDataRouter(dataAccess, opts.ancillaryDataRouterOptions, logDir);

    // Create the express server
    var app = express();

    // Grab the port number from the options, the environment, or a default of 8081
    app.set('port', opts.port || process.env.PORT || 8081);
    app.use(favicon(__dirname + '/../app/favicon.ico'));
    app.use(methodOverride());
    app.use(session({ resave: true,
        saveUninitialized: true,
        secret: 'uwotm8' }));
    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({ extended: true }));
    app.use(express.static(path.join(__dirname, '../app')));

// error handling middleware should be loaded after the loading the routes
    if ('development' == app.get('env')) {
        app.use(errorHandler());
    }

    var server = http.createServer(app);
    server.listen(app.get('port'), function(){
        console.log('Express server listening on port ' + app.get('port'));
    });
    //-------------------------
    // Set up the middleware to allow CORS
    // app.use(function(req, res, next) {
    //     res.header("Access-Control-Allow-Origin", "*");
    //     res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    //     next();
    // });

    // Set up the 'all environment' configuration
    // app.use(connect.bodyParser());
    // app.use(express.cookieParser());
    // app.use(express.session({ secret: 'shhhhhhhhh!'}));
  //  app.use(connect.static(__dirname + '/../app'));
    // server.use(passport.initialize());
    // server.use(passport.session());
//    app.use(app.router);

    // Setup the error handler on the server
    // app.error(function (err, req, res, next) {
    //     if (err instanceof me.NotFound) {
    //         logger.warn('File not found: ');
    //         logger.warn(err);
    //         logger.warn("req: ", req);
    //     } else {
    //         logger.warn("Error caught in handler:", err);
    //     }
    // });

    // **********************************************************
    // Set up the passport authentication strategies and handlers
    // **********************************************************

    // Passport session setup.
    //   To support persistent login sessions, Passport needs to be able to
    //   serialize users into and deserialize users out of the session.  Typically,
    //   this will be as simple as storing the user ID when serializing, and finding
    //   the user by ID when deserializing.  However, since this example does not
    //   have a database of user records, the OpenID identifier is serialized and
    //   deserialized.
    // passport.serializeUser(function (user, done) {
    //     logger.debug("Serializing user: ", user);
    //     done(null, user._id);
    // });
    // passport.deserializeUser(function (identifier, done) {
    //     logger.debug("deserialize identifier: ", identifier);
    //     // Find the user
    //     me.dataAccess.getUserById(identifier, function (err, user) {
    //         if (!user) {
    //             logger.warn("User not found! Uh oh ...");
    //             done(null, false);
    //         } else {
    //             logger.debug("That is user ", user);
    //             done(null, user);
    //         }
    //     });
    // });
    //
    // // Configure Passport to use GoogleStrategy for logins
    // passport.use(new GoogleStrategy({
    //         returnURL: this.hostBaseUrl + ":" + this.port + '/auth/google/return',
    //         realm: this.hostBaseUrl + ":" + this.port + '/'
    //     },
    //     function (identifier, profile, done) {
    //         logger.debug("Strategy callback ", identifier);
    //         logger.debug("Profile: ", profile);
    //
    //         // Search the user store for an Google entry matching the given ID
    //         me.dataAccess.getUserByLoginServiceAndIdentifier("google", identifier, function (err, user) {
    //             logger.debug("After searching for user, the callback received user ", user);
    //             // If no user was found, insert a new one
    //             if (!user) {
    //                 logger.debug("User does not appear to have been found, must create a new one.");
    //                 // TODO kgomes, put checks in here for the profile properties
    //
    //                 // Make sure the profile exists
    //                 if (profile) {
    //                     // Create some placeholders
    //                     var givenName = null;
    //                     var familyName = null;
    //                     var email = null;
    //
    //                     // Now check to see if 'name' exists on the profile
    //                     if (profile.name) {
    //                         // Now see if 'givenName' exists on profile.name
    //                         if (profile.name.givenName && profile.name.givenName !== "") {
    //                             givenName = profile.name.givenName;
    //                         }
    //                         // Now see if 'familyName' exists on profile.name
    //                         if (profile.name.familyName && profile.name.familyName !== "") {
    //                             familyName = profile.name.familyName;
    //                         }
    //                     }
    //                     // Now see if the email exists
    //                     if (profile.emails && profile.emails.length > 0) {
    //                         email = profile.emails[0].value;
    //                     }
    //                 }
    //                 me.dataAccess.persistUserWithParams(givenName, familyName,
    //                     email, 'google', identifier, function (err, user) {
    //                         logger.debug("Returned from persisting new user: ", err);
    //                         if (err) {
    //                             logger.warn("Error caught trying to persist new user", err);
    //                             return done(null, false, {msg: err});
    //                         } else {
    //                             return done(null, user);
    //                         }
    //                     });
    //             } else {
    //                 logger.debug("User was found will call done ...");
    //                 // Return by calling done callback
    //                 return done(null, user);
    //             }
    //         });
    //     }
    // ));
    //
    // // The Google authentication request route
    // this.server.get('/auth/google',
    //     passport.authenticate('google', {failureRedirect: '/'}),
    //     function (req, res) {
    //         logger.debug("In callback for /auth/google");
    //         res.redirect('/');
    //     });
    //
    // // The Google authentication return route
    // this.server.get('/auth/google/return',
    //     passport.authenticate('google', {failureRedirect: '/'}),
    //     function (req, res) {
    //         logger.debug("In callback for /auth/google/return");
    //         res.redirect('/');
    //     });
    //

    // **********************************************
    // Define all the routes
    // **********************************************

    // Set up the api routes
    app.use('/api/v1', api);

    // Let's protect all API calls
    //app.use('/deployments', jwtCheck);

    // A route for returning the list of deployments
    app.get('/deployments', deploymentRouter.getDeployments);

    // A route to just get a specific deployment by it's ID
    app.get('/deployments/:id', deploymentRouter.getDeploymentByID);

    // A route to grab the error list associated with a specific ID
    app.get('/deployments/:id/errors', deploymentRouter.getDeploymentErrors);

    // A route to grab the protocolRuns list associated with a specific ID
    app.get('/deployments/:id/protocolRuns', deploymentRouter.getDeploymentProtocolRuns);

    // A route to grab the sample list associated with a specific ID
    app.get('/deployments/:id/samples', deploymentRouter.getDeploymentSamples);

    // A route to grab the image list associated with a specific ID
    app.get('/deployments/:id/images', deploymentRouter.getDeploymentImages);

    // A route to grab the data values for a specific column name for a specific start time of a specific
    // pcr type associated with a specific deployment
    app.get('/deployments/:id/pcrs/:pcrType/:columnName/:epochSecs', deploymentRouter.getDeploymentPCRDataRecords);

    // A route to grab the list of epochseconds which are the start times associated with a specific
    // column name of a specific pcr type on a specific deployment
    app.get('/deployments/:id/pcrs/:pcrType/:columnName', deploymentRouter.getDeploymentPCREpochSeconds);

    // A route to grab the list of column names that happened on a specific PCR type on a specific deployment
    app.get('/deployments/:id/pcrs/:pcrType', deploymentRouter.getDeploymentPCRColumnNames);

    // A route to grab the list of pcr type run on a specific deployment
    app.get('/deployments/:id/pcrs', deploymentRouter.getDeploymentPCRTypes);

    // A router to get a listing of all the ESPs
    app.get('/esps', espRouter.getESPs);

    // A route for ancillary data
    app.get('/ancdata/:sourceID', ancillaryDataRouter.getAncillaryData);

    // A route to get a list of all users
    app.get('/users', userRouter.getUsers);

    // A route to get a specific user
    app.get('/users/:id', userRouter.getUserById);

    // A Route for Creating a 500 Error (Useful to keep around)
    // app.get('/500', function (req, res) {
    //     throw new Error('This is a 500 Error');
    // });

    // The 404 Route (ALWAYS Keep this as the last route)
    // app.get('/*', function (req, res) {
    //     throw new NotFound;
    // });

    // Start listening on a port
    // app.listen(port);
    // logger.info('Listening on port ' + port);
    //
    // This method returns the Express server (I use it to connect up a SocketIO instance
    // this.getServer = function () {
    //     // Return the server
    //     return app;
    // }
    //
    // // This is the function that is used when a resource is not found
    // var NotFound = function (msg) {
    //     name = 'NotFound';
    //     Error.call(this, msg);
    //     Error.captureStackTrace(this, arguments.callee);
    // }
}

// The factory method for constructing the server
exports.createAppServer = function (dataAccess, opts, logDir) {
    // Create the new AppServer
    return new AppServer(dataAccess, opts, logDir);
}