// Load any dependencies
var connect = require('connect');
var express = require('express');
var url = require('url');
var passport = require('passport');
var GoogleStrategy = require('passport-google').Strategy;

// Configure logging
var log4js = require('log4js');
log4js.loadAppender('file');
log4js.addAppender(log4js.appenders.file('./logs/AppServer.log'), 'AppServer');

// Grab the logger
var logger = log4js.getLogger('AppServer');

// The constructor function
function AppServer(dataAccess, opts) {
    // Grab the logging level from the options
    if (opts.loggerLevel) {
        logger.setLevel(opts.loggerLevel);
    }

    // A reference to the instance for scoping
    var me = this;

    // Grab the host base URL
    this.hostBaseUrl = opts.hostBaseUrl;

    // Grab the port number from the options, the environment, or a default of 8081
    this.port = (opts.port || process.env.PORT || 8081);

    // Grab the DataAccess
    this.dataAccess = dataAccess;

    // Create the UserRouter
    this.userRouter = require('./routes/UserRouter').createUserRouter(dataAccess, opts.userRouterOptions);

    // Create the ESPRouter
    this.espRouter = require('./routes/ESPRouter').createESPRouter(dataAccess, opts.espRouterOptions);

    // Create the deployment router
    this.deploymentRouter =
        require('./routes/DeploymentRouter').createDeploymentRouter(dataAccess, opts.deploymentRouterOptions);

    // Create the AncillaryData router
    this.ancillaryDataRouter =
        require('./routes/AncillaryDataRouter').createAncillaryDataRouter(dataAccess, opts.ancillaryDataRouterOptions);

    // Create the express server
    this.server = express.createServer();

    // Set up the 'all environment' configuration
    this.server.configure(function () {
        me.server.use(connect.bodyParser());
        me.server.use(express.cookieParser());
        me.server.use(express.session({ secret: 'shhhhhhhhh!'}));
        me.server.use(connect.static(__dirname + '/../app'));
        me.server.use(passport.initialize());
        me.server.use(passport.session());
        me.server.use(me.server.router);
    });

    // Setup the error handler on the server
    this.server.error(function (err, req, res, next) {
        if (err instanceof me.NotFound) {
            logger.warn('File not found: ');
            logger.warn(err);
            logger.warn("req: ", req);
        } else {
            logger.warn("Error caught in handler:", err);
        }
    });

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
    passport.serializeUser(function (user, done) {
        logger.debug("Serializing user: ", user);
        done(null, user._id);
    });
    passport.deserializeUser(function (identifier, done) {
        logger.debug("deserialize identifier: ", identifier);
        // Find the user
        me.dataAccess.getUserById(identifier, function (err, user) {
            if (!user) {
                logger.warn("User not found! Uh oh ...");
                done(null, false);
            } else {
                logger.debug("That is user ", user);
                done(null, user);
            }
        });
    });

    // Configure Passport to use GoogleStrategy for logins
    passport.use(new GoogleStrategy({
            returnURL: this.hostBaseUrl + ":" + this.port + '/auth/google/return',
            realm: this.hostBaseUrl + ":" + this.port + '/'
        },
        function (identifier, profile, done) {
            logger.debug("Strategy callback ", identifier);
            logger.debug("Profile: ", profile);

            // Search the user store for an Google entry matching the given ID
            me.dataAccess.getUserByLoginServiceAndIdentifier("google", identifier, function (err, user) {
                logger.debug("After searching for user, the callback received user ", user);
                // If no user was found, insert a new one
                if (!user) {
                    logger.debug("User does not appear to have been found, must create a new one.");
                    // TODO kgomes, put checks in here for the profile properties

                    // Make sure the profile exists
                    if (profile) {
                        // Create some placeholders
                        var givenName = null;
                        var familyName = null;
                        var email = null;

                        // Now check to see if 'name' exists on the profile
                        if (profile.name) {
                            // Now see if 'givenName' exists on profile.name
                            if (profile.name.givenName && profile.name.givenName !== "") {
                                givenName = profile.name.givenName;
                            }
                            // Now see if 'familyName' exists on profile.name
                            if (profile.name.familyName && profile.name.familyName !== "") {
                                familyName = profile.name.familyName;
                            }
                        }
                        // Now see if the email exists
                        if (profile.emails && profile.emails.length > 0) {
                            email = profile.emails[0].value;
                        }
                    }
                    me.dataAccess.persistUserWithParams(givenName, familyName,
                        email, 'google', identifier, function (err, user) {
                            logger.debug("Returned from persisting new user: ", err);
                            if (err) {
                                logger.warn("Error caught trying to persist new user", err);
                                return done(null, false, {msg: err});
                            } else {
                                return done(null, user);
                            }
                        });
                } else {
                    logger.debug("User was found will call done ...");
                    // Return by calling done callback
                    return done(null, user);
                }
            });
        }
    ));

    // The Google authentication request route
    this.server.get('/auth/google',
        passport.authenticate('google', {failureRedirect: '/'}),
        function (req, res) {
            logger.debug("In callback for /auth/google");
            res.redirect('/');
        });

    // The Google authentication return route
    this.server.get('/auth/google/return',
        passport.authenticate('google', {failureRedirect: '/'}),
        function (req, res) {
            logger.debug("In callback for /auth/google/return");
            res.redirect('/');
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

    // A route to grab the data values for a specific column name for a specific start time of a specific run
    // name of a specific pcr type associated with a specific deployment
    this.server.get('/deployments/:id/pcrs/:pcrType/:runName/:epochSecs/:columnName', this.deploymentRouter.getDeploymentPCRDataRecords);

    // A route to grab the list of column names for a specific start time of a specific run name of a
    // specific pcr type associated with a specific deployment
    this.server.get('/deployments/:id/pcrs/:pcrType/:runName/:epochSecs', this.deploymentRouter.getDeploymentPCRColumnNames);

    // A route to grab the list of epochseconds which are the start times associated with a specific
    // run name of a specific pcr type on a specific deployment
    this.server.get('/deployments/:id/pcrs/:pcrType/:runName', this.deploymentRouter.getDeploymentPCREpochSeconds);

    // A route to grab the list of run names that happened on a specific PCR type on a specific deployment
    this.server.get('/deployments/:id/pcrs/:pcrType', this.deploymentRouter.getDeploymentPCRRunNames);

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

    // The 404 Route (ALWAYS Keep this as the last route)
    this.server.get('/*', function (req, res) {
        throw new me.NotFound;
    });

    // Start listening on a port
    this.server.listen(this.port);
    logger.info('Listening on port ' + this.port);

    // This method returns the Express server (I use it to connect up a SocketIO instance
    this.getServer = function () {
        // Return the server
        return me.server;
    }

    // This is the function that is used when a resource is not found
    this.NotFound = function (msg) {
        this.name = 'NotFound';
        Error.call(this, msg);
        Error.captureStackTrace(this, arguments.callee);
    }
}

// The factory method for constructing the server
exports.createAppServer = function (dataAccess, opts) {
    // Create the new AppServer
    return new AppServer(dataAccess, opts);
}