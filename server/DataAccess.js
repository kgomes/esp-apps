// Grab dependencies
var util = require('util');
var fs = require('fs');
var cradle = require('cradle');
var os = require('os');
var cluster = require('cluster');
var pg = require('pg');
var path = require('path');
var fs = require('fs');
var readline = require('readline');
var stream = require('stream');
var moment = require('moment');
var eventEmitter = require('events').EventEmitter;

// Configure logging for the DataStore
var log4js = require('log4js');
log4js.loadAppender('file');
log4js.addAppender(log4js.appenders.file('./logs/DataAccess.log'), 'DataAccess');

// Grab the logger
var logger = log4js.getLogger('DataAccess');

// Inherit event emitter functionality
util.inherits(DataAccess, eventEmitter);

// The constructor function
function DataAccess(opts) {
    // TODO kgomes, verify all options are present in the incoming 'opts' object

    // Set the logger level
    if (opts.loggerLevel) {
        logger.setLevel(opts.loggerLevel);
    }

    // Grab reference to this for scoping
    var me = this;

    // Grab the number of CPUs for workers
    this.numberOfCPUs = os.cpus().length;
    logger.info("There are " + this.numberOfCPUs + " CPUs on this server");

    // Grab the number of points that will be batch inserted
    this.numAncillaryPointsToBatch = opts.numAncillaryPointsToBatch;

    // Set the local properties for the data connection to couch DB
    this.couchConfiguration = {
        host: opts.couchHost,
        port: opts.couchPort,
        ssl: opts.couchSSL,
        username: opts.couchUsername,
        password: opts.couchPassword,
        database: opts.couchDatabase
    };

    // Grab a connection to the ESP CouchDB
    this.couchDBConn = new (cradle.Connection)(this.couchConfiguration.host,
        this.couchConfiguration.port).database(this.couchConfiguration.database);
    logger.debug('CouchDB Connection');
    logger.debug('Host: ' + this.couchConfiguration.host);
    logger.debug('Port: ' + this.couchConfiguration.port);
    logger.debug('SSL?: ' + this.couchConfiguration.ssl);
    logger.debug('Username: ' + this.couchConfiguration.username);
    logger.debug('Database: ' + this.couchConfiguration.database);

    // Check to see if the database exists
    this.couchDBConn.exists(function (err, exists) {
        if (err) {
            logger.fatal('Error trying to connect to CouchDB:');
            logger.fatal(err);
            throw err;
        } else if (exists) {
            logger.info('The ESP Couch database exists');
        } else {
            logger.warn('The ESP Couch database does NOT exist yet');
        }
    });

    // Set the local properties for the PostgreSQL connection
    this.pgConfiguration = {
        protocol: opts.pgProtocol,
        host: opts.pgHost,
        port: opts.pgPort,
        username: opts.pgUsername,
        password: opts.pgPassword,
        database: opts.pgDatabase
    };

    // Form the connection string
    this.pgConnectionString = this.pgConfiguration.protocol + '://' + this.pgConfiguration.username + ':' +
        this.pgConfiguration.password + '@' + this.pgConfiguration.host + ':' +
        this.pgConfiguration.port + '/' + this.pgConfiguration.database;
    logger.debug('PostgreSQL Connection');
    logger.debug('Protocol: ' + this.pgConfiguration.protocol);
    logger.debug('Host: ' + this.pgConfiguration.host);
    logger.debug('Port: ' + this.pgConfiguration.port);
    logger.debug('Username: ' + this.pgConfiguration.username);
    logger.debug('Database: ' + this.pgConfiguration.database);

    // This is an array of ancillary data files that are currently in the process of being sync'd
    this.ancillaryFilesBeingSyncd = [];

    // This is an object that maintains arrays of ancillary records so that inserts can be
    // done in a batched method for performance reasons.
    this.ancillaryDataRecordsToBeInserted = {};

    // This is an object that can be used as a local cache to lookup sourceID's for ancillary
    // data
    this.ancillaryDataSourceIDLookup = {};

    // This is an object that holds callbacks that are waiting to be executed during source ID look ups.
    // Basically, when sourceIDs are being constructed, there can be more than one request for an ID pending
    // and so we end up with multiple duplicate sourceID rows.  While an insert is happening, we can queue
    // up callbacks that are run to prevent this.
    this.ancillaryDataSourceIDLookupCallbackQueue = {};

    // ***********************************************************
    // This function returns an array of deployments from the
    // data store.  The deployments are shallow and only have
    // flags that indicate if there is further data associated
    // with errors, protocolRuns, samples, images, etc.  The
    // results can be filtered using parameters based on whether
    // or not the caller only wants open deployments (openOnly=true),
    // an array of deployment names only (namesOnly=true), or
    // if they want a specific deployment by its name (name=XXXX)
    // ***********************************************************
    this.getDeployments = function (callback) {
        // Query for all Deployments in the shallow form
        this.couchDBConn.view('deployments/all', function (err, res) {
                // Check for an error first
                if (err) {
                    logger.error('Error trying to get all deployments! ', err);
                } else {
                    logger.debug('Got Deployments from CouchDB: ', res);

                    // Create an array to process
                    var deploymentArray = [];

                    // Push the Deployments
                    for (var i = 0; i < res.length; i++) {
                        deploymentArray.push(res[i].value);
                    }

                    // Now pass it to the callback function
                    callback(err, deploymentArray);
                }
            }
        );
    }

    // ***********************************************************
    // This method returns an array of the unique deployment names for all deployments in the DB
    // ***********************************************************
    this.getDeploymentNames = function (callback) {
        // Run the couch query
        this.couchDBConn.view('deployments/names', {group: true, reduce: true}, function (err, res) {
                // Check for an error first
                if (err) {
                    logger.error('Error trying to get deployments names');
                    logger.error(err);
                } else {
                    logger.debug('Got names');

                    // Create an array to process
                    var deploymentNameArray = [];

                    // Put the deployment name in the array
                    for (var i = 0; i < res.length; i++) {
                        deploymentNameArray.push(res[i].key);
                    }

                    // Now pass it to the callback function
                    callback(err, deploymentNameArray);
                }
            }
        );
    }


    // ***********************************************************
    // The function gets all deployments that have no end date
    // ***********************************************************
    this.getOpenDeployments = function (callback) {

        // Query for data and use the given callback
        this.couchDBConn.view('deployments/open', function (err, res) {
                // Check for an error first
                if (err) {
                    logger.error('Error trying to get open deployments!');
                    logger.error(err);
                } else {
                    logger.debug('Got deployments from couch');
                    //logger.debug(res);
                    // Create an array to process
                    var deploymentArray = [];

                    // Extract just the deployments and put them in the array
                    for (var i = 0; i < res.length; i++) {
                        deploymentArray.push(res[i].value);
                    }

                    // Now pass it to the callback function
                    callback(err, deploymentArray);
                }
            }
        );
    }

    // ***********************************************************
    // This function returns the deployments that have the given name
    // ***********************************************************
    this.getDeploymentsByName = function (deploymentName, callback) {
        logger.debug('Going to get deployments with the name ' + deploymentName);
        var opts = {
            key: deploymentName
        }
        // Run the couch query
        this.couchDBConn.view('deployments/byName', opts, function (err, res) {
                // Check for an error first
                if (err) {
                    logger.error('Error trying to get deployments by name ' + deploymentName);
                    logger.error(err);
                } else {
                    logger.debug('Got deployments by name');
                    logger.debug(res);

                    // Create an array to process
                    var deploymentArray = [];

                    // Put the deployments in the array
                    for (var i = 0; i < res.length; i++) {
                        deploymentArray.push(res[i].value);
                    }

                    // Now pass it to the callback function
                    callback(err, deploymentArray);
                }
            }
        );
    }

    // ***********************************************************
    // This function gets a deployment by it's ID
    // ***********************************************************
    this.getDeploymentByID = function (id, returnFull, callback) {
        // Check to see if the caller wants the full version by having a parameter
        // called returnFull that is true.
        if (returnFull) {
            this.couchDBConn.get(id, function (err, doc) {
                if (err) {
                    callback(err);
                } else {
                    callback(null, doc);
                }
            })
        } else {
            // Specify options that will pull the deployment with just that ID from the collection
            // of shallow deployments
            var opts = {
                key: id
            }

            // Query for all Deployments in the shallow form
            this.couchDBConn.view('deployments/all', opts, function (err, res) {
                    // Check for an error first
                    if (err) {
                        logger.error('Error trying to get all deployments! ', err);
                    } else {
                        logger.debug('Got Deployments from CouchDB: ', res);

                        // Since we are looking for only one and we filtered by that ID, we should return
                        // the first one specified
                        if (res.length > 0) {
                            // Now pass it to the callback function
                            callback(err, res[0].value);
                        } else {
                            callback(null, null);
                        }
                    }
                }
            );
        }
    }

    // ***********************************************************
    // This method queries for the error object that is associated
    // with the deployment with the given ID
    // ***********************************************************
    this.getDeploymentErrors = function (id, callback) {
        logger.debug('Going to get error list for deployment with ID: ' + id);
        var opts = {
            key: id
        }
        // Run the couch query
        this.couchDBConn.view('deployments/errors', opts, function (err, res) {
                // Check for an error first
                if (err) {
                    logger.error('Error trying to get deployment errors ');
                    logger.error(err);
                } else {
                    // Now pass it to the callback function
                    callback(err, res[0].value);
                }
            }
        );
    }

    // ***********************************************************
    // This method queries for the protocolRuns object that is associated
    // with the deployment with the given ID
    // ***********************************************************
    this.getDeploymentProtocolRuns = function (id, callback) {
        logger.debug('Going to get protocolRun list for deployment with ID: ' + id);
        var opts = {
            key: id
        }
        // Run the couch query
        this.couchDBConn.view('deployments/protocolRuns', opts, function (err, res) {
                // Check for an error first
                if (err) {
                    logger.error('Error trying to get deployment protocolRuns ');
                    logger.error(err);
                } else {
                    // Now pass it to the callback function
                    callback(err, res[0].value);
                }
            }
        );
    }

    // ***********************************************************
    // This method queries for the samples object that is associated
    // with the deployment with the given ID
    // ***********************************************************
    this.getDeploymentSamples = function (id, callback) {
        logger.debug('Going to get samples list for deployment with ID: ' + id);
        var opts = {
            key: id
        }
        // Run the couch query
        this.couchDBConn.view('deployments/samples', opts, function (err, res) {
                // Check for an error first
                if (err) {
                    logger.error('Error trying to get deployment samples');
                    logger.error(err);
                } else {
                    // Now pass it to the callback function
                    callback(err, res[0].value);
                }
            }
        );
    }

    // ***********************************************************
    // This method queries for the images object that is associated
    // with the deployment with the given ID
    // ***********************************************************
    this.getDeploymentImages = function (id, callback) {
        logger.debug('Going to get images list for deployment with ID: ' + id);
        var opts = {
            key: id
        }
        // Run the couch query
        this.couchDBConn.view('deployments/images', opts, function (err, res) {
                // Check for an error first
                if (err) {
                    logger.error('Error trying to get deployment images');
                    logger.error(err);
                } else {
                    // Now pass it to the callback function
                    callback(err, res[0].value);
                }
            }
        );
    }

    // ***********************************************************
    // This method queries for an array of pcr types associated with
    // the deployment with the given ID
    // ***********************************************************
    this.getDeploymentPCRTypes = function (id, callback) {
        logger.debug('Going to get pcr types array for deployment with ID: ' + id);
        var opts = {
            key: id
        }
        // Run the couch query
        this.couchDBConn.view('deployments/pcrTypes', opts, function (err, res) {
                // Check for an error first
                if (err) {
                    logger.error('Error trying to get deployment pcrTypes');
                    logger.error(err);
                } else {
                    if (res && res[0] && res[0].value) {
                        // Now pass it to the callback function
                        callback(err, res[0].value.sort());
                    } else {
                        callback(err, []);
                    }
                }
            }
        );
    }

    // ***********************************************************
    // This method queries for a list of PCR Types and Runs for
    // the deployment with the given ID
    // ***********************************************************
    this.getDeploymentPCRsByTime = function (id, callback) {
        logger.debug('Going to get pcrs sorted by time for deployment with ID: ' + id);
        var opts = {
            key: id
        }
        // Run the couch query
        this.couchDBConn.view('deployments/pcrsByTime', opts, function (err, res) {
                // Check for an error first
                if (err) {
                    logger.error('Error trying to get deployment pcrs by time');
                    logger.error(err);
                } else {
                    if (res && res[0] && res[0].value) {
                        // Now pass it to the callback function
                        callback(err, res[0].value);
                    } else {
                        callback(err, []);
                    }
                }
            }
        );
    }

    // ***********************************************************
    // This method queries for an object that contains the full
    // tree of PCR types, run names, epoch seconds and column names
    // the deployment with the given ID
    // ***********************************************************
    this.getDeploymentPCRTypesFullTree = function (id, callback) {
        logger.debug('Going to get pcr types tree for deployment with ID: ' + id);
        var opts = {
            key: id
        }
        // Run the couch query
        this.couchDBConn.view('deployments/pcrTypesFullTree', opts, function (err, res) {
                // Check for an error first
                if (err) {
                    logger.error('Error trying to get deployment pcrTypesFullTree');
                    logger.error(err);
                } else {
                    if (res && res[0] && res[0].value) {
                        // Now pass it to the callback function
                        callback(err, res[0].value);
                    } else {
                        callback(err, []);
                    }
                }
            }
        );
    }

    // ***********************************************************
    // This method queries for an array of pcr run names
    // associated with the deployment with the given ID and the
    // given pcrType
    // ***********************************************************
    this.getDeploymentPCRRunNames = function (id, pcrType, callback) {
        logger.debug('Going to get pcr runNames array for deployment with ID: ' + id + ' and pcr type ' + pcrType);
        var opts = {
            key: [id, pcrType]
        }
        // Run the couch query
        this.couchDBConn.view('deployments/pcrRunNames', opts, function (err, res) {
                logger.debug("response", res);
                logger.debug("res[0]", res[0]);
                logger.debug("res[0].value", res[0].value);
                // Check for an error first
                if (err) {
                    logger.error('Error trying to get deployment prcRunNames');
                    logger.error(err);
                } else {
                    if (res && res[0] && res[0].value) {
                        // Now pass it to the callback function
                        callback(err, res[0].value);
                    } else {
                        callback(err, []);
                    }
                }
            }
        );
    }

    // ***********************************************************
    // This method queries for an array of pcr epoch seconds
    // associated with the deployment with the given ID, the
    // given pcrType, and the given pcrRunName
    // ***********************************************************
    this.getDeploymentPCREpochSeconds = function (id, pcrType, pcrRunName, callback) {
        logger.debug('Going to get pcr runNames array for deployment with ID: ' +
            id + ' and pcr type ' + pcrType + ' and run name ' + pcrRunName);
        var opts = {
            key: [id, pcrType, pcrRunName]
        }
        // Run the couch query
        this.couchDBConn.view('deployments/pcrEpochSeconds', opts, function (err, res) {
                // Check for an error first
                if (err) {
                    logger.error('Error trying to get deployment pcrEpochSeconds');
                    logger.error(err);
                } else {
                    if (res && res[0] && res[0].value) {
                        // Now pass it to the callback function
                        callback(err, res[0].value.sort());
                    } else {
                        callback(err, []);
                    }
                }
            }
        );
    }

    // ***********************************************************
    // This method queries for an array of pcr column names
    // associated with the deployment with the given ID, the
    // given pcrType, the given pcrRunName, and the given epochSeconds
    // ***********************************************************
    this.getDeploymentPCRColumnNames = function (id, pcrType, pcrRunName, epochSecs, callback) {
        logger.debug('Going to get pcr column name array for deployment with ID: ' +
            id + ' and pcr type ' + pcrType + ' and run name ' + pcrRunName + ' and epochSecs ' +
            epochSecs);
        var opts = {
            key: [id, pcrType, pcrRunName, epochSecs]
        }
        // Run the couch query
        this.couchDBConn.view('deployments/pcrColumnNames', opts, function (err, res) {
                // Check for an error first
                if (err) {
                    logger.error('Error trying to get deployment pcrColumnNames');
                    logger.error(err);
                } else {
                    if (res && res[0] && res[0].value) {
                        // Now pass it to the callback function
                        callback(err, res[0].value.sort());
                    } else {
                        callback(err, []);
                    }
                }
            }
        );
    }

    // ***********************************************************
    // This method queries for an array of pcr data records
    // associated with the deployment with the given ID, the
    // given pcrType, the given pcrRunName, the given epochSeconds
    // and the given column name
    // ***********************************************************
    this.getDeploymentPCRDataRecords = function (id, pcrType, pcrRunName, epochSecs, columnName, callback) {
        logger.debug('Going to get pcr data records array for deployment with ID: ' +
            id + ' and pcr type ' + pcrType + ' and run name ' + pcrRunName + ' and epochSecs ' +
            epochSecs + ' and column name ' + columnName);
        var opts = {
            key: [id, pcrType, pcrRunName, epochSecs, columnName]
        }
        // Run the couch query
        this.couchDBConn.view('deployments/pcrDataRecords', opts, function (err, res) {
                // Check for an error first
                if (err) {
                    logger.error('Error trying to get deployment pcrDataRecords');
                    logger.error(err);
                } else {
                    if (res && res[0] && res[0].value) {
                        // Now pass it to the callback function
                        callback(err, res[0].value);
                    } else {
                        callback(err, []);
                    }
                }
            }
        );
    }

    // ***********************************************************
    // This function's return depends on the parameters. If
    // nameOnly and deploymentName are both null, an array of
    // objects that have the properties of all ESPs will be returned.
    // If nameOnly is 'true' and deploymentName is null, an array
    // of strings that are the names of all the ESPs will be returned.
    // If nameOnly is null and deploymentName is specified, an
    // array of object that describe the ESPs that have all had
    // deployments with the supplied name will be returned.  If
    // nameOnly is 'true' and deploymentName is specified, an
    // array of strings will be returned that will be the names
    // of the ESPs that had been in deployments with the given name
    // ***********************************************************
    this.getAllESPs = function (nameOnly, deploymentName, callback) {
        // If both are specified
        if (nameOnly && nameOnly === 'true' && deploymentName) {
            logger.debug('Going to get ESP name list for deployment ' + deploymentName);
            var opts = {
                key: deploymentName
            }
            // Run the couch query
            this.couchDBConn.view('esps/inDeploymentNames', opts, function (err, res) {
                    // Check for an error first
                    if (err) {
                        logger.error('Error trying to get esp names from deployment');
                        logger.error(err);
                    } else {
                        logger.debug('Got ESP names');
                        logger.debug(res);

                        // Create an array to process
                        var espNameArray = [];

                        // Put the esp names in the array
                        for (var i = 0; i < res.length; i++) {
                            espNameArray.push(res[i].value);
                        }

                        // Now pass it to the callback function
                        callback(err, espNameArray);
                    }
                }
            );

        } else if (nameOnly && nameOnly === 'true') {
            logger.debug('getAllESPNames called');
            me.couchDBConn.view('esps/allNames', {group: true, reduce: true}, function (err, res) {
                // Check for an error first
                if (err) {
                    logger.error('Error trying to get all ESP names:', err);
                } else {
                    logger.debug('Got ESP names from CouchDB: ', res);
                    // The array to return
                    var espNameArray = [];

                    // Put the esp name in the array
                    for (var i = 0; i < res.length; i++) {
                        espNameArray.push(res[i].key);
                    }

                    // Now pass it to the callback function
                    callback(err, espNameArray);
                }
            });
        } else if (deploymentName) {
            logger.debug('Going to get ESP list for deployment ' + deploymentName);
            var opts = {
                key: deploymentName
            }
            // Run the couch query
            this.couchDBConn.view('esps/inDeployment', opts, function (err, res) {
                    // Check for an error first
                    if (err) {
                        logger.error('Error trying to get esp names from deployment');
                        logger.error(err);
                    } else {
                        logger.debug('Got ESP names');
                        logger.debug(res);

                        // Create an array to process
                        var espNameArray = [];

                        // Put the esp names in the array
                        for (var i = 0; i < res.length; i++) {
                            espNameArray.push(res[i].value);
                        }

                        // Now pass it to the callback function
                        callback(err, espNameArray);
                    }
                }
            );

        } else {
            // Query for all ESPs
            this.couchDBConn.view('esps/all', {group: true, reduce: true}, function (err, res) {
                    // Check for an error first
                    if (err) {
                        logger.error('Error trying to get all ESPs! ', err);
                    } else {
                        logger.debug('Got ESPs from CouchDB: ', res);

                        // Create an array to process
                        var espArray = [];

                        // Push the ESPs
                        for (var i = 0; i < res.length; i++) {
                            espArray.push(res[i].key);
                        }

                        // Now pass it to the callback function
                        callback(err, espArray);
                    }
                }
            );
        }
    }

    // ***********************************************************
    // This function returns an array of all the User objects in
    // the data store.
    // ***********************************************************
    this.getAllUsers = function (callback) {
        // Query for all Users
        this.couchDBConn.view('users/allUsers', function (err, res) {
                // Check for an error first
                if (err) {
                    logger.error('Error trying to get all Users! ', err);
                } else {
                    logger.debug('Got Users from CouchDB: ', res);

                    // Create an array to process
                    var userArray = [];

                    // Push the Users
                    for (var i = 0; i < res.length; i++) {
                        userArray.push(res[i].value);
                    }

                    // Now pass it to the callback function
                    callback(err, userArray);
                }
            }
        );
    }

    // ***********************************************************
    // This function returns a specific user given the ID
    // ***********************************************************
    this.getUserById = function (id, callback) {
        logger.debug('Get User by ID called with ID ' + id);
        // Create the options to specify the key to get
        var searchOptions = {
            key: id
        }
        // Query for all Users
        this.couchDBConn.view('users/allUsers', searchOptions, function (err, res) {
                // Check for an error first
                if (err) {
                    logger.error('Error trying to get a User by id ', err);
                } else {
                    logger.debug('Got User by ID: ', res);

                    // Create an array to process
                    var userArray = [];

                    // Push the Users
                    for (var i = 0; i < res.length; i++) {
                        userArray.push(res[i].value);
                    }

                    // Now pass it to the callback function
                    callback(err, userArray);
                }
            }
        );
    }

    // ***********************************************************
    // This method finds a user by login method and the associated
    // ID of the service
    // ***********************************************************
    this.getUserByLoginServiceAndIdentifier = function (loginType, loginID, callback) {
        logger.debug('getUserByLoginServiceAndIdentifier called with loginType ' + loginType +
            ' and identifier ' + loginID);
        // Create the search options first
        var searchOptions = {
            key: {
                loginType: loginType,
                loginID: loginID
            }
        }
        // Query for all Users
        this.couchDBConn.view('users/userByLoginTypeAndLoginID', searchOptions, function (err, res) {
                // Check for an error first
                if (err) {
                    logger.error('Error trying to get a User by loginType and loginID ', err);
                } else {
                    logger.debug('Got User by loginType and loginID ', res);

                    // If the response array is empty, return null
                    if (res.length === 0) {
                        // Now pass it to the callback function
                        callback(err, null);
                    } else {
                        // Now pass it to the callback function
                        callback(err, res[0]);
                    }
                }
            }
        );

    }

    // ***********************************************************
    // This method persists User documents to the CouchDB
    // ***********************************************************
    this.persistUser = function (user, callback) {
        // Call the method to save the user to the datastore
        this.couchDBConn.save(user, function (err, res) {
            // Check for errors
            if (err) {
                // Log the error
                logger.warn('Error trying to save a user: ');
                logger.warn(user);
                logger.warn(err);

                // Send error to the caller
                if (callback)
                    callback(err);
            } else {
                logger.debug('User ' + user.email + ' updated successfully');
                logger.debug(res);
                logger.debug(user);

                // Assign the ID and rev
                if (res.ok) {
                    // Assign the ID and revision
                    user._id = res.id;
                    user._rev = res.rev;

                    // Send the updated deployment back to the caller
                    if (callback)
                        callback(null, user);
                }
            }
        });
    }

    // ***********************************************************
    // This function persists a user by passing in specific
    // parameters instead of a complete user object (this is to
    // simplify things as there are some attributes that are
    // useful to the middleware that the client probably don't
    // care about
    // ***********************************************************
    this.persistUserWithParams = function (firstname, surname, email, loginType, loginID, callback) {
        logger.debug('persist user called with params: firstname= ' + firstname + ', surname= ' +
            surname + ', email= ' + email + ', loginType= ' + loginType + ', loginID= ' + loginID);
        // Construct the user object
        var newUser = {
            resource: 'User',
            firstname: firstname,
            surname: surname,
            email: email,
            loginType: loginType,
            loginID: loginID
        }
        // Now persist it
        this.persistUser(newUser, callback);
    }

    // ***********************************************************
    // This function will persist a given deployment
    // ***********************************************************
    this.persistDeployment = function (deployment, callback) {

        logger.info("PersistDeployment called on deployment " + deployment.name);
        logger.info("Deployment ID Before " + deployment._id);
        logger.info("Deployment Rev Before " + deployment._rev);
        // Call the method to save the deployment to the datastore
        this.couchDBConn.save(deployment, function (err, res) {
            // Check for errors
            if (err) {
                // Log the error
                logger.warn('Error trying to save deployment ' + deployment.name + '(id=' + deployment._id + ',rev=' + deployment._rev);
                logger.warn(err);

                // Send error to the caller
                if (callback)
                    callback(err);
            } else {
                // Assign the ID and rev
                if (res.ok) {
                    logger.info('Deployment ' + deployment.name + ' updated successfully');
                    // Assign the ID and revision
                    deployment._id = res.id;
                    deployment._rev = res.rev;
                    logger.info("Deployment ID After " + deployment._id);
                    logger.info("Deployment Rev After " + deployment._rev);

                    // Send the updated deployment back to the caller
                    if (callback)
                        callback(null, deployment);
                }
            }
        });
    }

    // ***********************************************************
    // The function to remove a deployment from the CouchDB database
    // ***********************************************************
    this.removeDeployment = function (deployment, callback) {
        if (deployment && deployment._id) {
            // call the method to save the deployment
            this.couchDBConn.remove(deployment._id, function (err, res) {
                if (err) {
                    // Log the error
                    logger.warn('Error trying to remove deployment: ');
                    logger.warn(deployment);
                    logger.warn(err);

                    // Send the error to the caller
                    if (callback)
                        callback(err);
                } else {
                    // Log the removal
                    logger.debug('Deployment ' + deployment.name + ' removed successfully');
                    logger.debug(deployment);

                    // Send the response to the callback
                    if (callback)
                        callback(res);
                }
            });
        }
    }

    // ***********************************************************
    // This function takes in the ID of a deployment, the epoch
    // milliseconds of the error that occurred, and the error
    // object that is to be added or updated. If there was an
    // error during the add or update, the callback method will
    // be called with the error.  Otherwise it will call the
    // callback passing null.
    // ***********************************************************
    this.addOrUpdateError = function (deploymentID, epochMillis, error, callback) {
        logger.debug("Going to add an error to deployment with ID " +
            deploymentID + " at epochMillis " + epochMillis);
        //logger.debug("Error:", error);

        // Make sure the parameters are specified
        if (deploymentID && epochMillis && error) {
            // Next we should try to convert the epochmillis to a number to make
            // sure it is actually a number
            var epochMillisInt = null;
            try {
                epochMillisInt = parseInt(epochMillis);
            } catch (error) {
                // If the conversion does not go, send it back to the caller
                if (error && callback)
                    callback(error);
            }

            // Check for the conversion
            if (epochMillisInt) {
                // Since we have all the parameters, grab the deployment by it's ID
                this.couchDBConn.get(deploymentID, function (err, doc) {
                    // If an error occurred, send it back
                    if (err) {
                        if (callback)
                            callback(err);
                    } else {
                        // Check for the document
                        if (doc) {
                            logger.debug("Error will be added to deployment " + doc.name);

                            // First make sure there is a errors object
                            if (!doc.errors) doc.errors = {};

                            // Now set the error at the specified timestamp
                            doc.errors[epochMillis] = error;

                            // Now save it
                            me.couchDBConn.save(doc, function (err, res) {
                                // If error, check for document conflict
                                if (err) {
                                    // Make sure the error is a conflict error before recursing
                                    if (err.error === 'conflict') {
                                        logger.warn("Conflict trapped trying to add error object, will try again", err);
                                        me.addOrUpdateError(deploymentID, epochMillis, error, callback);
                                    } else {
                                        // Since the error is not a conflict error, bail out
                                        if (callback)
                                            callback(err);
                                    }
                                } else {
                                    // Now return (err should be null)
                                    if (callback)
                                        callback(err);
                                }
                            });
                        } else {
                            if (callback)
                                callback(new Error('No deployment with ID ' +
                                    deploymentID + ' was found.'));
                        }
                    }
                });
            } else {
                if (callback)
                    callback(new Error("The epochMillis of " + epochMillis +
                        " could not be converted to a number"));
            }
        } else {
            if (callback)
                callback(new Error("Not enough parameters supplied (deploymentID, epochMillis, error, callback)"));
        }
    };

    // ***********************************************************
    // This function takes in the ID of a deployment, the epoch
    // milliseconds of the image capture that occurred, and the image
    // object that is to be added or updated. If there was an
    // error during the add or update, the callback method will
    // be called with the error.  Otherwise it will call the
    // callback passing null.
    // ***********************************************************
    this.addOrUpdateImage = function (deploymentID, epochMillis, image, callback) {
        logger.debug("Going to add an image to deployment with ID " +
            deploymentID + " at epochMillis " + epochMillis);
        //logger.debug("Image:", image);

        // Make sure the parameters are specified
        if (deploymentID && epochMillis && image) {
            // Next we should try to convert the epochmillis to a number to make
            // sure it is actually a number
            var epochMillisInt = null;
            try {
                epochMillisInt = parseInt(epochMillis);
            } catch (error) {
                // If the conversion does not go, send it back to the caller
                if (error && callback)
                    callback(error);
            }

            // Check for the conversion
            if (epochMillisInt) {
                // Since we have all the parameters, grab the deployment by it's ID
                this.couchDBConn.get(deploymentID, function (err, doc) {
                    // If an error occurred, send it back
                    if (err) {
                        if (callback)
                            callback(err);
                    } else {
                        // Check for the document
                        if (doc) {
                            logger.debug("Image will be added to deployment " + doc.name);

                            // First make sure there is a images object
                            if (!doc.images) doc.images = {};

                            // Now set the image at the specified timestamp
                            doc.images[epochMillis] = image;

                            // Now save it
                            me.couchDBConn.save(doc, function (err, res) {
                                // If error, check for document conflict
                                if (err) {
                                    // Make sure the error is a conflict error before recursing
                                    if (err.error === 'conflict') {
                                        logger.warn("Conflict trapped trying to add image object, will try again", err);
                                        me.addOrUpdateImage(deploymentID, epochMillis, image, callback);
                                    } else {
                                        // Since the error is not a conflict error, bail out
                                        if (callback)
                                            callback(err);
                                    }
                                } else {
                                    // Now return (err should be null)
                                    if (callback)
                                        callback(err);
                                }
                            });
                        } else {
                            if (callback)
                                callback(new Error('No deployment with ID ' +
                                    deploymentID + ' was found.'));
                        }
                    }
                });
            } else {
                if (callback)
                    callback(new Error("The epochMillis of " + epochMillis +
                        " could not be converted to a number"));
            }
        } else {
            if (callback)
                callback(new Error("Not enough parameters supplied (deploymentID, epochMillis, image, callback)"));
        }
    };

    // ***********************************************************
    // This function takes in the ID of a deployment, the epoch
    // milliseconds of the protocol run that occurred, and the
    // protocol run object that is to be added or updated. If
    // there was an error during the add or update, the callback
    // method will be called with the error.  Otherwise it will
    // call the callback passing null.
    // ***********************************************************
    this.addOrUpdateProtocolRun = function (deploymentID, epochMillis, protocolRun, callback) {
        logger.debug("Going to add a protocol run to deployment with ID " +
            deploymentID + " at epochMillis " + epochMillis);
        //logger.debug("ProtocolRun:", protocolRun);

        // Make sure the parameters are specified
        if (deploymentID && epochMillis && protocolRun) {
            // Next we should try to convert the epochmillis to a number to make
            // sure it is actually a number
            var epochMillisInt = null;
            try {
                epochMillisInt = parseInt(epochMillis);
            } catch (error) {
                // If the conversion does not go, send it back to the caller
                if (error && callback)
                    callback(error);
            }

            // Check for the conversion
            if (epochMillisInt) {
                // Since we have all the parameters, grab the deployment by it's ID
                this.couchDBConn.get(deploymentID, function (err, doc) {
                    // If an error occurred, send it back
                    if (err) {
                        if (callback)
                            callback(err);
                    } else {
                        // Check for the document
                        if (doc) {
                            logger.debug("ProtocolRun will be added to deployment " + doc.name);

                            // First make sure there is a protocolRuns object
                            if (!doc.protocolRuns) doc.protocolRuns = {};

                            // Now set the protocolRun at the specified timestamp
                            doc.protocolRuns[epochMillis] = protocolRun;

                            // Now save it
                            me.couchDBConn.save(doc, function (err, res) {
                                // If error, check for document conflict
                                if (err) {
                                    // Make sure the error is a conflict error before recursing
                                    if (err.error === 'conflict') {
                                        logger.warn("Conflict trapped trying to add protocol run object, " +
                                            "will try again", err);
                                        me.addOrUpdateProtocolRun(deploymentID, epochMillis, protocolRun, callback);
                                    } else {
                                        // Since the error is not a conflict error, bail out
                                        if (callback)
                                            callback(err);
                                    }
                                } else {
                                    // Now return (err should be null)
                                    if (callback)
                                        callback(err);
                                }
                            });
                        } else {
                            if (callback)
                                callback(new Error('No deployment with ID ' +
                                    deploymentID + ' was found.'));
                        }
                    }
                });
            } else {
                if (callback)
                    callback(new Error("The epochMillis of " + epochMillis +
                        " could not be converted to a number"));
            }
        } else {
            if (callback)
                callback(new Error("Not enough parameters supplied (deploymentID, epochMillis, protocolRun, callback)"));
        }
    };

    /**
     * This method takes in the ID of deployment and returns the most recent sample from that deployment
     * @param deploymentID
     * @param callback
     */
    this.getLatestSample = function (deploymentID, callback) {
        logger.debug("Going to retrieve the latest sample for deployment with ID " + deploymentID);

        // Make sure the deployment ID was specified
        if (deploymentID) {
            // Since we have it, grab the deployment by it's ID
            this.couchDBConn.get(deploymentID, function (err, doc) {
                // If an error occurred, send it back
                if (err) {
                    if (callback)
                        callback(err);
                } else {
                    // Check for the document
                    if (doc) {
                        logger.debug("Found deployment " + doc.name);

                        // First make sure there is a samples object (to prevent exception)
                        if (!doc.samples) doc.samples = {};

                        // Grab the last sample:
                        var latestSample = null;
                        var latestSampleTS = null;
                        Object.keys(doc.samples).forEach(function (samplets) {
                            if (!latestSampleTS || (latestSampleTS < samplets)) {
                                latestSampleTS = samplets;
                                latestSample = doc.samples[samplets];
                            }
                        });
                        logger.debug("Latest sample is ", latestSample);

                        // Now if there is callback, return the latest sample
                        if (callback)
                            callback(null, latestSample, latestSampleTS);
                    } else {
                        if (callback)
                            callback(new Error('No deployment with ID ' +
                                deploymentID + ' was found.'));
                    }
                }
            });
        } else {
            if (callback)
                callback(new Error("Not enough parameters supplied " +
                    "(deploymentID, callback)"));
        }
    }

    // ***********************************************************
    // This function takes in the ID of a deployment, the epoch
    // milliseconds of the sample that started, and the
    // sample object that is to be added or updated. If
    // there was an error during the add or update, the callback
    // method will be called with the error.  Otherwise it will
    // call the callback passing null.
    // ***********************************************************
    this.addOrUpdateSample = function (deploymentID, epochMillis, sample, callback) {
        logger.debug("Going to add a sample to deployment with ID " +
            deploymentID + " at epochMillis " + epochMillis);
        //logger.debug("Sample:", sample);

        // Make sure the parameters are specified
        if (deploymentID && epochMillis && sample) {
            // Next we should try to convert the epochmillis to a number to make
            // sure it is actually a number
            var epochMillisInt = null;
            try {
                epochMillisInt = parseInt(epochMillis);
            } catch (error) {
                // If the conversion does not go, send it back to the caller
                if (error && callback)
                    callback(error);
            }

            // Check for the conversion
            if (epochMillisInt) {
                // Since we have all the parameters, grab the deployment by it's ID
                this.couchDBConn.get(deploymentID, function (err, doc) {
                    // If an error occurred, send it back
                    if (err) {
                        if (callback)
                            callback(err);
                    } else {
                        // Check for the document
                        if (doc) {
                            logger.debug("Sample will be added to deployment " + doc.name);

                            // First make sure there is a samples object
                            if (!doc.samples) doc.samples = {};

                            // Now set the sample at the specified timestamp
                            doc.samples[epochMillis] = sample;

                            // Now save it
                            me.couchDBConn.save(doc, function (err, res) {
                                // If error, check for document conflict
                                if (err) {
                                    // Make sure the error is a conflict error before recursing
                                    if (err.error === 'conflict') {
                                        logger.warn("Conflict trapped trying to add sample object, " +
                                            "will try again", err);
                                        me.addOrUpdateSample(deploymentID, epochMillis, sample, callback);
                                    } else {
                                        // Since the error is not a conflict error, bail out
                                        if (callback)
                                            callback(err);
                                    }
                                } else {
                                    // Now return (err should be null)
                                    if (callback)
                                        callback(err);
                                }
                            });
                        } else {
                            if (callback)
                                callback(new Error('No deployment with ID ' +
                                    deploymentID + ' was found.'));
                        }
                    }
                });
            } else {
                if (callback)
                    callback(new Error("The epochMillis of " + epochMillis +
                        " could not be converted to a number"));
            }
        } else {
            if (callback)
                callback(new Error("Not enough parameters supplied (deploymentID, epochMillis, sample, callback)"));
        }
    };

    /**
     *
     * @param deploymentID
     * @param endEpochMillis
     * @param actualVolume
     * @param callback
     */
    this.setSampleEnd = function (deploymentID, endEpochMillis, actualVolume, callback) {
        logger.debug("Going to set the end of a sample to epochMillis " + endEpochMillis +
            " and actual volume of " + actualVolume);

        // Make sure the parameters are specified
        if (deploymentID && endEpochMillis) {
            // Next we should try to convert the endEpochMillis to a number to make
            // sure it is actually a number
            var endEpochMillisInt = null;
            try {
                endEpochMillisInt = parseInt(endEpochMillis);
            } catch (error) {
                // If the conversion does not go, send it back to the caller
                if (error && callback)
                    callback(error);
            }

            // Check for the conversion
            if (endEpochMillisInt) {
                // Since we have all the parameters, grab the deployment by it's ID
                this.couchDBConn.get(deploymentID, function (err, doc) {
                    // If an error occurred, send it back
                    if (err) {
                        if (callback)
                            callback(err);
                    } else {
                        // Check for the document
                        if (doc) {
                            logger.debug("We will set the end of a sample for deployment " + doc.name);

                            // First make sure there is a samples object (to prevent exception)
                            if (!doc.samples) doc.samples = {};

                            // Grab the last sample:
                            var latestSample = null;
                            var latestSampleTS = null;
                            Object.keys(doc.samples).forEach(function (samplets) {
                                if (!latestSampleTS || (latestSampleTS < samplets && samplets < endEpochMillisInt)) {
                                    latestSampleTS = samplets;
                                    latestSample = doc.samples[samplets];
                                }
                            });
                            // If a sample was found and there is no end timestamp, add it
                            if (latestSample && !latestSample.endts) {
                                latestSample.endts = endEpochMillisInt;
                            }

                            // Now if a volume was specified
                            if (latestSample && actualVolume && !latestSample.actualVolume) {
                                latestSample.actualVolume = actualVolume;
                            }

                            // Now save it
                            me.couchDBConn.save(doc, function (err, res) {
                                // If error, check for document conflict
                                if (err) {
                                    // Make sure the error is a conflict error before recursing
                                    if (err.error === 'conflict') {
                                        logger.warn("Conflict trapped trying to set sample end, " +
                                            "will try again", err);
                                        me.setSampleEnd(deploymentID, endEpochMillis, actualVolume, callback);
                                    } else {
                                        // Since the error is not a conflict error, bail out
                                        if (callback)
                                            callback(err);
                                    }
                                } else {
                                    // Now return (err should be null)
                                    if (callback)
                                        callback(err);
                                }
                            });
                        } else {
                            if (callback)
                                callback(new Error('No deployment with ID ' +
                                    deploymentID + ' was found.'));
                        }
                    }
                });
            } else {
                if (callback)
                    callback(new Error("The endEpochMillis of " + endEpochMillis +
                        " could not be converted to a number"));
            }
        } else {
            if (callback)
                callback(new Error("Not enough parameters supplied " +
                    "(deploymentID, endEpochMillis, actualVolume, callback)"));
        }
    };

    /**
     *
     * @param pcrType
     * @param pcrRunName
     * @param pcrStartDate
     * @param pcrColumnHeader
     * @param dataRecord
     * @param callback
     */
    this.addPCRData = function (deploymentID, pcrData, callback) {
        // Make sure all the parameters are valid
        if (deploymentID && pcrData) {
            // OK, so we have the information we need, let's grab the deployment specified
            this.couchDBConn.get(deploymentID, function (err, doc) {
                // If an error occurred, send it back
                if (err) {
                    logger.error("Error looking for deployment with ID " + deploymentID);
                    if (callback)
                        callback(err);
                } else {
                    // Make sure we got something back
                    if (doc) {
                        // OK, we now have the deployment and the PCR data to be added.  It will be an object
                        // that has pcr types as keys, so we need to loop over the pcrTypes first
                        for (var pcrType in pcrData) {
                            // Now next item will be the PCR run name
                            for (var pcrRunName in pcrData[pcrType]) {
                                // Now the item will be the timestamp of the file that was processed
                                for (var timestamp in pcrData[pcrType][pcrRunName]) {
                                    // Add (or replace the entry on the deployment with this information
                                    if (!doc.pcrs)
                                        doc.pcrs = {};
                                    if (!doc.pcrs[pcrType])
                                        doc.pcrs[pcrType] = {};
                                    if (!doc.pcrs[pcrType][pcrRunName])
                                        doc.pcrs[pcrType][pcrRunName] = {};
                                    if (!doc.pcrs[pcrType][pcrRunName][timestamp])
                                        doc.pcrs[pcrType][pcrRunName][timestamp] = pcrData[pcrType][pcrRunName][timestamp];
                                }
                            }
                        }
                        // Now we need to add the pcr data
                        // Now save it
                        me.couchDBConn.save(doc, function (err, res) {
                            // If error, check for document conflict
                            if (err) {
                                // Make sure the error is a conflict error before recursing
                                if (err.error === 'conflict') {
                                    logger.warn("Conflict trapped trying to add PCR data, " +
                                        "will try again", err);
                                    me.addPCRData(deploymentID, pcrData, callback);
                                } else {
                                    // Since the error is not a conflict error, bail out
                                    if (callback)
                                        callback(err);
                                }
                            } else {
                                // Now return (err should be null)
                                if (callback)
                                    callback(err);
                            }
                        });
                        if (callback) callback(null);
                    } else {
                        if (callback)
                            callback(new Error("Did not get a deployment back from search by ID of " + deploymentID));
                    }
                }
            });

        } else {
            logger.error("Not enough parameters in call");
            if (callback)
                callback(new Error("Not enough parameters were specified, should be " +
                    "(deploymentID, pcrData, callback"));
        }
    };

    /**
     * This function takes in the 'ancillaryData' object and replaces what is currently on the referenced
     * deployment with that object.
     * @param deploymentID
     * @param ancillaryData
     * @param callback
     */
    this.setAncillaryData = function (deploymentID, ancillaryData, callback) {
        logger.debug("Going to set the ancillary data for deployment with ID " + deploymentID +
            " to object:", ancillaryData);

        // Make sure the parameters are specified
        if (deploymentID && ancillaryData) {
            // Since we have all the parameters, grab the deployment by it's ID
            this.couchDBConn.get(deploymentID, function (err, doc) {
                // If an error occurred, send it back
                if (err) {
                    if (callback)
                        callback(err);
                } else {
                    // Check for the document
                    if (doc) {
                        logger.debug("We will set the ancillaryData on the deployment " + doc.name);

                        // Set the ancillary data object
                        doc['ancillaryData'] = ancillaryData;

                        // Now save it
                        me.couchDBConn.save(doc, function (err, res) {
                            // If error, check for document conflict
                            if (err) {
                                // Make sure the error is a conflict error before recursing
                                if (err.error === 'conflict') {
                                    logger.warn("Conflict trapped trying to set ancillary data, " +
                                        "will try again", err);
                                    me.setAncillaryData(deploymentID, ancillaryData, callback);
                                } else {
                                    // Since the error is not a conflict error, bail out
                                    if (callback)
                                        callback(err);
                                }
                            } else {
                                // Now return (err should be null)
                                if (callback)
                                    callback(err);
                            }
                        });
                    } else {
                        if (callback)
                            callback(new Error('No deployment with ID ' +
                                deploymentID + ' was found.'));
                    }
                }
            });
        } else {
            if (callback)
                callback(new Error("Not enough parameters supplied " +
                    "(deploymentID, ancillaryData, callback)"));
        }
    };


    // ***********************************************************
    // This function takes in a deployment ID and a number which
    // is the number of the last line parsed from the log file.  It
    // then updates the deployment with that number
    // ***********************************************************
    this.setLastLineParsedInLogFile = function (deploymentID, lastLineParsedFromLogFile, callback) {
        logger.debug("Going to set the last line parsed from the log " +
            "file of deployment with ID " + deploymentID + " to line " + lastLineParsedFromLogFile);

        // Make sure the parameters are specified
        if (deploymentID && lastLineParsedFromLogFile) {
            // Next we should try to convert the lastLineParsedFromLogFile to a number
            var lastLineParsedFromLogFileInt = null;
            try {
                lastLineParsedFromLogFileInt = parseInt(lastLineParsedFromLogFile);
            } catch (error) {
                // If the conversion does not go, send it back to the caller
                if (error && callback)
                    callback(error);
            }

            // Check for the conversion
            if (lastLineParsedFromLogFileInt) {
                // Since we have all the parameters, grab the deployment by it's ID
                this.couchDBConn.get(deploymentID, function (err, doc) {
                    // If an error occurred, send it back
                    if (err) {
                        if (callback)
                            callback(err);
                    } else {
                        // Check for the document
                        if (doc) {
                            logger.debug("Deployment " + doc.name + " found");

                            // Set the line number
                            doc.lastLineParsedFromLogFile = lastLineParsedFromLogFileInt;

                            // Now save it
                            me.couchDBConn.save(doc, function (err, res) {
                                // If error, check for document conflict
                                if (err) {
                                    // Make sure the error is a conflict error before recursing
                                    if (err.error === 'conflict') {
                                        logger.warn("Conflict trapped trying to set lastLineParsedFromLogFile, " +
                                            "will try again", err);
                                        me.setLastLineParsedInLogFile(deploymentID, lastLineParsedFromLogFile, callback);
                                    } else {
                                        // Since the error is not a conflict error, bail out
                                        if (callback)
                                            callback(err);
                                    }
                                } else {
                                    // Now return (err should be null)
                                    if (callback)
                                        callback(err);
                                }
                            });
                        } else {
                            if (callback)
                                callback(new Error('No deployment with ID ' +
                                    deploymentID + ' was found.'));
                        }
                    }
                });
            } else {
                if (callback)
                    callback(new Error("The lastLineParsedInLogFile of " + lastLineParsedFromLogFile +
                        " could not be converted to a number"));
            }
        } else {
            if (callback)
                callback(new Error("Not enough parameters supplied (deploymentID, " +
                    "lastLineParsedInLogFile, callback)"));
        }
    };

    // ***********************************************************
    // This function takes in the ancillary source ID and a start and end time and returns the
    // data in whichever format is specified (JSON is default and only one right now)
    // ***********************************************************
    this.getAncillaryData = function (ancillarySourceID, startTimestampUtc, endTimestampUtc, format, callback) {
        logger.debug('getAncillaryData called for sourceID ' + ancillarySourceID);

        // Grab a reference to self for callbacks
        var self = this;

        // If there are dates specified, try and parse them
        var startDate = null;
        var endDate = null;
        if (startTimestampUtc) {
            try {
                startDate = moment(startTimestampUtc);
            } catch (error) {

            }
        }
        if (endTimestampUtc) {
            try {
                endDate = moment(endTimestampUtc);
            } catch (error) {

            }
        }

        // Build the query string
        var queryString = 'SELECT * FROM ancillary_data WHERE ancillary_source_id_fk = ' + ancillarySourceID;

        // If both dates are specified, use both
        if (startDate && endDate) {
            queryString += ' AND timestamp_utc >= \'' + startTimestampUtc + '\' AND timestamp_utc <= \'' + endTimestampUtc + '\'';
        } else if (startDate) {
            queryString += ' AND timestamp_utc >= \'' + startTimestampUtc + '\'';
        } else if (endDate) {
            queryString += ' AND timestamp_utc <= \'' + endTimestampUtc + '\'';
        }
        // Add the sorting
        queryString += ' order by timestamp_utc';
        logger.debug("Query string is " + queryString);

        // Now connect and query
        pg.connect(self.pgConnectionString, function (err, client, done) {
            // Check for an error on connection first
            if (err) {
                logger.error('Error caught trying to connect to DB');
                logger.error(err);
                if (callback)
                    callback(err);
            } else {
                // OK connected OK, create an array that will be used to return the data
                var response = [];

                // Run the query and process results
                client.query(queryString, function (err, result) {

                    // Check for error first
                    if (err) {
                        logger.error('Error running query');
                        logger.error(err);
                        if (callback)
                            callback(err);
                    } else {
                        logger.debug('Query came back with ' + result.rows.length + ' points');
                        // Process rows
                        if (result && result.rows && result.rows.length > 0) {
                            for (var i = 0; i < result.rows.length; i++) {
                                response.push([Date.parse(result.rows[i].timestamp_utc), parseFloat(result.rows[i].value)]);
                            }
                        }

                        // Call done and the callback to return the response
                        done();
                        if (callback)
                            callback(null, response);
                    }
                });
            }
        });
    }

    /**
     * This method takes in a deployment ID and an ancillaryData record ([sourceName,
     * varName, varLongName, varUnits, logUnits, timestamp, data]) and attempts to
     * lookup (either from a local cache or the database) a sourceID (database ID)
     * that matches the incoming information.  If nothing is found in either, a new
     * record is inserted in the database and the ID is returned.
     * @param deploymentID
     * @param ancillaryData
     * @param callback
     */
    this.getAncillaryDataSourceID = function (deploymentID, espName, sourceName, varName, varLongName, varUnits, logUnits, timestamp, data, callback) {
        // Grab a reference to self
        var self = this;

        // First thing to do is make sure we have a deployment ID and a ancillary data record
        if (deploymentID && espName) {
            // Let's pull the individual pieces out of the ancillaryDataRecord
            if (!sourceName || !varName || !varLongName || !varUnits || !logUnits) {
                if (callback)
                    callback(new Error("Data record did not have all the " +
                        "required fields", ancillaryDataRecord));
            } else {
                logger.trace("Will look for a source ID for:\ndeploymentID = " + deploymentID + "\nespName = " +
                    espName + "\nsourceName = " + sourceName + "\nlogUnits = " + logUnits);

                // The first thing to do is try to look up the sourceID in the local cache
                me.getAncillaryDataSourceIDFromCache(deploymentID, espName, sourceName, logUnits,
                    function (err, sourceID) {
                        // If there is an error send it back
                        if (err) {
                            if (callback)
                                callback(err);
                        } else {
                            // OK, was there a sourceID in the cache
                            if (sourceID) {
                                logger.trace("Found ID " + sourceID + " in the local cache");
                                // Send it to the callback
                                if (callback)
                                    callback(null, sourceID, deploymentID, espName, sourceName, varName, varLongName,
                                        varUnits, logUnits, timestamp, data);
                            } else {
                                // I need to first see if another request has already been queued for this same
                                // information
                                var requestExists = false;
                                if (me.ancillaryDataSourceIDLookupCallbackQueue[deploymentID] &&
                                    me.ancillaryDataSourceIDLookupCallbackQueue[deploymentID][espName] &&
                                    me.ancillaryDataSourceIDLookupCallbackQueue[deploymentID][espName][sourceName] &&
                                    me.ancillaryDataSourceIDLookupCallbackQueue[deploymentID][espName][sourceName][logUnits] &&
                                    me.ancillaryDataSourceIDLookupCallbackQueue[deploymentID][espName][sourceName][logUnits].length > 0) {
                                    requestExists = true;
                                }

                                // OK, we checked and have our answer, the next thing to do is our this present callback
                                // to the queue for processing (while making sure the object tree exists)
                                if (!me.ancillaryDataSourceIDLookupCallbackQueue[deploymentID])
                                    me.ancillaryDataSourceIDLookupCallbackQueue[deploymentID] = {};
                                if (!me.ancillaryDataSourceIDLookupCallbackQueue[deploymentID][espName])
                                    me.ancillaryDataSourceIDLookupCallbackQueue[deploymentID][espName] = {};
                                if (!me.ancillaryDataSourceIDLookupCallbackQueue[deploymentID][espName][sourceName])
                                    me.ancillaryDataSourceIDLookupCallbackQueue[deploymentID][espName][sourceName] = {};
                                if (!me.ancillaryDataSourceIDLookupCallbackQueue[deploymentID][espName][sourceName][logUnits])
                                    me.ancillaryDataSourceIDLookupCallbackQueue[deploymentID][espName][sourceName][logUnits] = [];
                                me.ancillaryDataSourceIDLookupCallbackQueue[deploymentID][espName][sourceName][logUnits].push(callback);

                                // Nothing was found in the cache and there is no pending callback, we will need to
                                // search the database to see if one was already created but is not in the cache.
                                if (!requestExists) {
                                    pg.connect(me.pgConnectionString, function (err, client, done) {
                                            // Make sure the connection was made to the database
                                            if (err) {
                                                // Log the error
                                                logger.error('Error connecting to Postgres in getAncillarySourceID');
                                                logger.error(err);

                                                // Send to callback
                                                if (callback)
                                                    callback(err);
                                            } else {
                                                // Connection successful, try to query for ID
                                                client.query('SELECT id from ancillary_sources where ' +
                                                    'deployment_id_fk = $1 ' +
                                                    'and esp_name = $2 and instrument_type = $3 ' +
                                                    'and log_units = $4',
                                                    [deploymentID, espName, sourceName, logUnits],
                                                    function (err, result) {
                                                        // Check for any errors first
                                                        if (err) {
                                                            // Log the error
                                                            logger.error('DB error searching for ancillary source ID');
                                                            logger.error(err);

                                                            // Send the error to the caller
                                                            if (callback)
                                                                callback(err);
                                                        } else {
                                                            // The query for the ancillary source executed OK, we now need
                                                            // to check to see if the ancillary source query returned anything
                                                            if (result && result.rows && result.rows.length > 0) {

                                                                // It appears a sourceID already exists stuff it in the
                                                                // local cache
                                                                me.putAncillaryDataSourceIDInCache(deploymentID, espName,
                                                                    sourceName, logUnits, result.rows[0].id,
                                                                    function (err) {
                                                                        logger.error("Error while pushing source ID " +
                                                                            result.rows[0].id + " into the cache");
                                                                    });

                                                                // Close the database connection
                                                                done();

                                                                // Loop over the callback cache and return the results
                                                                for (var i = 0;
                                                                     i < me.ancillaryDataSourceIDLookupCallbackQueue[deploymentID][espName][sourceName][logUnits].length; i++) {
                                                                    // Return the ID to the caller
                                                                    if (me.ancillaryDataSourceIDLookupCallbackQueue[deploymentID][espName][sourceName][logUnits][i])
                                                                        me.ancillaryDataSourceIDLookupCallbackQueue[deploymentID][espName][sourceName][logUnits][i]
                                                                            (null, result.rows[0].id, deploymentID, espName,
                                                                                sourceName, varName, varLongName, varUnits,
                                                                                logUnits, timestamp, data);
                                                                }

                                                                // Now clear the cached callbacks
                                                                me.ancillaryDataSourceIDLookupCallbackQueue[deploymentID][espName][sourceName][logUnits] = [];
                                                            } else {
                                                                // Nothing is in the database yet, we need to insert one
                                                                client.query('INSERT INTO ancillary_sources(' +
                                                                    'deployment_id_fk, esp_name, instrument_type, ' +
                                                                    'var_name, var_long_name, log_units, units) values ' +
                                                                    '($1,$2,$3,$4,$5,$6,$7) RETURNING id',
                                                                    [deploymentID, espName, sourceName, varName,
                                                                        varLongName, logUnits, varUnits],
                                                                    function (err, result) {
                                                                        // Check for errors
                                                                        if (err) {
                                                                            // Log the error
                                                                            logger.warn('Error trying to insert a new ancillary data source for');
                                                                            logger.warn(err);

                                                                            // Send it back to the caller
                                                                            if (callback)
                                                                                callback(err);
                                                                        } else {
                                                                            // It appears a sourceID already exists stuff it in the
                                                                            // local cache
                                                                            me.putAncillaryDataSourceIDInCache(deploymentID, espName,
                                                                                sourceName, logUnits, result.rows[0].id,
                                                                                function (err) {
                                                                                    logger.error("Error while pushing source ID " +
                                                                                        result.rows[0].id + " into the cache");
                                                                                });

                                                                            // Close the database connection
                                                                            done();

                                                                            // Loop over the callback cache and return the results
                                                                            for (var i = 0;
                                                                                 i < me.ancillaryDataSourceIDLookupCallbackQueue[deploymentID][espName][sourceName][logUnits].length; i++) {
                                                                                // Return the ID to the caller
                                                                                if (me.ancillaryDataSourceIDLookupCallbackQueue[deploymentID][espName][sourceName][logUnits][i])
                                                                                    me.ancillaryDataSourceIDLookupCallbackQueue[deploymentID][espName][sourceName][logUnits][i]
                                                                                        (null, result.rows[0].id, deploymentID, espName,
                                                                                            sourceName, varName, varLongName, varUnits,
                                                                                            logUnits, timestamp, data);
                                                                            }

                                                                            // Now clear the cached callbacks
                                                                            me.ancillaryDataSourceIDLookupCallbackQueue[deploymentID][espName][sourceName][logUnits] = [];
                                                                        }
                                                                    }
                                                                );
                                                            }
                                                        }
                                                    } // End callback function to handle results of search for existing source ID
                                                ); // End of query to search for existing ID
                                            }
                                        }
                                    )
                                    ;
                                }
                            }
                        }
                    }
                )
                ;
            }
        }
        else {
            if (callback)
                callback(new Error('Not enough parameters, should be ' +
                    '(deploymentID, espName, ancillaryDataRecord, callback'));
        }
    }

    /**
     * This method takes in the parameters and searches the local cache for a sourceID that matches.  If none is found
     * it returns null to the caller
     * @param deploymentID
     * @param espName
     * @param sourceName
     * @param logUnits
     * @param callback
     */
    this.getAncillaryDataSourceIDFromCache = function (deploymentID, espName, sourceName, logUnits, callback) {
        // This is the ID to return
        var sourceIDToReturn = null;

        // Start drilling through the cache starting with deploymentID
        if (this.ancillaryDataSourceIDLookup[deploymentID]) {
            // Now by esp name
            if (this.ancillaryDataSourceIDLookup[deploymentID][espName]) {
                // Now source name
                if (this.ancillaryDataSourceIDLookup[deploymentID][espName][sourceName]) {
                    // Now by the units from the log file
                    if (this.ancillaryDataSourceIDLookup[deploymentID][espName][sourceName][logUnits]) {
                        sourceIDToReturn = this.ancillaryDataSourceIDLookup[deploymentID][espName][sourceName][logUnits];
                    }
                }
            }
        }

        // Send it to the callback
        if (callback)
            callback(null, sourceIDToReturn);
    }

    /**
     * This method simply makes sure the local cache has the source ID being passed in.
     * @param deploymentID
     * @param espName
     * @param sourceName
     * @param logUnits
     * @param sourceID
     * @param callback
     */
    this.putAncillaryDataSourceIDInCache = function (deploymentID, espName, sourceName, logUnits, sourceID, callback) {
        // Make sure we have all the parameters
        if (deploymentID && espName && sourceName && logUnits && sourceID) {
            // Initialize the cache object if it needs it
            if (!me.ancillaryDataSourceIDLookup[deploymentID])
                me.ancillaryDataSourceIDLookup[deploymentID] = {};
            if (!me.ancillaryDataSourceIDLookup[deploymentID][espName])
                me.ancillaryDataSourceIDLookup[deploymentID][espName] = {};
            if (!me.ancillaryDataSourceIDLookup[deploymentID][espName][sourceName])
                me.ancillaryDataSourceIDLookup[deploymentID][espName][sourceName] = {};
            if (!me.ancillaryDataSourceIDLookup[deploymentID][espName][sourceName][logUnits])
                me.ancillaryDataSourceIDLookup[deploymentID][espName][sourceName][logUnits] = sourceID;
        } else {
            if (callback)
                callback(new Error('Not enough parameters (deploymentID, espName, sourceName, ' +
                    'logUnits, sourceID, callback)'));
        }
    }

    /**
     *
     * @param deploymentID
     * @param espName
     * @param ancillaryDataRecord
     * @param callback
     */
    this.addAncillaryDataRecord = function (deploymentID, espName, ancillaryDataRecord, callback) {
        // First thing we do is check for parameters
        if (deploymentID && espName && ancillaryDataRecord) {
            // OK we have the parameters, check to see if the deploymentID has an array in the local array
            if (!me.ancillaryDataRecordsToBeInserted[deploymentID]) {
                // Create a new array
                me.ancillaryDataRecordsToBeInserted[deploymentID] = [];
                logger.debug("Create new ancillary array for deployment with ID " + deploymentID);
            }

            // Now push the record on the array
            me.ancillaryDataRecordsToBeInserted[deploymentID].push(ancillaryDataRecord);

            // Now check the length of the array and if long enough, slice off the data an process
            if (me.ancillaryDataRecordsToBeInserted[deploymentID].length >= this.numAncillaryPointsToBatch) {
                var recordsToProcess = [];
                for (var i = 0; i < this.numAncillaryPointsToBatch; i++) {
                    recordsToProcess.push(me.ancillaryDataRecordsToBeInserted[deploymentID].shift());
                }
                logger.debug("Will process " + recordsToProcess.length + " records off the stack leaving "
                    + me.ancillaryDataRecordsToBeInserted[deploymentID].length + " still to process");
                me.batchInsertAncillaryData(deploymentID, espName, recordsToProcess, function (err, numRecords) {

                });
            }

            // Send the callback
            if (callback)
                callback(null);
        } else {
            // We have an issue and should return an error
            if (callback)
                callback(new Error("Not enough parameters, should be (deploymentID, espName, " +
                    "ancillaryDataRecord, callback"));
        }
    }

    /**
     *
     * @param deploymentID
     */
    this.flushAncillaryDataRecords = function (deploymentID, espName, baseDir, callback) {
        // Check for parameters
        if (deploymentID) {
            // Make sure there are some records to process left
            if (this.ancillaryDataRecordsToBeInserted[deploymentID] &&
                this.ancillaryDataRecordsToBeInserted[deploymentID].length > 0) {
                // Grab the number of records that need to be processed
                var numberOfRecordsLeft = this.ancillaryDataRecordsToBeInserted[deploymentID].length;

                // Slice the rest of the records
                logger.debug("There are still " + numberOfRecordsLeft +
                    " records to process for deployment with ID " + deploymentID);
                var recordsToProcess = [];
                while (me.ancillaryDataRecordsToBeInserted[deploymentID].length > 0) {
                    recordsToProcess.push(me.ancillaryDataRecordsToBeInserted[deploymentID].shift());
                }
                logger.debug("Will process " + recordsToProcess.length + " records off the stack leaving "
                    + me.ancillaryDataRecordsToBeInserted[deploymentID].length + " still to process");
                me.batchInsertAncillaryData(deploymentID, espName, recordsToProcess, function (err, numRecords) {
                    if (err) {
                        // Send the error to the callback
                        if (callback)
                            callback(err);
                    } else {
                        // Since our client called the method to flush the ancillary data records, it is likely
                        // that when we get here, the client is done add data records so we should update the deployment
                        // with the ancillary stats
                        me.updateDeploymentWithAncillaryStats(deploymentID, function (err) {
                            if (err) {
                                logger.error("Error returned trying to sync ancillary stats: ", err);
                                // Send it back to the caller
                                if (callback)
                                    callback(err);
                            } else {
                                logger.debug("UpdateDeploymentWithAncillaryStats callback called");
                                // And now since the deployment stats are updated and all records have been added, sync
                                // the CSV files with the data records. First grab the updated deployment by ID
                                me.getDeploymentByID(deploymentID, false, function (err, deployment) {
                                    // Check for error first
                                    if (err) {
                                        logger.error("There was an error trying to get the deployment after updating " +
                                            "ancillary data stats:", err);
                                        if (callback)
                                            callback(err);
                                    } else {
                                        // Make sure a deployment was found
                                        if (deployment) {
                                            // Now sync the CSV data files with the ancillary data in the database
                                            me.syncAncillaryDataFileWithDatabase(deployment, baseDir, function (err, result) {
                                                if (err) {
                                                    logger.error("Error trying to sync local CSV files with ancillary data:", err);
                                                    if (callback)
                                                        callback(err);
                                                } else {
                                                    logger.debug("syncAncillaryDataFileWithDatabase callback called");
                                                    if (callback)
                                                        callback(null);
                                                }
                                            });
                                        } else {
                                            if (callback)
                                                callback(new Error("No deployment with ID " + deploymentID + " was found"));
                                        }
                                    }
                                });
                            }
                        });
                    }

                });
            } else {
                logger.debug("Deployment with ID " + deploymentID + " had no more ancillary data to process");
                if (callback)
                    callback(null);
            }
            // Remove it
            delete this.ancillaryDataRecordsToBeInserted[deploymentID];
            logger.debug(this.ancillaryDataRecordsToBeInserted);
        } else {
            // Send an error back
            if (callback)
                callback(new Error("No deploymentID was specified"));
        }
    }

    /**
     *
     * @param deploymentID
     * @param espName
     * @param ancillaryDataArray
     * @param callback
     */
    this.batchInsertAncillaryData = function (deploymentID, espName, ancillaryDataArray, callback) {
        logger.info('insertAncillaryDataArray called with data array size of ' + ancillaryDataArray.length +
            ' and first record is ', ancillaryDataArray[0]);


        // First, verify parameters
        if (deploymentID && espName && ancillaryDataArray) {

            // Create the text that will be used to run the insert
            var valueText = null;

            // The original size of the data array
            var originalNumberOfRecords = ancillaryDataArray.length;

            // A counter to keep track of the records processed
            var numberOfRecordsProcessed = 0;

            // Loop over the array given
            for (var i = 0; i < ancillaryDataArray.length; i++) {

                // Pop a record off the array
                var sourceName = ancillaryDataArray[i][0];
                var varName = ancillaryDataArray[i][1];
                var varLongName = ancillaryDataArray[i][2];
                var varUnits = ancillaryDataArray[i][3];
                var logUnits = ancillaryDataArray[i][4];
                var timestamp = ancillaryDataArray[i][5];
                var data = ancillaryDataArray[i][6];

                // Look up the ancillary source ID from the deployment
                me.getAncillaryDataSourceID(deploymentID, espName, sourceName, varName, varLongName, varUnits,
                    logUnits, timestamp, data, function (err, sourceID, cbDeploymentID, cbEspName, cbSourceName, cbVarName, cbVarLongName, cbVarUnits, cbLogUnits, cbTimestamp, cbData) {
                        // Check for error
                        if (err) {
                            // And send the error back
                            if (callback)
                                callback(err);
                        } else {

                            // Make sure we have an ID
                            if (sourceID) {
                                // Check to see if a comma is necessary
                                if (valueText !== null) {
                                    valueText += ',';
                                } else {
                                    valueText = '';
                                }

                                // Append the insert value
                                valueText += '(' + sourceID +
                                    ',\'' + cbTimestamp + '\',' + cbData + ')';
                            } else {
                                // Log it and keep going
                                logger.error("No source ID found for deployment ID " + deploymentID +
                                    " of esp " + espName + " using record:", recordToProcess);
                            }
                        }

                        // Bump the number of records processed
                        numberOfRecordsProcessed++;

                        // Now if we have processed enough records to fire an insert or have processed
                        // all the records, do a bulk insert
                        if (numberOfRecordsProcessed === originalNumberOfRecords) {
                            logger.debug("Going to insert using statement:\n" + valueText);
                            // Grab a connection from the pool
                            pg.connect(me.pgConnectionString, function (err, client, done) {
                                // If there was an error, send it to the caller
                                if (err) {
                                    logger.error('Error getting pooled connection');
                                    logger.error(err);
                                    if (callback)
                                        callback(err);
                                } else {
                                    // Create the query and run it
                                    client.query('INSERT INTO ancillary_data(ancillary_source_id_fk, ' +
                                        'timestamp_utc, value) values ' + valueText, function (err, result) {

                                        // Check for errors
                                        if (err) {
                                            logger.error('Error inserting bulk rows');
                                            logger.error(err);

                                            // Send error to callback
                                            if (callback)
                                                callback(err);
                                        } else {
                                            logger.debug("Bulk insert complete. Result: ", result);
                                            // Check to see if we are done and close the DB if that is the case
                                            done();
                                            // Send the result
                                            if (callback)
                                                callback(null, numberOfRecordsProcessed);
                                        }
                                    });
                                }
                            });

                        }
                    });
            }
        } else {
            if (callback)
                callback(new Error("Not enough parameters, should have " +
                    "(deploymentID, espName, ancillaryDataArray, callback"));
        }
    }

    /**
     * This method takes in a deployment ID, looks up the deployment ancillary data statistics and then
     * updates the information attached to the deployment with that from the ancillary database.
     * @param deploymentID
     * @param callback
     */
    this.updateDeploymentWithAncillaryStats = function (deploymentID, callback) {
        // First let's verify the deployment ID was provided
        if (deploymentID) {
            // OK, so the ID is provided, we first need to construct the object that matches the source
            // information that is in the ancillary database.  Here is the query to get that information
            var querySourceInformation = 'SELECT * from ancillary_sources where deployment_id_fk = \'' +
                deploymentID + '\'';
            logger.debug("Going to query for ancillary source information using: " + querySourceInformation);

            // OK, let's connect up to the database
            pg.connect(me.pgConnectionString, function (err, client, done) {
                // If there is an error, send it back to the caller
                if (err) {
                    logger.error("Error on trying to get database client: ", err);
                    if (callback)
                        callback(err);
                    return;
                } else {
                    // OK, we have a good connection (client), let's run the query
                    client.query(querySourceInformation, function (err, result) {

                        // Check for error first
                        if (err) {
                            logger.error('Error running query ' + querySourceInformation);
                            logger.error(err);
                            if (callback)
                                callback(err);
                            return;
                        } else {
                            logger.debug('Query came back with ' + result.rows.length + ' source rows');

                            // Create an object that we can hang the ancillary data source information on
                            var ancillaryDataSources = {};

                            // Process rows
                            if (result && result.rows && result.rows.length > 0) {
                                for (var i = 0; i < result.rows.length; i++) {
                                    // Grab the information from the row
                                    var sourceID = result.rows[i].id;
                                    var instrumentType = result.rows[i].instrument_type;
                                    var varName = result.rows[i].var_name;
                                    var varLongName = result.rows[i].var_long_name;
                                    var varUnits = result.rows[i].units;
                                    var logUnits = result.rows[i].log_units;

                                    // First make sure the object has the instrument type attached
                                    if (!ancillaryDataSources[instrumentType])
                                        ancillaryDataSources[instrumentType] = {};

                                    // Then make sure we have log units
                                    if (!ancillaryDataSources[instrumentType][logUnits])
                                        ancillaryDataSources[instrumentType][logUnits] = {};

                                    // Now attach the other information to that object
                                    ancillaryDataSources[instrumentType][logUnits]['varName'] = varName;
                                    ancillaryDataSources[instrumentType][logUnits]['varLongName'] = varLongName;
                                    ancillaryDataSources[instrumentType][logUnits]['units'] = varUnits;
                                    ancillaryDataSources[instrumentType][logUnits]['sourceID'] = parseInt(sourceID);
                                }
                            }
                            logger.debug("Ancillary sources after sync: ", ancillaryDataSources);

                            // Close up the database connection
                            done();

                            // Now update the deployment
                            me.setAncillaryData(deploymentID, ancillaryDataSources, function (err) {
                                // If there is an error, send it back
                                if (err) {
                                    logger.error("Error trying to set the ancillary data on deployment with ID " +
                                        deploymentID);
                                    //
                                    if (callback)
                                        callback(err);
                                } else {
                                    // Send the result
                                    if (callback)
                                        callback(null);
                                }
                            });
                        }
                    });

                }
            });
        } else {
            // Send back an error
            if (callback)
                callback(new Error("No deployment ID was specified"));
        }
    }

    // ***********************************************************
    // This method takes in a Deployment object and an array of ancillary date records of the form
    // (instrument_type, variable_name, variable_long_name, units, units_from_log_file, timestamp_utc, data)
    // and then inserts the ancillary data in the PostgreSQL DB and updates the Deployment with
    // the updated ancillary data information
    // ***********************************************************
//    this.insertAncillaryDataArray = function (deployment, ancillaryDataArray, callback) {
//        logger.debug('insertAncillaryDataArray called with deployment ');
//        logger.debug(deployment);
//        logger.debug('and with an array of ' + ancillaryDataArray.length + ' points');
//
//        // Grab a reference to self
//        var self = this;
//
//        // Make sure we have data to process
//        if (ancillaryDataArray && ancillaryDataArray.length && ancillaryDataArray.length > 0) {
//
//            // Next, let's make sure there is a deployment and some ancillary data points to
//            // actually process, otherwise, throw an error
//            if (deployment && deployment.ancillaryData) {
//
//                // We are looking good to go, so let's call the method that will make sure
//                // we have source IDs associated with the deployment
//                assignSourceIDsToDeployment(deployment, function (err, updatedDeployment) {
//
//                    // Check for errors first
//                    if (err) {
//                        callback(err);
//                    } else {
//                        // Persist any changes to the deployment
//                        logger.info('DataAccess calling persistDeployment on ' + updatedDeployment.name + '(rev=' + updatedDeployment._rev + ')');
//                        self.persistDeployment(updatedDeployment, function (err, updatedUpdatedDeployment) {
//                            if (err) {
//                                callback(err);
//                            } else {
//                                // Now I have the deployment with all ancillary sources having ID's,
//                                // go ahead and persist the actual data points.  First create the PostgreSQL
//                                // client and then pass it into the method to insert the data
//                                pg.connect(self.pgConnectionString, function (err, client, done) {
//                                    // Check for any error
//                                    if (err) {
//                                        logger.error('Error connection to the postgres DB');
//                                        logger.error(err);
//                                        callback(err);
//                                    } else {
//                                        // Client should be good to go, call the method to process the data
//                                        insertAncillaryDataArray(updatedUpdatedDeployment, client, ancillaryDataArray, function (err, deploymentAfterDataInsert) {
//                                            // Call done to clean up the DB
//                                            done();
//                                            // And persist the updated deployment
//                                            logger.info('DataAccess calling persistDeployment on ' + deploymentAfterDataInsert.name + '(rev=' + deploymentAfterDataInsert._rev + ')');
//                                            self.persistDeployment(deploymentAfterDataInsert, function (err, lastUpdatedDeployment) {
//                                                callback(err, lastUpdatedDeployment);
//                                            });
//
//                                            // Emit and event that ancillary data was updated
//                                            self.emit('ancillaryDataPersisted', {
//                                                deployment: deploymentAfterDataInsert
//                                            });
//
//                                        });
//                                    }
//                                });
//                            }
//                        });
//                    }
//                });
//            } else {
//                callback(new Error('No deployment or ancillary data objects associated with the deployment'));
//            }
//        } else {
//            // No data was to be processed, just return
//            callback(null, deployment);
//        }
//
//        // This method takes in a deployment and ensures there are IDs associated with each of the
//        // ancillary data objects.
//        function assignSourceIDsToDeployment(deployment, callback) {
//            logger.debug('Going to check all source IDs for deployment');
//            logger.debug(deployment);
//            var deploymentForAssigning = deployment;
//
//            // Connect to the database
//            pg.connect(self.pgConnectionString, function (err, client, done) {
//
//                // Check for errors connecting to the DB
//                if (err) {
//                    // Log the error
//                    logger.fatal('Error connecting to Postgres when assigning source IDs');
//                    logger.fatal(err);
//
//                    // Send to callback
//                    callback(err);
//                } else {
//                    // The number of variables to be processed
//                    var numberOfVariablesToProcess = 0;
//
//                    // Start by grabbing the names of the data sources from the deployment
//                    var sourceNames = Object.keys(deploymentForAssigning.ancillaryData);
//
//                    // Let's count up the total number of variables there are to check
//                    sourceNames.forEach(function (sourceName) {
//                        numberOfVariablesToProcess += Object.keys(deploymentForAssigning.ancillaryData[sourceName]).length;
//                    });
//                    logger.debug('There are a total of ' + numberOfVariablesToProcess + ' variables to check');
//
//                    // Successful connection to the DB, now loop over the sources
//                    sourceNames.forEach(function (sourceName) {
//
//                        // Now loop over the log units for that source
//                        Object.keys(deploymentForAssigning.ancillaryData[sourceName]).forEach(function (logUnits) {
//
//                            logger.debug('Checking ' + sourceName + ' unit ' + logUnits);
//                            logger.debug(deploymentForAssigning.ancillaryData[sourceName][logUnits]);
//
//                            // Check to see if the ancillary source ID has already been assigned
//                            if (deploymentForAssigning.ancillaryData[sourceName][logUnits]['sourceID'] &&
//                                deploymentForAssigning.ancillaryData[sourceName][logUnits]['sourceID'] > 0) {
//
//                                logger.debug('ID already exists, skip it');
//                                // Decrement the number of variables to process since we are processing one now
//                                numberOfVariablesToProcess--;
//
//                                if (numberOfVariablesToProcess === 0) {
//                                    logger.debug('Done checking for source IDs, close the DB and send ' +
//                                        'updated deployment to callback');
//                                    done();
//                                    callback(null, deploymentForAssigning);
//                                }
//                            } else {
//                                client.query('SELECT id from ancillary_sources where deployment_id_fk = $1 ' +
//                                    'and esp_name = $2 and instrument_type = $3 ' +
//                                    'and log_units = $4',
//                                    [deploymentForAssigning._id, deploymentForAssigning.esp.name, sourceName, logUnits],
//                                    function (err, result) {
//                                        // Check for any errors first
//                                        if (err) {
//                                            // Log the error
//                                            logger.error('DB error searching for ancillary source ID');
//                                            logger.error(err);
//
//                                            // Decrement the number of variables to process since we are processing one now
//                                            numberOfVariablesToProcess--;
//
//                                            // Close the connection and send back to caller with error
//                                            done();
//                                            callback(err);
//                                        } else {
//                                            // The query for the ancillary source executed OK, we now need to check
//                                            // to see if the ancillary source query returned anything
//                                            if (result && result.rows && result.rows.length > 0) {
//
//                                                // Yep, found it, grab the result and add it to the deployment info
//                                                deploymentForAssigning.ancillaryData[sourceName][logUnits]['sourceID'] = result.rows[0].id;
//                                                logger.debug('ID already in DB: ' + result.rows[0].id);
//
//                                                // Decrement the number of variables to process since we are processing one now
//                                                numberOfVariablesToProcess--;
//
//                                                // Check if we are done
//                                                if (numberOfVariablesToProcess === 0) {
//                                                    logger.debug('Done checking for source IDs, close the DB and send ' +
//                                                        'updated deployment to callback');
//                                                    done();
//                                                    callback(null, deploymentForAssigning);
//                                                }
//                                            } else {
//                                                // No, luck will have to insert one and add it to the deployment, then send it back
//                                                client.query('INSERT INTO ancillary_sources(deployment_id_fk, esp_name, instrument_type, ' +
//                                                    'var_name, var_long_name, log_units, units) values ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
//                                                    [deploymentForAssigning._id, deploymentForAssigning.esp.name, sourceName,
//                                                        deploymentForAssigning.ancillaryData[sourceName][logUnits].varName,
//                                                        deploymentForAssigning.ancillaryData[sourceName][logUnits].varLongName,
//                                                        logUnits, deploymentForAssigning.ancillaryData[sourceName][logUnits].units],
//                                                    function (err, result) {
//                                                        // Check for errors
//                                                        if (err) {
//                                                            // Log the error
//                                                            logger.warn('Error trying to insert a new ancillary data source for');
//                                                            logger.warn(err);
//
//                                                            // Decrement the number of variables to process since we are processing one now
//                                                            numberOfVariablesToProcess--;
//
//                                                            // Close the database and send back to caller
//                                                            done();
//                                                            callback(err);
//                                                        } else {
//                                                            // Grab the ID of the ancillary source and set it
//                                                            deploymentForAssigning.ancillaryData[sourceName][logUnits]['sourceID'] = result.rows[0].id;
//                                                            logger.debug('Created new source ID of ' + result.rows[0].id);
//
//                                                            // Decrement the number of variables to process since we are processing one now
//                                                            numberOfVariablesToProcess--;
//
//                                                            // Check if we are done
//                                                            if (numberOfVariablesToProcess === 0) {
//                                                                logger.debug('Done checking for source IDs, close the DB and send ' +
//                                                                    'updated deployment to callback');
//                                                                done();
//                                                                callback(null, deploymentForAssigning);
//                                                            }
//                                                        }
//                                                    }
//                                                );
//                                            }
//                                        }
//                                    } // End callback function to handle results of search for existing source ID
//                                ); // End of query to search for existing ID
//                            }
//                        });
//                    }); // End foreach over source names
//                } // End if-else from error trap on database connection callback
//            }); // End pg.connect call
//
//        }
//
//        // This is a recursive method that processes ancillary data from an array, inserts them into the PostgreSQL
//        // database and updates the deployment with the updated information
//        function insertAncillaryDataArray(deployment, pgClient, ancillaryDataArray, callback) {
//            logger.debug('insertAncillaryDataArray called with data array size of ' + ancillaryDataArray.length);
//            logger.debug('Callback function is ', callback);
//            // Create a counter to count the current number of records that have been popped off the array
//            var numRecordsProcessed = 0;
//
//            // The value text clause that will be used in the insert
//            var valueText = '';
//
//            // Now loop until you have reached the batch size or until the array is empty
//            while (numRecordsProcessed < self.numAncillaryPointsToBatch && ancillaryDataArray.length > 0) {
//                // Pop a record off the array
//                var recordToProcess = ancillaryDataArray.pop();
//                // Look up the ancillary source ID from the deployment
//                if (deployment && deployment.ancillaryData && deployment.ancillaryData[recordToProcess[0]] &&
//                    deployment.ancillaryData[recordToProcess[0]][recordToProcess[4]] &&
//                    deployment.ancillaryData[recordToProcess[0]][recordToProcess[4]].sourceID &&
//                    deployment.ancillaryData[recordToProcess[0]][recordToProcess[4]].sourceID > 0) {
//
//                    // Make sure there is a field for number of points
//                    if (deployment.ancillaryData[recordToProcess[0]][recordToProcess[4]].numPoints &&
//                        deployment.ancillaryData[recordToProcess[0]][recordToProcess[4]].numPoints >= 0) {
//                        // Bump the counter on the number of variables
//                        deployment.ancillaryData[recordToProcess[0]][recordToProcess[4]].numPoints++;
//                    } else {
//                        // Initialize it to one
//                        deployment.ancillaryData[recordToProcess[0]][recordToProcess[4]].numPoints = 1;
//                    }
//
//                    // Check to see if a comma is necessary
//                    if (valueText !== '') {
//                        valueText += ',';
//                    }
//
//                    // Append the insert value
//                    valueText += '(' + deployment.ancillaryData[recordToProcess[0]][recordToProcess[4]].sourceID +
//                        ',\'' + recordToProcess[5] + '\',' + recordToProcess[6] + ')';
//
//                }
//                // Bump the counter
//                numRecordsProcessed++;
//            }
//
//            // Create the query and run it
//            pgClient.query('INSERT INTO ancillary_data(ancillary_source_id_fk, ' +
//                'timestamp_utc, value) values ' + valueText, function (err, result) {
//
//                // Check for errors
//                if (err) {
//                    logger.error('Error inserting bulk rows');
//                    logger.error(err);
//                    callback(err);
//                } else {
//                    // So it looks like the insert was successful, let's recursively call this method
//                    // with any remaining records
//                    logger.debug('Done with bulk insert and inserted ', result);
//                    if (ancillaryDataArray.length > 0) {
//                        logger.debug('Now recursively calling with ' + ancillaryDataArray.length
//                            + ' records left to process');
//                        insertAncillaryDataArray(deployment, pgClient, ancillaryDataArray, callback);
//                        // And return
//                        return;
//                    } else {
//                        // Call the callback that has been passed down as we are done!
//                        callback(null, deployment);
//                    }
//                }
//            });
//        }
//    }
//
    // This method uses the information in the database to synchronize a file that represents the parsed
    // ancillary data from the various sources.
    this.syncAncillaryDataFileWithDatabase = function (deployment, basedir, callback) {
        // Grab a reference to this
        var self = this;

        logger.debug('Will syncronize ancillary data from deployment ' +
            deployment.name + ' using base dir ' + basedir);

        logger.debug("The current ancillary files being syncd are:", self.ancillaryFilesBeingSyncd);

        // First thing to do is make sure there is ancillary data listed under the deployment
        if (deployment.ancillaryData) {
            // Make sure there is at least one ancillary data source
            if (Object.keys(deployment.ancillaryData).length > 0) {
                // This is the object to hold the sources and their associated writeStreams
                var sourceStreams = {};

                // A counter to keep track of how many sources are currently in process
                var sourceCounter = 0;

                // Loop over the data sources and pass of to function to retain scope
                // of 'source'
                for (var source in deployment.ancillaryData) {
                    logger.debug('Working with source ' + source);
                    // Bump the counter
                    sourceCounter++;

                    // Call function to process the source
                    processSource(deployment, source, function (err) {
                        // We are here, but we may not be the only source being
                        // processed, so decrement the counter and see where we are
                        sourceCounter--;

                        // If there are no more sources being processed, send it
                        // back to the caller, otherwise, don't do anything
                        if (sourceCounter === 0) {
                            logger.debug("No more sources to process, exiting");

                            // If there was an error, send it back
                            // TODO kgomes In reality, if I am here and there is no error
                            // on this particular callback, it could be that a different
                            // one did have an error and it would be ignored. Hmmmm...
                            if (err) {
                                if (callback)
                                    callback(err);
                            } else {
                                // If we are here, assume all is well and return OK
                                if (callback)
                                    callback(null, true);
                            }
                        }
                    });
                }
            } else {
                // There are no entries for ancillary data, so we will just return it to the
                // caller with success since it is really not an error as far as we are concerned
                if (callback)
                    callback(null, true);
            }
        } else {
            // If we are here, assume all is well and return OK
            if (callback)
                callback(null, true);
        }

        // This is a function that processes each source from a deployment
        function processSource(deployment, source, callback) {
            logger.debug('Processing source ', source);

            // Now build the CSV file for this source
            var filePath = path.join(basedir, 'instances', deployment.esp.name, 'deployments',
                deployment.name, 'data', 'processed', source + '.csv');
            logger.debug('File path is ', filePath);
            // We first need to make sure the base directory is built
            var pathElements = filePath.split(path.sep);
            var growPath = '';
            for (var i = 0; i < (pathElements.length - 1); i++) {
                growPath = path.normalize(growPath + path.sep + pathElements[i]);
                if (!fs.existsSync(growPath)) {
                    fs.mkdirSync(growPath);
                }
            }

            // Check to see if it is being sync'd already
            if (self.ancillaryFilesBeingSyncd.indexOf(filePath) >= 0) {
                logger.debug('File ' + filePath + ' is already being syncd so will ignore request');
                if (callback)
                    callback(null);
            } else {

                // Add it to the array of files being syncd so we can track what is going on
                self.ancillaryFilesBeingSyncd.push(filePath);

                // Does the file currently exist?
                fs.exists(filePath, function (exists) {

                    if (exists) {
                        logger.debug('File already exists');

                        // Since the file exists, we need to grab the latest timestamp from the file so
                        // we only append the data that is new.
                        var instream = fs.createReadStream(filePath);
                        var outstream = new stream;
                        var rl = readline.createInterface(instream, outstream);
                        var latestEpoch = null;
                        var lineCounter = 0;

                        // Read down the file looking for the latest epoch seconds
                        rl.on('line', function (line) {
                            lineCounter++;
                            latestEpoch = line.split(',')[0];
                        });

                        // Once the file is closed, query for more recent data and append to the file
                        rl.on('close', function () {
                            logger.debug("Reading of file done");
                            logger.debug("last epoch for file " + filePath + " is " + latestEpoch);

                            if (latestEpoch && lineCounter > 1) {
                                // Grab the source IDs
                                var sourceIDArray = getSourceIDs(deployment, source);

                                // TODO kgomes do I need to check to make sure sourceIDArray has elements?

                                // Now build the query
                                var query = 'SELECT distinct extract(epoch from timestamp_utc) as epochseconds, ' +
                                    'timestamp_utc, ancillary_source_id_fk, value from ancillary_data where (';
                                for (var i = 0; i < sourceIDArray.length; i++) {
                                    if (i > 0) {
                                        query += ' OR';
                                    }
                                    query += ' ancillary_source_id_fk = ' + sourceIDArray[i];
                                }
                                query += ') and extract(epoch from timestamp_utc) > ' + latestEpoch;
                                query += ' order by timestamp_utc asc'
                                logger.debug("New query is: " + query);

                                // Now write the data
                                writeAncillaryData(filePath, query, sourceIDArray, function (err) {
                                    logger.debug("Appending data complete", err);

                                    // Remove it from the tracker
                                    var filePathIndex = self.ancillaryFilesBeingSyncd.indexOf(filePath);
                                    logger.debug("File path was found at index " + filePathIndex + ", will remove it");
                                    self.ancillaryFilesBeingSyncd.splice(filePathIndex, 1);
                                    logger.debug("ancillaryFileBeingSyncd:", self.ancillaryFilesBeingSyncd);

                                    // Send it back to the caller
                                    if (callback)
                                        callback(err);
                                });
                            } else {
                                // The file already existed, but there was no latest epoch timestamp
                                // found.  This should not really happen, so we will send back an error
                                var errorMessage = 'While file ' + filePath + ' already exists, it did not seem ' +
                                    ' to have any existing data.  That is very strange';
                                logger.error(errorMessage);

                                // Remove it from the tracker
                                var filePathIndex = self.ancillaryFilesBeingSyncd.indexOf(filePath);
                                logger.debug("File path was found at index " + filePathIndex + ", will remove it");
                                self.ancillaryFilesBeingSyncd.splice(filePathIndex, 1);
                                logger.debug("ancillaryFileBeingSyncd:", self.ancillaryFilesBeingSyncd);

                                // Send an error back to caller
                                if (callback)
                                    callback(new Error(errorMessage));
                            }
                        });
                    } else {
                        logger.debug('File ' + filePath + ' does not exist, will create it and write header');
                        // Write the header to the file first
                        writeHeader(deployment, source, filePath, function (err) {
                            // Check for an error
                            if (err) {
                                logger.error("Error trying to write header: ", err);

                                // Clean the entry from the tracker
                                var filePathIndex = self.ancillaryFilesBeingSyncd.indexOf(filePath);
                                logger.debug("File path was found at index " + filePathIndex + ", will remove it");
                                self.ancillaryFilesBeingSyncd.splice(filePathIndex, 1);
                                logger.debug("ancillaryFileBeingSyncd:", self.ancillaryFilesBeingSyncd);

                                // Now send it back with the error
                                if (callback)
                                    callback(err);
                            } else {
                                // Grab sourceIDs
                                var sourceIDArray = getSourceIDs(deployment, source);

                                // TODO kgomes do I need to check for elements here?
                                if (sourceIDArray) {
                                    // Create the proper query to grab all the data
                                    var query = 'SELECT distinct extract(epoch from timestamp_utc) as epochseconds, ' +
                                        'timestamp_utc, ancillary_source_id_fk, value from ancillary_data where';
                                    for (var i = 0; i < sourceIDArray.length; i++) {
                                        if (i > 0) {
                                            query += ' OR';
                                        }
                                        query += ' ancillary_source_id_fk = ' + sourceIDArray[i];
                                    }
                                    query += ' order by timestamp_utc asc';
                                    logger.debug('Query string = ' + query);

                                    // Now write the data
                                    writeAncillaryData(filePath, query, sourceIDArray, function (err) {
                                        if (err) {
                                            logger.error("Error caught trying to write ancillary data to file:", err);
                                        }

                                        // Clear the entry from the tracker
                                        var filePathIndex = self.ancillaryFilesBeingSyncd.indexOf(filePath);
                                        logger.debug("File path was found at index " + filePathIndex + ", will remove it");
                                        self.ancillaryFilesBeingSyncd.splice(filePathIndex, 1);
                                        logger.debug("ancillaryFileBeingSyncd:", self.ancillaryFilesBeingSyncd);

                                        // Send it back to the caller
                                        if (callback)
                                            callback(err);
                                    });
                                } else {
                                    var errorMessage = 'No source ID array was returned, that is just not right!';
                                    logger.error(errorMessage);

                                    // Clean the entry from the tracker
                                    var filePathIndex = self.ancillaryFilesBeingSyncd.indexOf(filePath);
                                    logger.debug("File path was found at index " + filePathIndex + ", will remove it");
                                    self.ancillaryFilesBeingSyncd.splice(filePathIndex, 1);
                                    logger.debug("ancillaryFileBeingSyncd:", self.ancillaryFilesBeingSyncd);

                                    // Send an error back to the caller
                                    if (callback)
                                        callback(new Error(errorMessage));
                                }
                            }
                        });
                    }
                });
            }
        }

        // This function is a convenience function to return the sourceIDs
        // associated with a deployment and source
        function getSourceIDs(deployment, source) {
            // The source IDs to return
            var sourceIDs = [];

            //  Make sure there is something there to examine
            if (deployment && source && deployment.ancillaryData[source]) {

                // Loop over the variable entries
                for (var varEntry in deployment.ancillaryData[source]) {

                    // Push the ID on the array
                    sourceIDs.push(deployment.ancillaryData[source][varEntry]['sourceID']);
                }
            }

            // Return the result
            return sourceIDs;
        }

        // This is a function that will write a header to a write stream
        function writeHeader(deployment, source, filePath, callback) {
            // Now create a stream writer
            var sourceStream = fs.createWriteStream(filePath, {'flags': 'a'});

            // Add the event handler to send the call back when the stream finished
            sourceStream.on('finish', function () {
                logger.debug('Header writing complete');
                if (callback)
                    callback(null);
            });

            // The header
            var headerText = 'Timestamp(Epoch Seconds),Datetime';

            // Create the line to write
            for (var varEntry in deployment.ancillaryData[source]) {
                logger.debug('Dealing with varEntry ', varEntry);

                // Append the header text (adding comma if not the first entry)
                headerText += ',' + deployment.ancillaryData[source][varEntry]['varLongName'] +
                    ' (' + deployment.ancillaryData[source][varEntry]['units'] + ')';
            }
            logger.debug('headerText: ', headerText);

            // Now write it
            sourceStream.write(headerText + '\n', function (err) {
                // Depending on the result, send it back to the caller
                if (err) {
                    logger.error('Error writing header to file: ', err);
                    if (callback)
                        callback(err);
                }

                // End the stream
                sourceStream.end();
            });
        }

        // This is a function that reads data from the ancillary database and appends to
        // the file specified.
        function writeAncillaryData(filePath, query, sourceIDArray, callback) {
            // Now create a stream writer
            var sourceStream = fs.createWriteStream(filePath, {'flags': 'a'});

            // When the finish event occurs, send the callback
            sourceStream.on('finish', function () {
                logger.debug("All writing finished");
                if (callback)
                    callback(null);
            });

            // TODO kgomes, should I surround this whole next block with try/catch?
            // Open it and start writing
            sourceStream.once('open', function (fd) {
                // Check for the file handle
                if (fd) {
                    // Let's run the query
                    pg.connect(self.pgConnectionString, function (err, client, done) {
                        // Check for error first
                        if (err) {
                            logger.error('Error caught trying to connect to DB');
                            logger.error(err);
                            sourceStream.end();
                            if (callback)
                                callback(err);
                        } else {
                            // Run the query
                            client.query(query, function (err, result) {
                                // Check for an error
                                if (err) {
                                    logger.error('Error running query');
                                    logger.error(err);
                                    sourceStream.end();
                                    if (callback)
                                        callback(err);
                                } else {
                                    logger.debug('Query came back with ' + result.rows.length + ' points');
                                    if (result && result.rows && result.rows.length > 0) {
                                        // A placeholder for the timestamp we are currently working with
                                        var currentEpochSeconds = null;
                                        var currentTimestamp = null;
                                        var valueArray = [];
                                        // Loop over all the rows
                                        for (var i = 0; i < result.rows.length; i++) {
                                            // Grab the values from the row
                                            var tempEpochSeconds = result.rows[i]['epochseconds'];
                                            var tempTimestamp = result.rows[i]['timestamp_utc'];
                                            var tempAncSourceIDFK = result.rows[i]['ancillary_source_id_fk'];
                                            var tempValue = result.rows[i]['value'];

                                            // If it's the first row, save the timestamp
                                            if (i === 0) {
                                                currentEpochSeconds = tempEpochSeconds;
                                                currentTimestamp = tempTimestamp;
                                            }

                                            // Now if the timestamp has changed, we need to write the row
                                            if (tempEpochSeconds !== currentEpochSeconds) {
                                                var rowToWrite = currentEpochSeconds + ',' + currentTimestamp;
                                                for (var j = 0; j < valueArray.length; j++) {
                                                    rowToWrite += ',';
                                                    rowToWrite += valueArray[j];
                                                }
                                                sourceStream.write(rowToWrite + '\n');
                                                // Re-initialize things
                                                currentEpochSeconds = tempEpochSeconds;
                                                currentTimestamp = tempTimestamp;
                                                valueArray = [];
                                            }
                                            // Search for the index where the source id is located
                                            var sourceIDIndex = sourceIDArray.indexOf(tempAncSourceIDFK);
                                            // Insert the value there
                                            if (sourceIDIndex >= 0) valueArray[sourceIDIndex] = tempValue;
                                        }
                                        logger.debug("Done looping over rows");
                                    }
                                    sourceStream.end();
                                    done();
                                }
                            });
                        }
                    });
                } else {
                    logger.error("No file handle returned from opening of file stream for file " + filePath);
                    if (callback)
                        callback(new Error("Did not get file handle for file " + filePath + " when opening for writing"));

                }
            });
        }
    }


}

// Export the factory method
exports.createDataAccess = function (opts) {
    return new DataAccess(opts);
}