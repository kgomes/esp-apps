// Grab dependencies
var util = require('util');
var fs = require('fs');
var cradle = require('cradle');
var pg = require('pg');
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
                        userArray.push(res[i].key);
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
                        userArray.push(res[i].key);
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
        logger.debug("persist user called with params: firstname= " + firstname + ", surname= " +
            surname + ", email= " + email + ", loginType= " + loginType + ", loginID= " + loginID);
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
    // This function returns an array of all the ESP objects in
    // the data store.
    // ***********************************************************
    this.getAllESPs = function (callback) {
        // Query for all ESPs
        this.couchDBConn.view('esps/allESPs', {group: true, reduce: true}, function (err, res) {
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

    // ***********************************************************
    // This function returns the ESPs that have a deployment with the given name
    // ***********************************************************
    this.getESPsInDeployment = function (deploymentName, callback) {
        logger.debug('Going to get ESP list for deployment ' + deploymentName);
        var opts = {
            key: deploymentName
        }
        // Run the couch query
        this.couchDBConn.view('esps/espsInDeployment', opts, function (err, res) {
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
    }

    // ***********************************************************
    // This function returns an array of all the names of the ESPs
    // in the data store
    // ***********************************************************
    this.getAllESPNames = function (callback) {
        logger.debug('getAllESPNames called');
        me.couchDBConn.view('esps/allESPNames', {group: true, reduce: true}, function (err, res) {
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
    }

    // ***********************************************************
    // This function returns the names of the ESPs that have a deployment with the given name
    // ***********************************************************
    this.getESPNamesInDeployment = function (deploymentName, callback) {
        logger.debug('Going to get ESP name list for deployment ' + deploymentName);
        var opts = {
            key: deploymentName
        }
        // Run the couch query
        this.couchDBConn.view('esps/espNamesInDeployment', opts, function (err, res) {
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
    }

    // ***********************************************************
    // The function gets all deployments and hands them to the
    // callback function that was supplied by the client
    // ***********************************************************
    this.getAllDeployments = function (callback) {

        // Query for data and use the given callback
        this.couchDBConn.view('deployments/allDeployments', function (err, res) {
                // Check for an error first
                if (err) {
                    logger.error('Error trying to get all deployments! ', err);
                } else {
                    logger.debug('Got deployments from couch');
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
    // The function gets all deployments that have no end date
    // ***********************************************************
    this.getOpenDeployments = function (callback) {

        // Query for data and use the given callback
        this.couchDBConn.view('deployments/openDeployments', function (err, res) {
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
        this.couchDBConn.view('deployments/deploymentsByName', opts, function (err, res) {
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
    // This method returns an array of the unique deployment names for all deployments in the DB
    // ***********************************************************
    this.getDeploymentNames = function (callback) {
        // Run the couch query
        this.couchDBConn.view('deployments/allDeploymentNames', {group: true, reduce: true}, function (err, res) {
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
    // This function will persist a given deployment
    // ***********************************************************
    this.persistDeployment = function (deployment, callback) {

        // Call the method to save the deployment to the datastore
        this.couchDBConn.save(deployment, function (err, res) {
            // Check for errors
            if (err) {
                // Log the error
                logger.warn('Error trying to save a deployment: ');
                logger.warn(deployment);
                logger.warn(err);

                // Send error to the caller
                if (callback)
                    callback(err);
            } else {
                logger.debug('Deployment ' + deployment.name + ' updated successfully');
                logger.debug(res);
                logger.debug(deployment);
                logger.debug('With ancillary data');
                logger.debug(deployment.ancillary_data);

                // Assingn the ID and rev
                if (res.ok) {
                    // Assign the ID and revision
                    deployment._id = res.id;
                    deployment._rev = res.rev;

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
    // This function takes in the ancillary source ID and a start and end time and returns the
    // data in whichever format is specified (JSON is default and only one right now)
    // ***********************************************************
    this.getAncillaryData = function (ancillarySourceID, startTimestampUtc, endTimestampUtc, format, callback) {
        var self = this;

        logger.debug('getAncillaryData called: ' + ancillarySourceID);
        var response = [];
        pg.connect(self.pgConnectionString, function (err, client, done) {
            if (err) {
                logger.error('Error caught trying to connect to DB');
                logger.error(err);
                if (callback)
                    callback(err);
            } else {
                client.query('SELECT * FROM ancillary_data WHERE ancillary_source_id_fk = ' + ancillarySourceID + ' order by timestamp_utc', function (err, result) {
                    if (err) {
                        logger.error('Error running query');
                        logger.error(err);
                        if (callback)
                            callback(err);
                    } else {
                        logger.debug('Query came back with ' + result.rows.length + ' points');
                        if (result && result.rows && result.rows.length > 0) {
                            for (var i = 0; i < result.rows.length; i++) {
                                response.push([Date.parse(result.rows[i].timestamp_utc), parseFloat(result.rows[i].value)]);
                            }
                        }
                        done();
                        if (callback)
                            callback(null, response);
                    }
                });
            }
        });
    }


    // ***********************************************************
    // This method takes in a Deployment object and an array of ancillary date records of the form
    // (instrument_type, variable_name, variable_long_name, units, units_from_log_file, timestamp_utc, data)
    // and then inserts the ancillary data in the PostgreSQL DB and updates the Deployment with
    // the updated ancillary data information
    // ***********************************************************
    this.insertAncillaryDataArray = function (deployment, ancillaryDataArray, callback) {
        logger.debug('insertAncillaryDataArray called with deployment ');
        logger.debug(deployment);
        logger.debug('and with an array of ' + ancillaryDataArray.length + ' points');

        // Grab a reference to self
        var self = this;

        // Make sure we have data to process
        if (ancillaryDataArray && ancillaryDataArray.length && ancillaryDataArray.length > 0) {

            // Next, let's make sure there is a deployment and some ancillary data points to
            // actually process, otherwise, throw an error
            if (deployment && deployment.ancillary_data) {

                // We are looking good to go, so let's call the method that will make sure
                // we have source IDs associated with the deployment
                assignSourceIDsToDeployment(deployment, function (err, updatedDeployment) {

                    // Check for errors first
                    if (err) {
                        callback(err);
                    } else {
                        // Persist any changes to the deployment
                        self.persistDeployment(updatedDeployment, function (err, updatedUpdatedDeployment) {
                            if (err) {
                                callback(err);
                            } else {
                                // Now I have the deployment with all ancillary sources having ID's,
                                // go ahead and persist the actual data points.  First create the PostgreSQL
                                // client and then pass it into the method to insert the data
                                pg.connect(self.pgConnectionString, function (err, client, done) {
                                    // Check for any error
                                    if (err) {
                                        logger.error('Error connection to the postgres DB');
                                        logger.error(err);
                                        callback(err);
                                    } else {
                                        // Client should be good to go, call the method to process the data
                                        insertAncillaryDataArray(updatedUpdatedDeployment, client, ancillaryDataArray, function (err, deploymentAfterDataInsert) {
                                            // Call done to clean up the DB
                                            done();
                                            // And persist the updated deployment
                                            self.persistDeployment(deploymentAfterDataInsert, function (err, lastUpdatedDeployment) {
                                                callback(err, lastUpdatedDeployment);
                                            });

                                        });
                                    }
                                });
                            }
                        });
                    }
                });
            } else {
                callback(new Error('No deployment or ancillary data objects associated with the deployment'));
            }
        } else {
            // No data was to be processed, just return
            callback(null, deployment);
        }

        // This method takes in a deployment and ensures there are IDs associated with each of the
        // ancillary data objects.
        function assignSourceIDsToDeployment(deployment, callback) {
            logger.debug('Going to check all source IDs for deployment');
            logger.debug(deployment);
            var deploymentForAssigning = deployment;

            // Connect to the database
            pg.connect(self.pgConnectionString, function (err, client, done) {

                // Check for errors connecting to the DB
                if (err) {
                    // Log the error
                    logger.fatal('Error connecting to Postgres when assigning source IDs');
                    logger.fatal(err);

                    // Send to callback
                    callback(err);
                } else {
                    // The number of variables to be processed
                    var numberOfVariablesToProcess = 0;

                    // Start by grabbing the names of the data sources from the deployment
                    var sourceNames = Object.keys(deploymentForAssigning.ancillary_data);

                    // Let's count up the total number of variables there are to check
                    sourceNames.forEach(function (sourceName) {
                        numberOfVariablesToProcess += Object.keys(deploymentForAssigning.ancillary_data[sourceName]).length;
                    });
                    logger.debug('There are a total of ' + numberOfVariablesToProcess + ' variables to check');

                    // Successful connection to the DB, now loop over the sources
                    sourceNames.forEach(function (sourceName) {

                        // Now loop over the log units for that source
                        Object.keys(deploymentForAssigning.ancillary_data[sourceName]).forEach(function (logUnits) {

                            logger.debug('Checking ' + sourceName + ' unit ' + logUnits);
                            logger.debug(deploymentForAssigning.ancillary_data[sourceName][logUnits]);

                            // Check to see if the ancillary source ID has already been assigned
                            if (deploymentForAssigning.ancillary_data[sourceName][logUnits]['source_id'] &&
                                deploymentForAssigning.ancillary_data[sourceName][logUnits]['source_id'] > 0) {

                                logger.debug('ID already exists, skip it');
                                // Decrement the number of variables to process since we are processing one now
                                numberOfVariablesToProcess--;

                                if (numberOfVariablesToProcess === 0) {
                                    logger.debug('Done checking for source IDs, close the DB and send ' +
                                        'updated deployment to callback');
                                    done();
                                    callback(null, deploymentForAssigning);
                                }
                            } else {
                                client.query('SELECT id from ancillary_sources where deployment_id_fk = $1 ' +
                                    'and esp_name = $2 and instrument_type = $3 ' +
                                    'and log_units = $4',
                                    [deploymentForAssigning._id, deploymentForAssigning.esp.name, sourceName, logUnits],
                                    function (err, result) {
                                        // Check for any errors first
                                        if (err) {
                                            // Log the error
                                            logger.error('DB error searching for ancillary source ID');
                                            logger.error(err);

                                            // Decrement the number of variables to process since we are processing one now
                                            numberOfVariablesToProcess--;

                                            // Close the connection and send back to caller with error
                                            done();
                                            callback(err);
                                        } else {
                                            // The query for the ancillary source executed OK, we now need to check
                                            // to see if the ancillary source query returned anything
                                            if (result && result.rows && result.rows.length > 0) {

                                                // Yep, found it, grab the result and add it to the deployment info
                                                deploymentForAssigning.ancillary_data[sourceName][logUnits]['source_id'] = result.rows[0].id;
                                                logger.debug('ID already in DB: ' + result.rows[0].id);

                                                // Decrement the number of variables to process since we are processing one now
                                                numberOfVariablesToProcess--;

                                                // Check if we are done
                                                if (numberOfVariablesToProcess === 0) {
                                                    logger.debug('Done checking for source IDs, close the DB and send ' +
                                                        'updated deployment to callback');
                                                    done();
                                                    callback(null, deploymentForAssigning);
                                                }
                                            } else {
                                                // No, luck will have to insert one and add it to the deployment, then send it back
                                                client.query('INSERT INTO ancillary_sources(deployment_id_fk, esp_name, instrument_type, ' +
                                                    'var_name, var_long_name, log_units, units) values ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
                                                    [deploymentForAssigning._id, deploymentForAssigning.esp.name, sourceName,
                                                        deploymentForAssigning.ancillary_data[sourceName][logUnits].var_name,
                                                        deploymentForAssigning.ancillary_data[sourceName][logUnits].var_long_name,
                                                        logUnits, deploymentForAssigning.ancillary_data[sourceName][logUnits].units],
                                                    function (err, result) {
                                                        // Check for errors
                                                        if (err) {
                                                            // Log the error
                                                            logger.warn('Error trying to insert a new ancillary data source for');
                                                            logger.warn(err);

                                                            // Decrement the number of variables to process since we are processing one now
                                                            numberOfVariablesToProcess--;

                                                            // Close the database and send back to caller
                                                            done();
                                                            callback(err);
                                                        } else {
                                                            // Grab the ID of the ancillary source and set it
                                                            deploymentForAssigning.ancillary_data[sourceName][logUnits]['source_id'] = result.rows[0].id;
                                                            logger.debug('Created new source ID of ' + result.rows[0].id);

                                                            // Decrement the number of variables to process since we are processing one now
                                                            numberOfVariablesToProcess--;

                                                            // Check if we are done
                                                            if (numberOfVariablesToProcess === 0) {
                                                                logger.debug('Done checking for source IDs, close the DB and send ' +
                                                                    'updated deployment to callback');
                                                                done();
                                                                callback(null, deploymentForAssigning);
                                                            }
                                                        }
                                                    }
                                                );
                                            }
                                        }
                                    } // End callback function to handle results of search for existing source ID
                                ); // End of query to search for existing ID
                            }
                        });
                    }); // End foreach over source names
                } // End if-else from error trap on database connection callback
            }); // End pg.connect call

        }

        // This is a recursive method that processes ancillary data from an array, inserts them into the PostgreSQL
        // database and updates the deployment with the updated information
        function insertAncillaryDataArray(deployment, pgClient, ancillaryDataArray, callback) {
            logger.debug("insertAncillaryDataArray called with data array size of " + ancillaryDataArray.length);
            logger.debug("Callback function is ", callback);
            // Create a counter to count the current number of records that have been popped off the array
            var numRecordsProcessed = 0;

            // The value text clause that will be used in the insert
            var valueText = '';

            // Now loop until you have reached the batch size or until the array is empty
            while (numRecordsProcessed < self.numAncillaryPointsToBatch && ancillaryDataArray.length > 0) {
                // Pop a record off the array
                var recordToProcess = ancillaryDataArray.pop();
                // Look up the ancillary source ID from the deployment
                if (deployment && deployment.ancillary_data && deployment.ancillary_data[recordToProcess[0]] &&
                    deployment.ancillary_data[recordToProcess[0]][recordToProcess[4]] &&
                    deployment.ancillary_data[recordToProcess[0]][recordToProcess[4]].source_id &&
                    deployment.ancillary_data[recordToProcess[0]][recordToProcess[4]].source_id > 0) {

                    // Make sure there is a field for number of points
                    if (deployment.ancillary_data[recordToProcess[0]][recordToProcess[4]].numPoints &&
                        deployment.ancillary_data[recordToProcess[0]][recordToProcess[4]].numPoints >= 0) {
                        // Bump the counter on the number of variables
                        deployment.ancillary_data[recordToProcess[0]][recordToProcess[4]].numPoints++;
                    } else {
                        // Initialize it to one
                        deployment.ancillary_data[recordToProcess[0]][recordToProcess[4]].numPoints = 1;
                    }

                    // Check to see if a comma is necessary
                    if (valueText !== '') {
                        valueText += ',';
                    }

                    // Append the insert value
                    valueText += '(' + deployment.ancillary_data[recordToProcess[0]][recordToProcess[4]].source_id +
                        ',\'' + recordToProcess[5] + '\',' + recordToProcess[6] + ')';

                }
                // Bump the counter
                numRecordsProcessed++;
            }

            // Create the query and run it
            pgClient.query('INSERT INTO ancillary_data(ancillary_source_id_fk, ' +
                'timestamp_utc, value) values ' + valueText, function (err, result) {

                // Check for errors
                if (err) {
                    logger.error('Error inserting bulk rows');
                    logger.error(err);
                    callback(err);
                } else {
                    // So it looks like the insert was successful, let's recursively call this method
                    // with any remaining records
                    logger.debug('Done with bulk insert and inserted ', result);
                    if (ancillaryDataArray.length > 0) {
                        logger.debug('Now recursively calling with ' + ancillaryDataArray.length
                            + ' records left to process');
                        insertAncillaryDataArray(deployment, pgClient, ancillaryDataArray, callback);
                        // And return
                        return;
                    } else {
                        // Call the callback that has been passed down as we are done!
                        callback(null, deployment);
                    }
                }
            });
        }
    }
}

// Export the factory method
exports.createDataAccess = function (opts) {
    return new DataAccess(opts);
}