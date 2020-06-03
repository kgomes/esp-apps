// Grab dependencies
var fs = require('fs');
var cradle = require('cradle');
var os = require('os');
var { Pool } = require('pg');
var path = require('path');
var readline = require('readline');
var stream = require('stream');
var moment = require('moment');
var Slack = require('node-slackr');
var deploymentUtils = require('./DeploymentUtils');

// Grab the object that can be used to initialize the views in CouchDB if the database does not exist
var couchViews = require('./couch-views');

// Configure logging for the DataStore
var log4js = require('log4js');
log4js.loadAppender('file');

// Grab the logger
var logger = log4js.getLogger('DataAccess');

// The constructor function
function DataAccess(config, dataDir,  dataDirectoryBaseUrl, slackUsername, slackWebHookURL, logDir, logLevel) {
    // TODO kgomes, verify all options are present in the incoming 'opts' object

    // Set the log directory
    log4js.addAppender(log4js.appenders.file(logDir + '/DataAccess.log'), 'DataAccess');
    deploymentUtils.setLogDirectory(logDir);

    // Set the logger level
    if (logLevel) {
        logger.setLevel(logLevel);
        deploymentUtils.setLogLevel(logLevel);
    }

    // Slack variables
    this.slack = null;
    this.slackUsername = slackUsername;

    // Create the slack connection if a web hook url is specified
    if (slackWebHookURL) {
        logger.info("Will send message to Slack at URL " + slackWebHookURL);
        this.slack = new Slack(slackWebHookURL);
    }

    // Create an array that will act as a queue for slack messages so we can make sure we don't send messages
    // too fast
    this.slackQueue = [];

    // Data directory variables
    this.dataDir = dataDir;
    this.dataDirectoryBaseUrl =  dataDirectoryBaseUrl;

    // Grab reference to this for scoping
    var me = this;

    // Grab the number of CPUs for workers
    this.numberOfCPUs = os.cpus().length;
    logger.info("There are " + this.numberOfCPUs + " CPUs on this server");

    // Grab the number of points that will be batch inserted
    this.numAncillaryPointsToBatch = config.numAncillaryPointsToBatch;

    // Set the local properties for the data connection to couch DB
    this.couchConfiguration = {
        host: config.couchHost,
        port: config.couchPort,
        ssl: config.couchSSL,
        username: config.couchUsername,
        password: config.couchPassword,
        database: config.couchDatabase
    };

    // Grab a connection to the CouchDB server
    this.couchDBConn = new (cradle.Connection)(
        this.couchConfiguration.host,
        this.couchConfiguration.port,
        {
            cache: false,
            auth: {
                username: this.couchConfiguration.username,
                password: this.couchConfiguration.password
            }
        }).database(this.couchConfiguration.database);
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
            logger.warn('The ESP Couch database does NOT exist yet, will try to create');
            // Try to create it
            me.couchDBConn.create(function (err) {
                if (err) {
                    logger.fatal("Could not create database");
                    logger.fatal(err);
                } else {
                    logger.info("Was able to create ESP CouchDB successfully");
                    // Now create all the views needed
                    me.couchDBConn.save('_design/deployments', couchViews.deployments);
                    me.couchDBConn.save('_design/esps', couchViews.esps);
                    me.couchDBConn.save('_design/users', couchViews.users);
                }
            });
        }
    });

    // Set the local properties for the PostgreSQL connection
    this.pgConfiguration = {
        protocol: config.pgProtocol,
        host: config.pgHost,
        port: config.pgPort,
        username: config.pgUsername,
        password: config.pgPassword,
        database: config.pgDatabase
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

    // Create a connection pool for the PostgreSQL database
    this.pgPool = new Pool({
        host: config.pgHost,
        port: config.pgPort,
        database: config.pgDatabase,
        user: config.pgUsername,
        password: config.pgPassword
    });

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
    // This function gets a deployment by it's ID
    // ***********************************************************
    this.getDeploymentByID = function (id, returnFull, callback) {
        // Check to see if the caller wants the full version by having a parameter
        // called returnFull that is true.
        if (returnFull) {
            // Grab the full deployment using the ID
            this.couchDBConn.get(id, function (err, result) {
                logger.debug('getDeploymentByID called with ID ' + id);
                if (err) {
                    logger.error('Error caught trying to find Deployment by ID');
                    logger.error(err);
                    if (callback)
                        callback(err);
                } else {
                    logger.debug('Found a Deployment and will return it');
                    if (callback)
                        callback(null, result);
                }
            })
        } else {
            // Specify options that will pull the deployment with just that ID from the collection
            // of shallow deployments
            var opts = {
                key: id
            };

            // Query for all Deployments in the shallow form
            this.couchDBConn.view('deployments/all', opts, function (err, result) {
                logger.debug('getDeploymentByID called with ID ' + id);
                // Check for an error first
                if (err) {
                    logger.error('Error trying to find by using all view with ID as key');
                    logger.error(err);
                    if (callback)
                        callback(err);
                } else {
                    logger.debug('Got ' + result.length + ' Deployments from CouchDB: ');

                    // Since we are looking for only one and we filtered by that ID, we should return
                    // the first one specified
                    if (result.length > 0) {
                        // Now pass it to the callback function
                        if (callback)
                            callback(err, result[0].value);
                    } else {
                        // Nothing was found, just return null
                        if (callback)
                            callback(null, null);
                    }
                }
            });
        }
    }

    // ***********************************************************
    // This function looks for Deployments that have the given
    // name and also have an ESP with the given ESP name. This
    // should be almost the equivalent of an ID.
    // ***********************************************************
    this.getDeploymentsByNameAndESPName = function (deploymentName, espname, callback) {
        logger.debug('Going to get deployments with the name ' + deploymentName + ' and ESP name ' + espname);
        var opts = {
            key: [deploymentName, espname]
        }
        // Run the couch query
        this.couchDBConn.view('deployments/byNameAndESPName', opts, function (err, result) {
            // Check for an error first
            if (err) {
                logger.error('Error trying to get deployments by name ' + deploymentName + ' and ESP name ' + espname);
                logger.error(err);
                if (callback)
                    callback(err);
            } else {
                logger.debug('Got deployments by name and espname');
                logger.debug(result);

                // Create an array to process
                var deploymentArray = [];

                // Put the deployments in the array
                for (var i = 0; i < result.length; i++) {
                    deploymentArray.push(result[i].value);
                }

                // Now pass it to the callback function
                if (callback)
                    callback(null, deploymentArray);
            }
        });
    }

    // ***********************************************************
    // This function takes in a deployment JSON object and looks 
    // for it's equivalent in CouchDB.  Basically, if it has an
    // ID, it tries that.  If not ID is specified or if the ID
    // does not return anything, then it looks by deployment name
    // and ESP name which should basically be an alternative primary
    // key.
    // ***********************************************************
    this.getPersistentDeployment = function (deployment, callback) {
        // Let's see if it has an ID already
        var deploymentID = deployment['_id'] || deployment['id'];
        if (deploymentID) {
            logger.debug("Deployment ID Before " + deployment._id);
            logger.debug("Deployment Rev Before " + deployment._rev);
            // Try to find a Deployment with that ID
            this.getDeploymentByID(deploymentID, true, function (err, result) {
                if (err) {
                    if (callback) {
                        callback(err);
                    }
                } else {
                    // Check to see if a deployment was found and return it
                    if (result) {
                        if (callback) {
                            callback(null, result);
                        }
                    } else {
                        // Since nothing was found with that ID, try by name
                        // and ESP name
                        this.getDeploymentsByNameAndESPName(deployment['name'], deployment['esp']['name'], function (err, results) {
                            // Check for an error first
                            if (err) {
                                logger.error('Error trying to look up Deployments by name and ESP name');
                                logger.error(err);
                                if (callback) {
                                    callback(err);
                                }
                            } else {
                                // Check to see if there was a result
                                if (results) {
                                    // Make sure there is one or more
                                    if (results.length > 0) {
                                        // Just return the first result
                                        if (callback) {
                                            callback(null, results[0]);
                                        }
                                    } else {
                                        if (callback)
                                            callback(null, null);
                                    }
                                } else {
                                    if (callback) {
                                        callback(null, null);
                                    }
                                }
                            }
                        })
                    }
                }

            });
        } else {
            // Since there was no ID, let's try to look up an existing deployment
            // by it's name and ESP name.  Make sure there is an ESP name first
            if (deployment['name'] && deployment['esp'] && deployment['esp']['name']) {
                this.getDeploymentsByNameAndESPName(deployment['name'], deployment['esp']['name'], function (err, results) {
                    // Check for an error first
                    if (err) {
                        logger.error('Error trying to look up Deployments by name and ESP name');
                        logger.error(err);
                        if (callback) {
                            callback(err);
                        }
                    } else {
                        // Make sure there were results
                        if (results.length > 0) {
                            // Just return the first result
                            if (callback) {
                                callback(null, results[0]);
                            }
                        } else {
                            if (callback)
                                callback(null, null);
                        }
                    }
                })
            } else {
                // Not enough information to find a deployment, return nothing
                if (callback)
                    callback(null, null);
            }
        }
    }

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
        this.couchDBConn.view('deployments/names', { group: true, reduce: true }, function (err, res) {
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
                logger.debug(res);
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
    // This method queries for a list of PCR Types
    // the deployment with the given ID sorted by time
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
    //    this.getDeploymentPCRRunNames = function (id, pcrType, callback) {
    //        logger.debug('Going to get pcr runNames array for deployment with ID: ' + id + ' and pcr type ' + pcrType);
    //        var opts = {
    //            key: [id, pcrType]
    //        }
    //        // Run the couch query
    //        this.couchDBConn.view('deployments/pcrRunNames', opts, function (err, res) {
    //                logger.debug("response", res);
    //                logger.debug("res[0]", res[0]);
    //                logger.debug("res[0].value", res[0].value);
    //                // Check for an error first
    //                if (err) {
    //                    logger.error('Error trying to get deployment prcRunNames');
    //                    logger.error(err);
    //                } else {
    //                    if (res && res[0] && res[0].value) {
    //                        // Now pass it to the callback function
    //                        callback(err, res[0].value);
    //                    } else {
    //                        callback(err, []);
    //                    }
    //                }
    //            }
    //        );
    //    }

    // ***********************************************************
    // This method queries for an array of pcr epoch seconds
    // associated with the deployment with the given ID, the
    // given pcrType, and the given pcrRunName
    // ***********************************************************
    this.getDeploymentPCREpochSeconds = function (id, pcrType, columnName, callback) {
        logger.debug('Going to get pcr runNames array for deployment with ID: ' +
            id + ' and pcr type ' + pcrType + ' and column name ' + columnName);
        var opts = {
            key: [id, pcrType, columnName]
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
    this.getDeploymentPCRColumnNames = function (id, pcrType, callback) {
        logger.debug('Going to get pcr column name array for deployment with ID: ' +
            id + ' and pcr type ' + pcrType);
        var opts = {
            key: [id, pcrType]
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
    this.getDeploymentPCRDataRecords = function (id, pcrType, columnName, epochSecs, callback) {
        logger.debug('Going to get pcr data records array for deployment with ID: ' +
            id + ' and pcr type ' + pcrType + ' and column name ' + columnName + ' and epochSecs ' +
            epochSecs);
        var opts = {
            key: [id, pcrType, columnName, epochSecs]
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
            me.couchDBConn.view('esps/allNames', { group: true, reduce: true }, function (err, res) {
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
            let opts = {
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
            this.couchDBConn.view('esps/all', { group: true, reduce: true }, function (err, res) {
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

        logger.debug("PersistDeployment called on deployment named " + deployment.name);

        // First let's see if we can find an equivalent deployment in CouchDB
        this.getPersistentDeployment(deployment, function (err, result) {
            // First look for an error
            if (err) {
                logger.error('Error caught trying to find persistent deployment matching');
                logger.error(deployment);
                if (callback)
                    callback(err);
            } else {
                // Create an empty JSON object to represent the deployment that will be persisted
                var deploymentToPersist = {};

                // Check to see if there is a matching deployment that was returned from CouchDB
                if (result) {
                    logger.debug('Found an existing deployment, will update it');
                    logger.debug(result);
                    deploymentToPersist = result;
                } else {
                    logger.debug('No matching deployment found, will insert a new Deployment');
                }

                // Make sure it's tagged as a Deployment resource
                deploymentToPersist['resource'] = 'Deployment';

                // Copy over the information from the incoming deployment
                deploymentUtils.mergeDeployments(deployment, deploymentToPersist);

                // TODO kgomes check if slack publishing on and if so, loop over events and send

                // Call the method to save the deployment to the datastore
                me.couchDBConn.save(deploymentToPersist, function (err, res) {

                    // Check for errors
                    if (err) {
                        // Log the error
                        logger.warn('Error trying to save deployment ' +
                            deployment['name'] + '(id=' + deployment['_id'] + ',rev=' +
                            deployment['_rev'] + ')');
                        logger.warn(err);

                        // Send error to the caller
                        if (callback)
                            callback(err);
                    } else {
                        // Assign the ID and rev
                        if (res.ok) {
                            logger.info('Deployment ' + deployment['name'] +
                                ' persisted successfully');
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
        });
    }

    this.sendSlackMessages = function (targetDeployment, messages) {
        // Check to see if messages should be posted to Slack
        if (targetDeployment['notifySlack'] &&
            targetDeployment['notifySlack'] == true &&
            targetDeployment['slackChannel'] &&
            targetDeployment['slackChannel'] != '') {
            logger.debug('Will publish any messages to slack on channel ' + targetDeployment['slackChannel']);
            // Make sure there is a messages object
            if (messages) {
                // Grab the sorted message timestamps
                var messageTimestamps = Object.keys(messages).sort();

                // Loop over the timestamps
                for (var i = 0; i < messageTimestamps.length; i++) {
                    // Grab the the message
                    var message = messages[messageTimestamps[i]];

                    // Make sure we have a message
                    if (message) {
                        // Check for end of deployment
                        if (message['event'] == 'DEPLOYMENT_END_DATE_CHANGED') {
                            // If there is no old end date, then send a message that parsing will stop
                            if (!message['old']) {
                                // Start the message
                                var text = 'Deployment "' + targetDeployment['name'] + '"';
                                // If there is an ESP attached, add the name to the message
                                if (targetDeployment['esp'] &&
                                    targetDeployment['esp']['name'])
                                    text += ' of ESP ' + targetDeployment['esp']['name'];

                                // Finish message
                                text += ' was marked as ended';

                                // Now try to parse the end date
                                var parsedEndDate = null;
                                try {
                                    parsedEndDate = moment(targetDeployment['endDate'], 'YYYY-MM-DDTHH:mm:ssZZZ');
                                } catch (err) {
                                    logger.warn('Could not parse end date of deployment ' + targetDeployment['name']);
                                    logger.warn(err);
                                }
                                if (parsedEndDate) {
                                    text += ' at ' + parsedEndDate.format('YYYY-MM-DD HH:mm:ss ZZ');
                                }
                                text += ', it will no longer be monitored in the portal.'

                                // Send out a message that the deployment was marked as complete
                                me.slackQueue.push({
                                    'text': text,
                                    channel: targetDeployment['slackChannel'],
                                    username: me.slackUsername
                                });

                            }
                        }

                        // Check for an error
                        if (message['event'] == 'ERROR_OCCURRED') {
                            // Create the message to send
                            let messageToSend = {
                                text: "_" + moment(Number(messageTimestamps[i])).format('YYYY-MM-DD HH:mm:ss ZZ') +
                                    "_\n*ERROR*: " + messages[messageTimestamps[i]]['new']['subject'],
                                channel: targetDeployment['slackChannel'],
                                username: me.slackUsername,
                                attachments: [
                                    {
                                        fallback: "ERROR Occurred",
                                        color: "danger",
                                        text: "Actor: " + messages[messageTimestamps[i]]['new']['actor'] + "\n" +
                                            "Message: " + messages[messageTimestamps[i]]['new']['message']
                                    }
                                ]
                            };
                            me.slackQueue.push(messageToSend);
                        }

                        // Check for ProtocolRun started
                        if (message['event'] == 'PROTOCOL_RUN_STARTED') {
                            // Create a message and put it in the queue to send
                            let messageToSend = {
                                text: "_" + moment(Number(messageTimestamps[i])).format('YYYY-MM-DD HH:mm:ss ZZ') +
                                    "_\n*Protocol Run Started*: " + messages[messageTimestamps[i]]['new']['name'],
                                channel: targetDeployment['slackChannel'],
                                username: me.slackUsername,
                                attachments: [
                                    {
                                        fallback: "Protocol Run Started",
                                        color: "good",
                                        text: "Actor: " + messages[messageTimestamps[i]]['new']['actor'] + "\n" +
                                            "Target Volume: " + messages[messageTimestamps[i]]['new']['targetVol']
                                    }
                                ]
                            };
                            // Add it to the slack queue
                            me.slackQueue.push(messageToSend);
                        }

                        // Now let's look for samples
                        if (message['event'] == 'SAMPLE_STARTED') {
                            let messageToSend = {
                                text: "_" +
                                    moment(Number(messageTimestamps[i])).format('YYYY-MM-DD HH:mm:ss ZZ') +
                                    '_\n*Sample Started*',
                                channel: targetDeployment['slackChannel'],
                                username: me.slackUsername,
                                attachments: [
                                    {
                                        fallback: '',
                                        color: 'good',
                                        text: 'Actor: ' + messages[messageTimestamps[i]]['new']['actor'] +
                                            '\nStart: ' + moment(Number(messageTimestamps[i])).format('YYYY-MM-DD HH:mm:ss ZZ') +
                                            '\nTarget Volume: ' + messages[messageTimestamps[i]]['new']['targetVolume']
                                    }
                                ]
                            }
                            // Add it to the slack queue
                            me.slackQueue.push(messageToSend);
                        }
                        if (message['event'] == 'SAMPLE_TAKEN' || message['event'] == 'SAMPLE_FINISHED') {
                            // Figure out the color to use
                            let messageColor = 'good';
                            if (messages[messageTimestamps[i]]['new']['volDiff'] &&
                                Number(messages[messageTimestamps[i]]['new']['volDiff']) > 0) {
                                messageColor = 'warning';
                            }
                            let textToSend = "_" + moment(Number(messageTimestamps[i])).format('YYYY-MM-DD HH:mm:ss ZZ') + '_';
                            if (message['event'] == 'SAMPLE_TAKEN') textToSend += '\n*Sample Taken*';
                            if (message['event'] == 'SAMPLE_FINISHED') textToSend += '\n*Sample Finished*';
                            let messageToSend = {
                                text: textToSend,
                                channel: targetDeployment['slackChannel'],
                                username: me.slackUsername,
                                attachments: [
                                    {
                                        fallback: '',
                                        color: messageColor,
                                        text: 'Actor: ' + messages[messageTimestamps[i]]['new']['actor'] +
                                            '\nStart: ' + moment(Number(messageTimestamps[i])).format('YYYY-MM-DD HH:mm:ss ZZ') +
                                            '\nEnd: ' + moment(Number(messages[messageTimestamps[i]]['new']['endts'])).format('YYYY-MM-DD HH:mm:ss ZZ') +
                                            '\nTook: ' + messages[messageTimestamps[i]]['new']['durationInMinutes'] + ' minutes' +
                                            '\nTarget Volume: ' + messages[messageTimestamps[i]]['new']['targetVolume'] +
                                            '\nActual Volume: ' + messages[messageTimestamps[i]]['new']['actualVolume'] +
                                            '\nVol Diff: ' + + messages[messageTimestamps[i]]['new']['volDiff'] + ' ml'
                                    }
                                ]
                            }
                            // Add it to the slack queue
                            me.slackQueue.push(messageToSend);
                        }

                        // Now for images
                        if (message['event'] == 'IMAGE_TAKEN') {

                            // We need to build the attachment first
                            var textToSend = "_" +
                                moment(Number(messageTimestamps[i])).format('YYYY-MM-DD HH:mm:ss ZZ') +
                                "_\n*Image Taken*: " + message['new']['imageFilename'] +
                                " (" + message['new']['exposure'] + "s - " + message['new']['xPixels'] + "px X " +
                                message['new']['yPixels'] + "px)";
                            if (targetDeployment['images'][messageTimestamps[i]]['downloaded']) {
                                logger.debug('URL to encode: ' + targetDeployment['images'][messageTimestamps[i]]['imageUrl']);
                                logger.debug('Encoded: ' + encodeURI(targetDeployment['images'][messageTimestamps[i]]['imageUrl']));

                                textToSend += "\n<" + encodeURI(targetDeployment['images'][messageTimestamps[i]]['imageUrl']) + ">"
                            }

                            // Create the message to send
                            var messageToSend = {
                                text: textToSend,
                                channel: targetDeployment['slackChannel'],
                                username: me.slackUsername
                            };

                            // Add it to the slack queue
                            me.slackQueue.push(messageToSend);

                        }
                    }
                }
            }
        }

    }

    /**
     * This method takes in a JSON object which should contain a deployment object.  It will use the ID
     * from the incoming JSON object to look up the existing deployment in the data store, it will then
     * look through both objects and update the persistent one with any information coming in on the
     * submitted object.  This is an additive process, nothing is removed from the persisten object.
     *
     * @param sourceDeployment
     * @param callback
     */
    this.updateDeployment = function (sourceDeployment, callback) {
        // First make sure we have an deployment ID on the incoming object
        if (sourceDeployment && (sourceDeployment['id'] || sourceDeployment['_id'])) {
            var idToSearchFor = sourceDeployment['id'] || sourceDeployment['_id'];
            logger.debug('updateDeployment called for deployment ' +
                sourceDeployment['name'] + ' of ESP ' + sourceDeployment['esp']['name']);
            logger.debug('Searching for deployment with ID ' + idToSearchFor + ' to update');
            // Next try to find a deployment with the given ID
            this.couchDBConn.get(idToSearchFor, function (err, targetDeployment) {
                // If an error occurred, send it back
                if (err) {
                    logger.error("Error caught trying to find deployment with ID: " + idToSearchFor);
                    if (callback)
                        callback(err);
                } else {
                    // Make sure there is a deployment
                    if (targetDeployment) {

                        // Merge the incoming deployment with the one in the database
                        var messages = deploymentUtils.mergeDeployments(sourceDeployment, targetDeployment);

                        // Loop over any images and make sure to fill out URLs if they are available to serve
                        if (targetDeployment['images'] &&
                            Object.keys(targetDeployment['images']).length > 0) {

                            // Grab all the timestamps for images
                            var imageTimestamps = Object.keys(targetDeployment['images']);
                            logger.debug('There are ' + imageTimestamps.length + ' images on deployment ' + targetDeployment['name']);
                            logger.debug('Will now check each one to see if they are available locally and will add the URL to the image');

                            // Create path to deployment data
                            var deploymentDataDir = path.join(me.dataDir, 'instances', targetDeployment['esp']['name'],
                                'deployments', targetDeployment['name'], 'data', 'raw', 'esp');
                            logger.debug('Will look for local images in directory ' + deploymentDataDir);

                            // Now loop over the timestamps
                            for (var i = 0; i < imageTimestamps.length; i++) {

                                // Make sure we have an image at that timestamp and it has a property named 'relativePath'
                                if (targetDeployment['images'][imageTimestamps[i]] &&
                                    targetDeployment['images'][imageTimestamps[i]]['relativePath']) {
                                    logger.debug('Working with image ' + targetDeployment['images'][imageTimestamps[i]]['relativePath']);

                                    // Start a local path to where the image should be
                                    var localImagePath = deploymentDataDir;

                                    // Split the relative path by the remote directory separator
                                    var remoteRelativeImagePathArray =
                                        targetDeployment['images'][imageTimestamps[i]]['relativePath'].split('/');

                                    // Using the relative path, generate a full path to where that image should be locally
                                    for (var j = 0; j < remoteRelativeImagePathArray.length; j++) {
                                        localImagePath = path.join(localImagePath, remoteRelativeImagePathArray[j]);
                                    }
                                    logger.debug('Image should be located locally at ' + localImagePath);

                                    // And create a path to where the JPG version should be
                                    var localJPGPath = localImagePath.replace('/raw/', '/processed/').replace('.tif', '.jpg');
                                    logger.debug('JPG version should be located at ' + localJPGPath);

                                    // Check to see if the file does exist locally and set the downloaded flag
                                    if (fs.existsSync(localImagePath)) {
                                        logger.debug('TIF image exists locally');
                                        targetDeployment['images'][imageTimestamps[i]]['downloaded'] = true;
                                        targetDeployment['images'][imageTimestamps[i]]['tiffUrl'] = me.dataDirectoryBaseUrl +
                                            localImagePath.substring(me.dataDir.length);

                                        // Check for matching JPG
                                        if (fs.existsSync(localJPGPath)) {
                                            logger.debug('JPG image exists locally');
                                            targetDeployment['images'][imageTimestamps[i]]['imageUrl'] = me.dataDirectoryBaseUrl +
                                                localJPGPath.substring(me.dataDir.length);
                                        }
                                    } else {
                                        logger.debug('TIF image does not exist locally');
                                        targetDeployment['images'][imageTimestamps[i]]['downloaded'] = false;
                                    }
                                }
                            }
                        }

                        // Now try to save the deployment
                        me.couchDBConn.save(targetDeployment, function (err, res) {
                            // First check for error
                            if (err) {
                                // Make sure the error is a conflict error before recursing
                                if (err.error === 'conflict') {
                                    logger.warn("Conflict trapped trying to update deployment", err);
                                } else {
                                    logger.error("Error caught trying to save deployment " + targetDeployment['name']);
                                    // Since the error is not a conflict error, bail out
                                    if (callback)
                                        callback(err);
                                }
                            } else {
                                // Send out any slack messages
                                logger.debug('Save of deployment ' + targetDeployment['name'] +
                                    ' successful, will now send ' + messages.length + ' slack messages');
                                // update the rev number
                                targetDeployment['_rev'] = res['rev'];
                                me.sendSlackMessages(targetDeployment, messages);

                                // If there are ancillary data points available, convert them to an array and batch
                                // insert them
                                logger.debug('Will now attempt to process ancillary data points');
                                if (sourceDeployment['ancillaryDataPoints']) {
                                    logger.debug('There are ancillary data points');
                                    // Create an array to populate
                                    var ancillaryDataPointsArray = [];

                                    // Grab the sources
                                    var sources = Object.keys(sourceDeployment['ancillaryDataPoints']);
                                    if (sources) {
                                        // Loop over the sources
                                        for (var i = 0; i < sources.length; i++) {
                                            var source = sources[i];
                                            logger.debug('Filling ancillary data array from source ' + source);
                                            // Now grab the timestamps for the source
                                            var sourceTimestamps = Object.keys(sourceDeployment['ancillaryDataPoints'][source]);
                                            if (sourceTimestamps) {
                                                // Loop over the timestamps
                                                for (var j = 0; j < sourceTimestamps.length; j++) {

                                                    // Grab the keys, which are the units that were parsed
                                                    var dataObjectKeys =
                                                        Object.keys(sourceDeployment['ancillaryDataPoints'][source][sourceTimestamps[j]]);

                                                    // Now loop over the keys
                                                    for (var k = 0; k < dataObjectKeys.length; k++) {
                                                        // Grab the key
                                                        var dataObjectKey = dataObjectKeys[k];

                                                        // Now grab the lookup from the target deployment to get the other information
                                                        var dataObjectLookup = targetDeployment['ancillaryData'][source][dataObjectKey];

                                                        // Now put the data in the array to batch insert
                                                        ancillaryDataPointsArray.push(
                                                            [source,
                                                                dataObjectLookup['varName'],
                                                                dataObjectLookup['varLongName'],
                                                                dataObjectLookup['units'],
                                                                dataObjectKey,
                                                                moment(Number(sourceTimestamps[j])).format('YYYY-MM-DD HH:mm:ssZ'),
                                                                Number(sourceDeployment['ancillaryDataPoints'][source][sourceTimestamps[j]][dataObjectKey])
                                                            ]
                                                        )
                                                    }
                                                }
                                            }
                                        }
                                    }

                                    // I should have all the ancillary data in the form of an array, batch insert it!
                                    me.batchInsertAncillaryData(targetDeployment['_id'], targetDeployment['esp']['name'],
                                        ancillaryDataPointsArray, function (err, numDataPointsInserted) {
                                            if (err) {
                                                logger.error('Error trying to batch insert ancillary data');
                                                logger.error(err)
                                            } else {
                                                logger.debug('Batch insert complete, inserted ' + numDataPointsInserted + ' data points');

                                                // Now call method to remove duplicates
                                                me.cleanOutDuplicateAncillaryData(function (err, result) {
                                                    if (err) {
                                                        logger.error('Error caught trying to clean out duplicates');
                                                        logger.error(err);
                                                    }

                                                    // Call method to sync ancillary data lookup with data stats
                                                    me.setDeploymentAncillaryStatsFromDatabase(targetDeployment, function (err, res) {
                                                        if (err) {
                                                            logger.error('Error trying to update ancillary stats from databse');
                                                            logger.error(err)
                                                        }

                                                        // Now update the deployment to persist those stats
                                                        me.couchDBConn.save(targetDeployment, function (err, res) {
                                                            if (err) {
                                                                logger.error('Error trying to save deployment after ancillary status update');
                                                                logger.error(err);
                                                            } else {
                                                                logger.debug('Save successful after syncing ancillary stats');
                                
                                                                // And lastly, sync the ancillary data file with data from the database
                                                                me.syncAncillaryDataFileWithDatabase(targetDeployment, me.dataDir, function(err){
                                                                    if (err){
                                                                        logger.error('Error trying to sync ancillary data to file');
                                                                        logger.error(err);
                                                                    }
                                                                });
                                                            }
                                                        });
                                                    })
                                                });
                                            }
                                        });
                                } else {
                                    // No ancillary data was attached
                                }

                                // Now return to caller by sending callback without waiting for the ancillary stuff to happen
                                if (callback)
                                    callback(null);
                            }
                        });
                    } else {
                        logger.error("No deployment found matching ID " + idToSearchFor);
                        if (callback)
                            callback(new Error("No deployment matching ID " + idToSearchFor + " found."));
                    }
                }
            });
        } else {
            // Send an error to the callback
            if (callback)
                callback(new Error("No deployment ID was specified."));
        }
    }

    /**
     * This method takes in a bunch of parameters and updates the deployment with the given information. If the parameter
     * that is given is null, this function won't do anything with it.
     *
     * @param deploymentID
     * @param name
     * @param description
     * @param startDate
     * @param endDate
     * @param esp
     * @param errors
     * @param samples
     * @param protocolRuns
     * @param images
     * @param pcrs
     * @param callback
     */
    // this.updateDeployment = function (deploymentID, name, description, startDate, endDate, esp, ancillaryData, errors, samples, protocolRuns, images, pcrDataArray, lastLineParsedFromLogFile, callback) {
    //     // First make sure we have an deployment ID
    //     if (deploymentID) {
    //         // Next try to find a deployment with the given ID
    //         this.couchDBConn.get(deploymentID, function (err, deployment) {
    //             // If an error occurred, send it back
    //             if (err) {
    //                 logger.error("Error caught trying to find deployment with ID: " + deploymentID);
    //                 if (callback)
    //                     callback(err);
    //             } else {
    //                 // Make sure there is a deployment
    //                 if (deployment) {
    //                     // Now examine each of the parameters coming in and if they are specified, update the
    //                     // properties on the deployment

    //                     // TODO kgomes, I should make sure to only update the document if something has changed.

    //                     // The name of the deployment
    //                     if (name) deployment.name = name;

    //                     // The description of the deployment
    //                     if (description) deployment.description = description;

    //                     // The start date
    //                     if (startDate) deployment.startDate = startDate;

    //                     // The end date
    //                     if (endDate) deployment.endDate = endDate;

    //                     // The esp information
    //                     if (esp) {
    //                         // Make sure the deployment has an ESP object
    //                         if (!deployment.esp) deployment.esp = {};

    //                         // Now check the properties of the esp
    //                         if (esp.name) deployment.esp.name = esp.name;
    //                         if (esp.ftpHost) deployment.esp.ftpHost = esp.ftpHost;
    //                         if (esp.ftpPort) deployment.esp.ftpPort = esp.ftpPort;
    //                         if (esp.ftpUsername) deployment.esp.ftpUsername = esp.ftpUsername;
    //                         if (esp.ftpPassword) deployment.esp.ftpPassword = esp.ftpPassword;
    //                         if (esp.ftpWorkingDir) deployment.esp.ftpWorkingDir = esp.ftpWorkingDir;
    //                         if (esp.logFile) deployment.esp.logFile = esp.logFile;
    //                         if (esp.mode) deployment.esp.mode = esp.mode;
    //                         if (esp.path) deployment.esp.path = esp.path;
    //                         if (esp.serialNumber) deployment.esp.serialNumber = esp.serialNumber;
    //                     }

    //                     // If ancillary data stats
    //                     if (ancillaryData)
    //                         deployment.ancillaryData = ancillaryData;

    //                     // Now any errors
    //                     if (errors) {
    //                         if (!deployment.errors)
    //                             deployment.errors = {};

    //                         for (var timestamp in errors) {
    //                             deployment.errors[timestamp] = errors[timestamp];
    //                         }
    //                     }

    //                     // Now samples
    //                     if (samples) {
    //                         if (!deployment.samples)
    //                             deployment.samples = {};

    //                         for (var timestamp in samples) {
    //                             deployment.samples[timestamp] = samples[timestamp];
    //                         }
    //                     }

    //                     // Now protocolRuns
    //                     if (protocolRuns) {
    //                         if (!deployment.protocolRuns)
    //                             deployment.protocolRuns = {};

    //                         for (var timestamp in protocolRuns) {
    //                             deployment.protocolRuns[timestamp] = protocolRuns[timestamp];
    //                         }
    //                     }

    //                     // Now images
    //                     if (images) {
    //                         if (!deployment.images)
    //                             deployment.images = {};

    //                         for (var timestamp in images) {
    //                             deployment.images[timestamp] = images[timestamp];
    //                         }
    //                     }

    //                     // Now pcrs
    //                     if (pcrDataArray) {
    //                         for (var i = 0; i < pcrDataArray.length; i++) {
    //                             // Grab the data
    //                             var pcrData = pcrDataArray[i];

    //                             // It will be an object that has pcr types as keys, so we need to
    //                             // loop over the pcrTypes first
    //                             for (var pcrType in pcrData) {
    //                                 // Now next item will be the PCR run name
    //                                 for (var pcrRunName in pcrData[pcrType]) {
    //                                     // Now the item will be the timestamp of the file that was processed
    //                                     for (var timestamp in pcrData[pcrType][pcrRunName]) {
    //                                         // Add (or replace the entry on the deployment with this information
    //                                         if (!deployment.pcrs)
    //                                             deployment.pcrs = {};
    //                                         if (!deployment.pcrs[pcrType])
    //                                             deployment.pcrs[pcrType] = {};
    //                                         if (!deployment.pcrs[pcrType][pcrRunName])
    //                                             deployment.pcrs[pcrType][pcrRunName] = {};
    //                                         if (!deployment.pcrs[pcrType][pcrRunName][timestamp])
    //                                             deployment.pcrs[pcrType][pcrRunName][timestamp] =
    //                                                 pcrData[pcrType][pcrRunName][timestamp];
    //                                     }
    //                                 }
    //                             }
    //                         }

    //                     }

    //                     // Now last line parsed in log file
    //                     if (lastLineParsedFromLogFile) deployment.lastLineParsedFromLogFile = lastLineParsedFromLogFile;

    //                     // Now try to save the deployment
    //                     me.couchDBConn.save(deployment, function (err, res) {
    //                         // First check for error
    //                         if (err) {
    //                             // Make sure the error is a conflict error before recursing
    //                             if (err.error === 'conflict') {
    //                                 logger.warn("Conflict trapped trying to save deployment with updates " +
    //                                     "added, will try again", err);
    //                                 me.updateDeployment(deploymentID, name, description, startDate, endDate, esp,
    //                                     errors, samples, protocolRuns, images, pcrDataArray, lastLineParsedFromLogFile, callback);
    //                             } else {
    //                                 logger.error("Error caught trying to save deployment " + deployment.name);
    //                                 // Since the error is not a conflict error, bail out
    //                                 if (callback)
    //                                     callback(err);
    //                             }
    //                         } else {
    //                             // Send null back to the caller.
    //                             if (callback)
    //                                 callback(null);
    //                         }
    //                     });

    //                 } else {
    //                     logger.error("No deployment found matching ID " + deploymentID);
    //                     if (callback)
    //                         callback(new Error("No deployment matching ID " + deploymentID + " found."));
    //                 }
    //             }
    //         });
    //     } else {
    //         // Send an error to the callback
    //         if (callback)
    //             callback(new Error("No deployment ID was specified."));
    //     }
    // }

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

    /**
     * This function takes in a deployment ID and an object that contains property keys which are epoch
     * milliseconds when an error occurred and an Error object as the property.  These errors are then added
     * (or updated) on the deployment with the matching ID.
     * @param deploymentID
     * @param errors
     * @param callback
     */
    this.addOrUpdateErrors = function (deploymentID, errors, callback) {
        // First verify the deployment ID and some errors were specified
        if (deploymentID && errors) {
            logger.debug("Going to update deployment with ID " + deploymentID + " and add/update these errors:", errors);
            // We have the deployment ID, so let's find the deployment in the couch database
            this.couchDBConn.get(deploymentID, function (err, deployment) {
                // First look to see if we got an error
                if (err) {
                    logger.error("Error trying to get a deployment with ID " + deploymentID + ":", err);
                    // Send it back to the caller
                    if (callback)
                        callback(err);
                } else {
                    // No error, but let's see if a matching deployment was found
                    if (deployment) {
                        // So far, so good, we have the right deployment.  Let's loop over all the timestamps in
                        // the errors object and add them to the deployment (first checking to make sure there
                        // is an error object on the deployment)
                        if (!deployment.errors)
                            deployment.errors = {};

                        for (var timestamp in errors) {
                            deployment.errors[timestamp] = errors[timestamp];
                        }
                        logger.debug("Errors updated on deployment, deployment.errors = ", deployment.errors);

                        // Now update that in the couch database
                        me.couchDBConn.save(deployment, function (err, res) {
                            // First check for error
                            if (err) {
                                // Make sure the error is a conflict error before recursing
                                if (err.error === 'conflict') {
                                    logger.warn("Conflict trapped trying to save deployment with new errors " +
                                        "added, will try again", err);
                                    me.addOrUpdateErrors(deploymentID, errors, callback);
                                } else {
                                    logger.error("Error caught trying to save deployment " + deployment.name);
                                    // Since the error is not a conflict error, bail out
                                    if (callback)
                                        callback(err);
                                }
                            } else {
                                // Send null back to the caller.
                                if (callback)
                                    callback(null);
                            }
                        });
                    } else {
                        // Send an error back since no deployment was found
                        if (callback)
                            callback(new Error("No deployment with ID " + deploymentID + " was found"));
                    }
                }
            });
        } else {
            // Send back an error
            if (callback)
                callback(new Error("Not enough parameters were supplied, should be (deploymentID, errors, callback)"));
        }
    }


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

    /**
     * This function takes in a deployment ID and an object that contains property keys which are epoch
     * milliseconds when a Image was taken and a Image object as the property.  These Images are then added
     * (or updated) on the deployment with the matching ID.
     * @param deploymentID
     * @param images
     * @param callback
     */
    this.addOrUpdateImages = function (deploymentID, images, callback) {
        // First verify the deployment ID and some images were specified
        if (deploymentID && images) {
            logger.debug("Going to update deployment with ID " + deploymentID + " and add/update these images:", images);
            // We have the deployment ID, so let's find the deployment in the couch database
            this.couchDBConn.get(deploymentID, function (err, deployment) {
                // First look to see if we got an error
                if (err) {
                    logger.error("Error trying to get a deployment with ID " + deploymentID + ":", err);
                    // Send it back to the caller
                    if (callback)
                        callback(err);
                } else {
                    // No error, but let's see if a matching deployment was found
                    if (deployment) {
                        // So far, so good, we have the right deployment.  Let's loop over all the timestamps in
                        // the images object and add them to the deployment (first checking to make sure there
                        // is an images object on the deployment)
                        if (!deployment.images)
                            deployment.images = {};

                        for (var timestamp in images) {
                            deployment.images[timestamp] = images[timestamp];
                        }
                        logger.debug("Images updated on deployment, deployment.images = ", deployment.images);

                        // Now update that in the couch database
                        me.couchDBConn.save(deployment, function (err, res) {
                            // First check for error
                            if (err) {
                                // Make sure the error is a conflict error before recursing
                                if (err.error === 'conflict') {
                                    logger.warn("Conflict trapped trying to save deployment with new images " +
                                        "added, will try again", err);
                                    me.addOrUpdateImages(deploymentID, images, callback);
                                } else {
                                    logger.error("Error caught trying to save deployment " + deployment.name);
                                    // Since the error is not a conflict error, bail out
                                    if (callback)
                                        callback(err);
                                }
                            } else {
                                // Send null back to the caller.
                                if (callback)
                                    callback(null);
                            }
                        });
                    } else {
                        // Send an error back since no deployment was found
                        if (callback)
                            callback(new Error("No deployment with ID " + deploymentID + " was found"));
                    }
                }
            });
        } else {
            // Send back an error
            if (callback)
                callback(new Error("Not enough parameters were supplied, should be (deploymentID, images, callback)"));
        }
    }


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
     * This function takes in a deployment ID and an object that contains property keys which are epoch
     * milliseconds when a ProtolRun was started and a ProtocolRun object as the property.  These ProtocolRuns are
     * then added (or updated) on the deployment with the matching ID.
     * @param deploymentID
     * @param protocolRuns
     * @param callback
     */
    this.addOrUpdateProtocolRuns = function (deploymentID, protocolRuns, callback) {
        // First verify the deployment ID and some protocolRuns were specified
        if (deploymentID && protocolRuns) {
            logger.debug("Going to update deployment with ID " + deploymentID +
                " and add/update these protocolRuns:", protocolRuns);
            // We have the deployment ID, so let's find the deployment in the couch database
            this.couchDBConn.get(deploymentID, function (err, deployment) {
                // First look to see if we got an error
                if (err) {
                    logger.error("Error trying to get a deployment with ID " + deploymentID + ":", err);
                    // Send it back to the caller
                    if (callback)
                        callback(err);
                } else {
                    // No error, but let's see if a matching deployment was found
                    if (deployment) {
                        // So far, so good, we have the right deployment.  Let's loop over all the timestamps in
                        // the protocolRuns object and add them to the deployment (first checking to make sure there
                        // is an protocolRuns object on the deployment)
                        if (!deployment.protocolRuns)
                            deployment.protocolRuns = {};

                        for (var timestamp in protocolRuns) {
                            deployment.protocolRuns[timestamp] = protocolRuns[timestamp];
                        }
                        logger.debug("ProtocolRuns updated on deployment, deployment.protocolRuns = ", deployment.protocolRuns);

                        // Now update that in the couch database
                        me.couchDBConn.save(deployment, function (err, res) {
                            // First check for error
                            if (err) {
                                // Make sure the error is a conflict error before recursing
                                if (err.error === 'conflict') {
                                    logger.warn("Conflict trapped trying to save deployment with new protocolRuns " +
                                        "added, will try again", err);
                                    me.addOrUpdateProtocolRuns(deploymentID, protocolRuns, callback);
                                } else {
                                    logger.error("Error caught trying to save deployment " + deployment.name);
                                    // Since the error is not a conflict error, bail out
                                    if (callback)
                                        callback(err);
                                }
                            } else {
                                // Send null back to the caller.
                                if (callback)
                                    callback(null);
                            }
                        });
                    } else {
                        // Send an error back since no deployment was found
                        if (callback)
                            callback(new Error("No deployment with ID " + deploymentID + " was found"));
                    }
                }
            });
        } else {
            // Send back an error
            if (callback)
                callback(new Error("Not enough parameters were supplied, " +
                    "should be (deploymentID, protocolRuns, callback)"));
        }
    }


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
     * This function takes in a deployment ID and an object that contains property keys which are epoch
     * milliseconds when a sample occurred and a Sample object as the property.  These Samples are then added
     * (or updated) on the deployment with the matching ID.
     * @param deploymentID
     * @param samples
     * @param callback
     */
    this.addOrUpdateSamples = function (deploymentID, samples, callback) {
        // First verify the deployment ID and some samples were specified
        if (deploymentID && samples) {
            logger.debug("Going to update deployment with ID " + deploymentID + " and add/update these samples:", samples);
            // We have the deployment ID, so let's find the deployment in the couch database
            this.couchDBConn.get(deploymentID, function (err, deployment) {
                // First look to see if we got an error
                if (err) {
                    logger.error("Error trying to get a deployment with ID " + deploymentID + ":", err);
                    // Send it back to the caller
                    if (callback)
                        callback(err);
                } else {
                    // No error, but let's see if a matching deployment was found
                    if (deployment) {
                        // So far, so good, we have the right deployment.  Let's loop over all the timestamps in
                        // the samples object and add them to the deployment (first checking to make sure there
                        // is a sample object on the deployment)
                        if (!deployment.samples)
                            deployment.samples = {};

                        for (var timestamp in samples) {
                            deployment.samples[timestamp] = samples[timestamp];
                        }
                        logger.debug("Samples updated on deployment, deployment.samples = ", deployment.samples);

                        // Now update that in the couch database
                        me.couchDBConn.save(deployment, function (err, res) {
                            // First check for error
                            if (err) {
                                // Make sure the error is a conflict error before recursing
                                if (err.error === 'conflict') {
                                    logger.warn("Conflict trapped trying to save deployment with new samples " +
                                        "added, will try again", err);
                                    me.addOrUpdateSamples(deploymentID, samples, callback);
                                } else {
                                    logger.error("Error caught trying to save deployment " + deployment.name);
                                    // Since the error is not a conflict error, bail out
                                    if (callback)
                                        callback(err);
                                }
                            } else {

                                // Send null back to the caller.
                                if (callback)
                                    callback(err);
                            }
                        });
                    } else {
                        // Send an error back since no deployment was found
                        if (callback)
                            callback(new Error("No deployment with ID " + deploymentID + " was found"));
                    }
                }
            });
        } else {
            // Send back an error
            if (callback)
                callback(new Error("Not enough parameters were supplied, should be (deploymentID, samples, callback)"));
        }
    }


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
     * This is a method that takes in an array of PCRData entries and attaches them to a deployment that
     * matches the given ID.
     * @param deploymentID
     * @param pcrDataArray
     * @param callback
     */
    this.addPCRData = function (deploymentID, pcrDataArray, callback) {
        // Make sure all the parameters are valid
        if (deploymentID && pcrDataArray) {
            // OK, so we have the information we need, let's grab the deployment specified
            this.couchDBConn.get(deploymentID, function (err, deployment) {
                // If an error occurred, send it back
                if (err) {
                    logger.error("Error looking for deployment with ID " + deploymentID);
                    if (callback)
                        callback(err);
                } else {
                    // Make sure we got something back
                    if (deployment) {
                        // OK, we now have the deployment and the PCR data to be added.  The PCR data is in an array,
                        // so we need to iterate over the array to get at the individual entries.
                        for (var i = 0; i < pcrDataArray.length; i++) {
                            // Grab the data
                            var pcrData = pcrDataArray[i];

                            // It will be an object that has pcr types as keys, so we need to
                            // loop over the pcrTypes first
                            for (var pcrType in pcrData) {
                                // Now next item will be the PCR run name
                                for (var pcrRunName in pcrData[pcrType]) {
                                    // Now the item will be the timestamp of the file that was processed
                                    for (var timestamp in pcrData[pcrType][pcrRunName]) {
                                        // Add (or replace the entry on the deployment with this information
                                        if (!deployment.pcrs)
                                            deployment.pcrs = {};
                                        if (!deployment.pcrs[pcrType])
                                            deployment.pcrs[pcrType] = {};
                                        if (!deployment.pcrs[pcrType][pcrRunName])
                                            deployment.pcrs[pcrType][pcrRunName] = {};
                                        if (!deployment.pcrs[pcrType][pcrRunName][timestamp])
                                            deployment.pcrs[pcrType][pcrRunName][timestamp] =
                                                pcrData[pcrType][pcrRunName][timestamp];
                                    }
                                }
                            }
                        }
                        // Now we need to save the deployment
                        me.couchDBConn.save(deployment, function (err, res) {
                            // If error, check for document conflict
                            if (err) {
                                // Make sure the error is a conflict error before recursing
                                if (err.error === 'conflict') {
                                    logger.warn("Conflict trapped trying to add PCR data, " +
                                        "will try again", err);
                                    me.addPCRData(deploymentID, pcrDataArray, callback);
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
                    "(deploymentID, pcrDataArray, callback"));
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

        // If there are dates specified, try and parse them
        var startDate = null;
        var endDate = null;
        if (startTimestampUtc) {
            try {
                startDate = moment(startTimestampUtc);
            } catch (error) {
                logger.error('Error caught in query:');
                logger.error(error);
            }
        }
        if (endTimestampUtc) {
            try {
                endDate = moment(endTimestampUtc);
            } catch (error) {
                logger.error('Error caught in query:');
                logger.error(error);
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

        // Run the query against the connection pool
        me.pgPool.query(queryString, function (err, result) {
            // Check for error first
            if (err) {
                logger.error('Error running query');
                logger.error(err);
                if (callback)
                    callback(err);
            } else {
                logger.debug('Query came back with ' + result.rows.length + ' points');

                // Create the array to hold the reponse values
                var response = [];

                // Process rows
                if (result && result.rows && result.rows.length > 0) {
                    for (var i = 0; i < result.rows.length; i++) {
                        response.push([Date.parse(result.rows[i].timestamp_utc), parseFloat(result.rows[i].value)]);
                    }
                }

                // Call the callback to return the response
                if (callback)
                    callback(null, response);
            }
        });
    };

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
        // First thing to do is make sure we have a deployment ID and a ancillary data record
        if (deploymentID && espName) {
            // Now check other parameters
            if (!sourceName || !varName || !varLongName || !logUnits) {
                logger.error('Call did not have sufficient parameters:\nsourceName = ' + sourceName +
                    '\nvarName = ' + varName + '\nvarLongName = ' + varLongName +
                    '\nlogUnits = ' + logUnits);
                if (callback)
                    callback(new Error('Call did not have sufficient parameters:\nsourceName = ' + sourceName +
                        '\nvarName = ' + varName + '\nvarLongName = ' + varLongName +
                        '\nlogUnits = ' + logUnits));
            } else {
                logger.trace("Will look for a source ID for:\ndeploymentID = " + deploymentID + "\nespName = " +
                    espName + "\nsourceName = " + sourceName + "\nlogUnits = " + logUnits);

                // The first thing to do is try to look up the sourceID in the local cache
                me.getAncillaryDataSourceIDFromCache(deploymentID, espName, sourceName, logUnits, function (err, sourceID) {

                    // If there is an error send it back
                    if (err) {
                        if (callback)
                            callback(err);
                    } else {
                        // OK, check if there was there a sourceID in the cache
                        if (sourceID) {
                            logger.trace("Found ID " + sourceID + " in the local cache");
                            // Send it to the callback
                            if (callback)
                                callback(null, sourceID);
                        } else {
                            // So there was nothing in the local cache, we need to look it up from the DB, but
                            // I need to first see if another request has already been queued for this same
                            // information

                            // A boolean to track if the request exists already
                            var requestExists = false;

                            // Check the local queue
                            if (me.ancillaryDataSourceIDLookupCallbackQueue[deploymentID] &&
                                me.ancillaryDataSourceIDLookupCallbackQueue[deploymentID][espName] &&
                                me.ancillaryDataSourceIDLookupCallbackQueue[deploymentID][espName][sourceName] &&
                                me.ancillaryDataSourceIDLookupCallbackQueue[deploymentID][espName][sourceName][logUnits] &&
                                me.ancillaryDataSourceIDLookupCallbackQueue[deploymentID][espName][sourceName][logUnits].length > 0) {
                                // Set the flag to true
                                requestExists = true;
                            }

                            // OK, we checked and have our answer, the next thing to do is put the incoming callback
                            // into the queue for processing (while making sure the object tree exists)
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

                                // Build the query string
                                const queryString = 'SELECT id from ancillary_sources where ' +
                                    'deployment_id_fk = $1 and esp_name = $2 and instrument_type = $3 ' +
                                    'and log_units = $4';

                                // Build the values to insert into the query
                                const queryValues = [deploymentID, espName, sourceName, logUnits];

                                // Run the query against the connection pool
                                me.pgPool.query(queryString, queryValues, function (err, result) {
                                    // Check for an error
                                    if (err) {
                                        // Log the error
                                        logger.error('Error connecting to Postgres in getAncillaryDataSourceID');
                                        logger.error(err);

                                        // Send the error to callback
                                        if (callback)
                                            callback(err);
                                    } else {
                                        // The query for the ancillary source executed OK, we now need to check to
                                        // see if the ancillary source query returned anything
                                        if (result && result.rows && result.rows.length > 0) {
                                            // It appears a sourceID already exists, so stuff it in the local cache
                                            me.putAncillaryDataSourceIDInCache(deploymentID, espName, sourceName,
                                                logUnits, result.rows[0].id, function (err) {
                                                    logger.error("Error while pushing source ID " +
                                                        result.rows[0].id + " into the local cache");
                                                });

                                            // Loop over the callback cache and return the results
                                            for (var i = 0;
                                                i < me.ancillaryDataSourceIDLookupCallbackQueue[deploymentID][espName][sourceName][logUnits].length; i++) {
                                                // Return the ID to the caller
                                                if (me.ancillaryDataSourceIDLookupCallbackQueue[deploymentID][espName][sourceName][logUnits][i])
                                                    me.ancillaryDataSourceIDLookupCallbackQueue[deploymentID][espName][sourceName][logUnits][i](
                                                        null, result.rows[0].id, deploymentID, espName,
                                                            sourceName, varName, varLongName, varUnits,
                                                            logUnits, timestamp, data);
                                            }

                                            // Now clear the cached callbacks
                                            me.ancillaryDataSourceIDLookupCallbackQueue[deploymentID][espName][sourceName][logUnits] = [];
                                        } else {
                                            // Nothing is in the database yet, we need to insert one

                                            // Build the query string
                                            const queryString = 'INSERT INTO ancillary_sources(' +
                                                'deployment_id_fk, esp_name, instrument_type, ' +
                                                'var_name, var_long_name, log_units, units) values ' +
                                                '($1,$2,$3,$4,$5,$6,$7) RETURNING id';

                                            // And the query values array
                                            const queryValues = [deploymentID, espName, sourceName, varName,
                                                varLongName, logUnits, varUnits];

                                            // Run the query against the connection pool
                                            me.pgPool.query(queryString, queryValues, function (err, result) {
                                                // Check for errors
                                                if (err) {
                                                    // Log the error
                                                    logger.warn('Error trying to insert a new ancillary data source');
                                                    logger.warn(err);

                                                    // Send the error it back to the caller
                                                    if (callback)
                                                        callback(err);
                                                } else {
                                                    // It appears a sourceID already exists stuff it in the local cache
                                                    me.putAncillaryDataSourceIDInCache(deploymentID, espName,
                                                        sourceName, logUnits, result.rows[0].id,
                                                        function (err) {
                                                            logger.error("Error while pushing source ID " +
                                                                result.rows[0].id + " into the cache");
                                                            logger.error(err);
                                                        });

                                                    // Loop over the callback cache and return the results
                                                    for (var i = 0;
                                                        i < me.ancillaryDataSourceIDLookupCallbackQueue[deploymentID][espName][sourceName][logUnits].length; i++) {
                                                        // Return the ID to the caller
                                                        if (me.ancillaryDataSourceIDLookupCallbackQueue[deploymentID][espName][sourceName][logUnits][i])
                                                            me.ancillaryDataSourceIDLookupCallbackQueue[deploymentID][espName][sourceName][logUnits][i](
                                                                null, result.rows[0].id, deploymentID, espName,
                                                                    sourceName, varName, varLongName, varUnits,
                                                                    logUnits, timestamp, data);
                                                    }

                                                    // Now clear the cached callbacks
                                                    me.ancillaryDataSourceIDLookupCallbackQueue[deploymentID][espName][sourceName][logUnits] = [];
                                                }
                                            });
                                        }
                                    }
                                });
                            }
                        }
                    }
                }
                );
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
                logger.trace("Create new ancillary array for deployment with ID " + deploymentID);
            }

            // Now push the record on the array
            me.ancillaryDataRecordsToBeInserted[deploymentID].push(ancillaryDataRecord);

            // Now check the length of the array and if long enough, slice off the data an process
            if (me.ancillaryDataRecordsToBeInserted[deploymentID].length >= this.numAncillaryPointsToBatch) {
                var recordsToProcess = [];
                for (var i = 0; i < this.numAncillaryPointsToBatch; i++) {
                    recordsToProcess.push(me.ancillaryDataRecordsToBeInserted[deploymentID].shift());
                }
                logger.trace("Will process " + recordsToProcess.length + " ancillary data records off the stack leaving "
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
                logger.info("Will process " + recordsToProcess.length + " records off the stack leaving "
                    + me.ancillaryDataRecordsToBeInserted[deploymentID].length + " still to process");
                me.batchInsertAncillaryData(deploymentID, espName, recordsToProcess, function (err, numRecords) {
                    if (err) {
                        // Send the error to the callback
                        if (callback)
                            callback(err);
                    } else {
                        if (callback)
                            callback(null);
                    }

                });
            } else {
                logger.info("Deployment with ID " + deploymentID + " had no more ancillary data to process");
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
     * This method just runs a SQL script to clean out duplicate rows from the ancillary database
     * @param callback
     */
    this.cleanOutDuplicateAncillaryData = function (callback) {

        // Create the query string
        const queryString = 'DELETE FROM ancillary_data WHERE id IN (SELECT id FROM (SELECT id, row_number() over ' +
            '(partition BY timestamp_utc, ancillary_source_id_fk, value ORDER BY id) AS ' +
            'rnum FROM ancillary_data) t WHERE t.rnum > 1);';

        // Run the query against the connection pool
        me.pgPool.query(queryString, function (err, result) {
            // Check to see if the delete query failed with an error
            if (err) {
                logger.error('Error cleaning duplicates');
                logger.error(err);

                // Send error to callback
                if (callback)
                    callback(err);
            } else {
                logger.info("Duplicates cleaned: ", result);

                // Call the callback to return
                if (callback)
                    callback(null);
            }
        });
    };

    /**
     *
     * @param deploymentID
     * @param espName
     * @param ancillaryDataArray
     * @param callback
     */
    this.batchInsertAncillaryData = function (deploymentID, espName, ancillaryDataArray, callback) {
        logger.trace('insertAncillaryDataArray called with data array size of ' + ancillaryDataArray.length +
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
                logger.trace("Going to get source ID for deployment with ID " + deploymentID + ", esp " + espName +
                    ', sourceName ' + sourceName + ", varName " + varName + ", varLongName " + varLongName +
                    ", varUnits" + varUnits + ", logUnits " + logUnits + ", timestamp " + timestamp + ", data " + data);

                // Call the function to return the value text to add to prep for the insert
                me.getAncillaryDataInsertText(deploymentID, espName, sourceName, varName, varLongName, varUnits,
                    logUnits, timestamp, data, function (err, insertText) {

                        // Check for error
                        if (err) {
                            // And send the error back
                            if (callback)
                                callback(err);
                        } else {

                            // Make sure we have a response from the text building method
                            if (insertText) {
                                // Check to see if a comma is necessary
                                if (valueText !== null) {
                                    valueText += ',';
                                } else {
                                    valueText = '';
                                }

                                // Append the insert value
                                valueText += insertText;
                            } else {
                                // Log it and keep going
                                logger.error("No source ID found for deployment ID " + deploymentID +
                                    " of esp " + espName + " with source:(name = " + sourceName + ", varName = " +
                                    varName + ", varLongName = " + varLongName) + ", varUnits = " + varUnits +
                                    ", logUnits = " + logUnits;
                            }
                        }

                        // Bump the number of records processed
                        numberOfRecordsProcessed++;

                        // Now if we have processed enough records to fire an insert or have processed
                        // all the records, do a bulk insert
                        if (numberOfRecordsProcessed === originalNumberOfRecords) {
                            logger.trace("Going to insert using statement:\n" + valueText);
                            me.pgPool.query('INSERT INTO ancillary_data(ancillary_source_id_fk, ' +
                                'timestamp_utc, value) values ' + valueText, function (err, result) {

                                    // If the insert failed
                                    if (err) {
                                        logger.error('Error inserting bulk rows');
                                        logger.error(err);

                                        // Send the error to the callback
                                        if (callback)
                                            callback(err);
                                    } else {
                                        logger.trace("Bulk insert complete. Result: ", result);

                                        // Looks like it worked, call the callback with the number of records inserted
                                        if (callback)
                                            callback(null, numberOfRecordsProcessed);
                                    }
                                });
                        }
                    });
            }
        } else {
            // Not enough parameters, so send an error to the callback
            if (callback)
                callback(new Error("Not enough parameters, should have (deploymentID, espName, ancillaryDataArray, " +
                    "callback"));
        }
    }

    /**
     * This method takes in all the information needed to find the correct source ID for the ancillary data and then
     * it builds the phrase (text) that can be used to insert the data record given into the database.
     * @param deploymentID
     * @param espName
     * @param sourceName
     * @param varName
     * @param varLongName
     * @param varUnits
     * @param logUnits
     * @param timestamp
     * @param data
     * @param callback
     */
    this.getAncillaryDataInsertText = function (deploymentID, espName, sourceName, varName, varLongName, varUnits, logUnits, timestamp, data, callback) {
        // First let's make sure we have all the information we need
        if (typeof (deploymentID) !== 'undefined' && deploymentID != null &&
            typeof (espName) !== 'undefined' && espName != null &&
            typeof (sourceName) !== 'undefined' && sourceName != null &&
            typeof (varName) !== 'undefined' && varName != null &&
            typeof (varLongName) !== 'undefined' && varLongName != null &&
            typeof (varUnits) !== 'undefined' && varUnits != null &&
            typeof (logUnits) !== 'undefined' && logUnits != null &&
            typeof (timestamp) !== 'undefined' && timestamp != null &&
            typeof (data) !== 'undefined' && data != null) {

            // Look up the ancillary source ID from the deployment
            me.getAncillaryDataSourceID(deploymentID, espName, sourceName, varName, varLongName, varUnits,
                logUnits, timestamp, data, function (err, sourceID) {
                    // Check for error
                    if (err) {
                        // And send the error back
                        if (callback)
                            callback(err);
                    } else {

                        // Make sure we have an ID
                        if (sourceID) {

                            // Create the insert text phrase
                            var insertText = '(' + sourceID + ',\'' + timestamp + '\',' + data + ')';

                            if (callback)
                                callback(null, insertText);
                        } else {
                            // Log it and send the error back
                            var errorText = "No source ID found for deployment ID " + deploymentID + " of esp " +
                                espName + " with source:(name = " + sourceName + ", varName = " + varName + ", " +
                                "varLongName = " + varLongName + ", varUnits = " + varUnits + ", logUnits = " +
                                logUnits + ")";
                            logger.error(errorText);
                            if (callback)
                                callback(new Error(errorText));
                        }
                    }
                });
        } else {
            logger.error('Not enough parameters given for the function:\ndeploymentID = ' + deploymentID +
                '\nespName = ' + espName + '\nsourceName = ' + sourceName + '\nvarName = ' + varName +
                '\nvarLongName = ' + varLongName + '\nvarUnits = ' + varUnits + '\nlogUnits = ' + logUnits +
                '\ntimestamp = ' + timestamp + '\ndata = ' + data);
            if (callback)
                callback(new Error('Not enough parameters given for the function'));
        }
    }

    /**
     * This method takes in a deployment, looks up the deployment ancillary data statistics and then
     * updates the information attached to the deployment with that from the ancillary database.
     * @param deployment
     * @param callback
     */
    this.setDeploymentAncillaryStatsFromDatabase = function (deployment, callback) {
        // First let's verify the deployment was provided
        if (deployment) {
            // OK, so the deployment is provided, we first need to construct the object that matches the source
            // information that is in the ancillary database.  Here is the query to get that information
            var querySourceInformation = 'SELECT * from ancillary_sources where deployment_id_fk = \'' +
                deployment._id + '\'';
            logger.debug("Going to query for ancillary source information using: " + querySourceInformation);

            // Run the query against the connection pool
            me.pgPool.query(querySourceInformation, function (err, result) {
                // Check for an error first
                if (err) {
                    logger.error('Error running query ' + querySourceInformation);
                    logger.error(err);

                    // Send the error to the callback method
                    if (callback)
                        callback(err);
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

                    // Now update the deployment
                    deployment.ancillaryData = ancillaryDataSources;

                    // Send it back to the caller
                    if (callback)
                        callback(null, deployment);
                }
            });
        } else {
            // Send back an error
            if (callback)
                callback(new Error("No deployment ID was specified"));
        }
    }

    /**
     *
     * @param deployment
     * @param basedir
     * @param callback
     */
    this.syncAncillaryDataFileWithDatabase = function (deployment, basedir, callback) {
        // Grab a reference to this
        var self = this;

        logger.info('Will synchronize ancillary data from deployment ' +
            deployment.name + ' using base dir ' + basedir);

        logger.info("The current ancillary files being syncd are:", self.ancillaryFilesBeingSyncd);

        // First thing to do is make sure there is ancillary data listed under the deployment
        if (deployment.ancillaryData) {
            // Make sure there is at least one ancillary data source
            if (Object.keys(deployment.ancillaryData).length > 0) {
                // A counter to keep track of how many sources are currently in process
                var sourceCounter = 0;

                // Loop over the data sources and pass of to function to retain scope
                // of 'source'
                for (var source in deployment.ancillaryData) {
                    logger.info('Working with source ' + source);
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
                            logger.info("No more sources to process, exiting");

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
            logger.info('Processing source ', source);

            // Now build the CSV file for this source
            var filePath = path.join(basedir, 'instances', deployment.esp.name, 'deployments',
                deployment.name, 'data', 'processed', source + '.csv');
            logger.info('File path is ', filePath);
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
                logger.warn('File ' + filePath + ' is already being syncd so will ignore request');
                if (callback)
                    callback(null);
            } else {

                // Add it to the array of files being syncd so we can track what is going on
                self.ancillaryFilesBeingSyncd.push(filePath);

                // Check to see if it exists
                if (fs.existsSync(filePath)) {
                    logger.info('File already exists');

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
                        logger.info("Reading of file done");
                        logger.info("last epoch for file " + filePath + " is " + latestEpoch);

                        if (latestEpoch && lineCounter > 1) {
                            // Grab the source IDs
                            var sourceIDArray = getSourceIDs(deployment, source);

                            // Make sure there are sources to process
                            if (sourceIDArray && sourceIDArray.length > 0) {
                                // Create the proper query to grab all the data after the latest timestamp
                                var query = 'SELECT distinct extract(epoch from timestamp_utc) as epochseconds, ' +
                                    'timestamp_utc, string_agg(trim(to_char(value,\'9999999999D999\')),\',\' ' +
                                    'ORDER BY ancillary_source_id_fk) FROM ' +
                                    'ancillary_data where ancillary_source_id_fk in (SELECT id from ancillary_sources ' +
                                    'WHERE deployment_id_fk=\'' + deployment._id + '\' AND instrument_type=\'' +
                                    source + '\') and extract(epoch from timestamp_utc) > ' + latestEpoch +
                                    ' GROUP BY timestamp_utc ORDER BY timestamp_utc';
                                logger.debug('Query string = ' + query);

                                // Now write the data
                                writeAncillaryData(filePath, query, function (err) {
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
                                let errorMessage = 'No source ID array was returned, that is just not right!';
                                logger.error(errorMessage);

                                // Clean the entry from the tracker
                                let filePathIndex = self.ancillaryFilesBeingSyncd.indexOf(filePath);
                                logger.debug("File path was found at index " + filePathIndex + ", will remove it");
                                self.ancillaryFilesBeingSyncd.splice(filePathIndex, 1);
                                logger.debug("ancillaryFileBeingSyncd:", self.ancillaryFilesBeingSyncd);

                                // Send an error back to the caller
                                if (callback)
                                    callback(new Error(errorMessage));
                            }
                        } else {
                            // The file already existed, but there was no latest epoch timestamp
                            // found.  This should not really happen, so we will send back an error
                            let errorMessage = 'While file ' + filePath + ' already exists, it did not seem ' +
                                ' to have any existing data.  That is very strange';
                            logger.error(errorMessage);

                            // Remove it from the tracker
                            let filePathIndex = self.ancillaryFilesBeingSyncd.indexOf(filePath);
                            logger.debug("File path was found at index " + filePathIndex + ", will remove it");
                            self.ancillaryFilesBeingSyncd.splice(filePathIndex, 1);
                            logger.debug("ancillaryFileBeingSyncd:", self.ancillaryFilesBeingSyncd);

                            // Send an error back to caller
                            if (callback)
                                callback(new Error(errorMessage));
                        }
                    });
                } else {
                    logger.info('File ' + filePath + ' does not exist, will create it and write header');
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

                            // Make sure there are some IDs
                            if (sourceIDArray && sourceIDArray.length > 0) {
                                // Create the proper query to grab all the data
                                var query = 'SELECT distinct extract(epoch from timestamp_utc) as epochseconds, ' +
                                    'timestamp_utc, string_agg(trim(to_char(value,\'9999999999D999\')),\',\' ' +
                                    'ORDER BY ancillary_source_id_fk) FROM ' +
                                    'ancillary_data where ancillary_source_id_fk in (SELECT id from ancillary_sources ' +
                                    'WHERE deployment_id_fk=\'' + deployment._id + '\' AND instrument_type=\'' +
                                    source + '\') GROUP BY timestamp_utc ORDER BY timestamp_utc';
                                logger.debug('Query string = ' + query);

                                // Now write the data
                                writeAncillaryData(filePath, query, function (err) {
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
                                let errorMessage = 'No source ID array was returned, that is just not right!';
                                logger.error(errorMessage);

                                // Clean the entry from the tracker
                                let filePathIndex = self.ancillaryFilesBeingSyncd.indexOf(filePath);
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
            }
        }

        /**
         * This method takes in a deployment and a source name and returns a sorted array
         * of 'sourceID's that represent the ancillary entries in the database.
         * @param deployment
         * @param source
         * @returns {Array}
         */
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

            // Now sort them
            sourceIDs.sort();

            // Return the result
            return sourceIDs;
        }

        /**
         * This is a function that will take the given deployment, source and file location
         * and will write the appropriate header to the file
         * @param deployment
         * @param source
         * @param filePath
         * @param callback
         */
        function writeHeader(deployment, source, filePath, callback) {
            // Now create a stream writer
            var sourceStream = fs.createWriteStream(filePath, { 'flags': 'a' });

            // Add the event handler to send the call back when the stream finished
            sourceStream.on('finish', function () {
                logger.debug('Header writing complete');
                if (callback)
                    callback(null);
            });

            // The header
            var headerText = 'Timestamp(Epoch Seconds),Datetime';

            // Grab the source IDs in sorted order
            var sourceIDsInOrder = getSourceIDs(deployment, source);

            // Loop over the source IDs
            for (var i = 0; i < sourceIDsInOrder.length; i++) {
                // Loop over the ancillary data entries to look for the correct source
                for (var varEntry in deployment.ancillaryData[source]) {
                    if (deployment.ancillaryData[source][varEntry]['sourceID'] === sourceIDsInOrder[i]) {
                        logger.trace('Dealing with varEntry ', varEntry);

                        // Append the header text (adding comma if not the first entry)
                        headerText += ',' + deployment.ancillaryData[source][varEntry]['varLongName'] +
                            ' (' + deployment.ancillaryData[source][varEntry]['units'] + ')';
                        break;
                    }
                }
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
        function writeAncillaryData(filePath, query, callback) {
            // Grab reference
            // Now create a stream writer
            var sourceStream = fs.createWriteStream(filePath, { 'flags': 'a' });

            // When the finish event occurs, send the callback
            sourceStream.on('finish', function () {
                logger.debug("All writing finished");
                if (callback)
                    callback(null);
            });

            // Open it and start writing
            sourceStream.once('open', function (fd) {
                logger.info("Opening ancillary data file for writing");
                // Check for the file handle
                if (fd) {
                    // Run the query against the connection pool
                    me.pgPool.query(query, function (err, result) {
                        // Check for an error
                        if (err) {
                            logger.error('Error running query ' + query);
                            logger.error(err);
                            // End the stream and send the error to the callback
                            sourceStream.end();
                            if (callback)
                                callback(err);
                        } else {
                            // Check for results first
                            if (result && result.rows && result.rows.length > 0) {
                                // Make sure there are rows to be written
                                var numRows = result.rows.length;
                                logger.info('Will write ' + numRows + ' rows to the file');

                                // The row counter
                                var i = 0;

                                // The function to write the results
                                function writeResults() {
                                    logger.trace("Starting to write results to file");

                                    // A boolean to indicate if the writing is backed up
                                    var writeOK = true;

                                    // Loop over the rows watching for write backups
                                    do {
                                        // Now write it to the file
                                        writeOK = sourceStream.write(result.rows[i]['epochseconds'] + ',' +
                                            result.rows[i]['timestamp_utc'] + ',' + result.rows[i]['string_agg'] + '\n');

                                        // Bump the counter
                                        i++;
                                    } while (i < numRows && writeOK);

                                    // Check to see if all the writes are done
                                    if (i < numRows) {
                                        logger.trace("Writing stopped at line " + i + " will wait for drain");

                                        // Since not done, set up a handler to watch for the buffer to
                                        // drain and then start writing again
                                        sourceStream.once('drain', writeResults);
                                    } else {
                                        logger.info("All done writing to file, will end the write stream");
                                        sourceStream.end();
                                    }
                                }

                                // Call the function to write the results
                                writeResults();
                            } else {
                                logger.debug("No results, closing database client and write stream");
                                sourceStream.end();
                            }
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

    // Now set up a time to send any messages from the slack queue every 5 seconds
    setInterval(function () {
        // Check to see if there is a message in the slack queue
        if (me.slackQueue.length > 0) {
            // Pop the next message
            var messageToSend = me.slackQueue.shift();
            logger.debug("Will send message to slack", messageToSend);

            // Send the message
            me.slack.notify(messageToSend, function (err, result) {
                if (err) {
                    logger.error("Error trying to send to slack: ", err);
                } else {
                    logger.debug("Send to slack looks OK", result);
                }
            });
        }

    }, 1000 * 5);
}

// Export the factory method
exports.createDataAccess = function (config, dataDir,  dataDirectoryBaseUrl, slackUsername, slackWebHookURL, logDir,logLevel) {
    return new DataAccess(config, dataDir,  dataDirectoryBaseUrl, slackUsername, slackWebHookURL, logDir, logLevel);
}
