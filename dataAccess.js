// Read in the ESP application configuration
var espCfg = require('./cfg/esp_cfg.json');

// Grab dependencies
var util = require('util');
var fs = require('fs');
var cradle = require('cradle');
var pg = require('pg');
var eventEmitter = require('events').EventEmitter;

// Import the logging library
var log4js = require('log4js');

// Configure for file appending
log4js.loadAppender('file');
log4js.addAppender(log4js.appenders.file('logs/dataAccess.log'), 'dataAccess');

// Grab the logger
var logger = log4js.getLogger('dataAccess');

// Set a default log level
logger.setLevel(espCfg["logger_levels"]["dataAccess"]);

// Export the constructor function
exports.dataAccess = dataAccess;

// The constructor function
function dataAccess(couch_host, couch_port, couch_ssl, couch_username, couch_password, couch_db, pg_protocol, pg_host, pg_port, pg_username, pg_password, pg_db) {
    // Set the local properties for the data connection to couch DB
    this.couch_host = couch_host;
    this.couch_port = couch_port;
    this.couch_ssl = couch_ssl;
    this.couch_username = couch_username;
    this.couch_password = couch_password;
    this.couch_db = couch_db;
    logger.debug("CouchDB\n->Host: " + this.couch_host + "\n->Port: " +
        this.couch_port + "\n->SSL?: " + this.couch_ssl + "\n->Username: " +
        this.couch_username + "\n->Database: " + this.couch_db);

    // Grab a connection to the ESP CouchDB
    this.couch_db_conn = new (cradle.Connection)(this.couch_host, this.couch_port).database(this.couch_db);

    /*    this.couch_db_conn = new (cradle.Connection)(this.couch_host, this.couch_port, {
     secure: this.couch_ssl,
     auth: {
     username: this.couch_username,
     password: this.couch_password
     }
     }).database(this.couch_db);
     */

    // Check to see if the database exists
    this.couch_db_conn.exists(function (err, exists) {
        if (err) {
            logger.fatal("Error trying to connect to CouchDB:");
            logger.fatal(err);
            throw err;
        } else if (exists) {
            logger.info("The ESP Couch database exists");
        } else {
            logger.warn("The ESP Couch database does NOT exist yet");
        }
    });

    // Now for PostgreSQL
    this.pg_protocol = pg_protocol;
    this.pg_host = pg_host;
    this.pg_port = pg_port;
    this.pg_username = pg_username;
    this.pg_password = pg_password;
    this.pg_db = pg_db;
    logger.debug("PostgreSQL\n->Protocol: " + this.pg_protocol + "\n->Host: " +
        this.pg_host + "\n->Port: " + this.pg_port + "\n->Username: " +
        this.pg_username + "\n->Database:" + this.pg_db);

    // Form the connection string
    this.pg_conn_string = this.pg_protocol + "://" + this.pg_username + ":" +
        this.pg_password + "@" + this.pg_host + ":" + this.pg_port + "/" + this.pg_db;
}

// Inherit event emitter functionality
util.inherits(dataAccess, eventEmitter);

// The function gets all deployments and hands them to the
// callback function that was supplied by the client
dataAccess.prototype.getAllDeployments = function (callback) {

    // Query for data and use the given callback
    this.couch_db_conn.view('deployments/all_deployments', function (err, res) {
            // Check for an error first
            if (err) {
                logger.error("Error trying to get all deployments!");
                logger.error(err);
            } else {
                logger.debug("Got deployments from couch");
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

// The function gets all deployments that have no end date
dataAccess.prototype.getOpenDeployments = function (callback) {

    // Query for data and use the given callback
    this.couch_db_conn.view('deployments/getOpenDeployments', function (err, res) {
            // Check for an error first
            if (err) {
                logger.error("Error trying to get open deployments!");
                logger.error(err);
            } else {
                logger.debug("Got deployments from couch");
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

// This method returns an array of the unique deployment names for all deployments in the DB
dataAccess.prototype.getDeploymentNames = function (callback) {
    // Run the couch query
    this.couch_db_conn.view('deployments/all_names', {group: true, reduce: true}, function (err, res) {
            // Check for an error first
            if (err) {
                logger.error("Error trying to get deployments names");
                logger.error(err);
            } else {
                logger.debug("Got names");

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

// This function returns the deployments that have the given name
dataAccess.prototype.getDeploymentsByName = function(deploymentName, callback) {
    logger.debug("Going to get deployments with the name " + deploymentName);
    var opts = {
        key:deploymentName
    }
     // Run the couch query
    this.couch_db_conn.view('deployments/getDeploymentsByName', opts, function (err, res) {
            // Check for an error first
            if (err) {
                logger.error("Error trying to get deployments by name " + deploymentName);
                logger.error(err);
            } else {
                logger.debug("Got deployments by name");
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

// This function returns the names of the ESPs that have a deployment with the given name
dataAccess.prototype.getESPNamesInDeployment = function(deploymentName, callback) {
    logger.debug("Going to get ESP name list for deployment " + deploymentName);
    var opts = {
        key:deploymentName
    }
     // Run the couch query
    this.couch_db_conn.view('deployments/getESPNamesInDeployment', opts, function (err, res) {
            // Check for an error first
            if (err) {
                logger.error("Error trying to get esp names from deployment");
                logger.error(err);
            } else {
                logger.debug("Got ESP names");
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

// This function will persist a given deployment
dataAccess.prototype.persistDeployment = function (deployment, callback) {

    // Call the method to save the deployment to the datastore
    this.couch_db_conn.save(deployment, function (err, res) {
        // Check for errors
        if (err) {
            // Log the error
            logger.warn("Error trying to save a deployment: ");
            logger.warn(deployment);
            logger.warn(err);

            // Send error to the caller
            if (callback)
                callback(err);
        } else {
            logger.debug("Deployment " + deployment.name + " updated successfully");
            logger.debug(res);
            logger.debug(deployment);
            logger.debug("With ancillary data");
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
    })
}

// The function to remove a deployment from the CouchDB database
dataAccess.prototype.removeDeployment = function (deployment, callback) {
    if (deployment && deployment._id) {
        // call the method to save the deployment
        this.couch_db_conn.remove(deployment._id, function (err, res) {
            if (err) {
                // Log the error
                logger.warn("Error trying to remove deployment: ");
                logger.warn(deployment);
                logger.warn(err);

                // Send the error to the caller
                if (callback)
                    callback(err);
            } else {
                // Log the removal
                logger.debug("Deployment " + deployment.name + " removed successfully");
                logger.debug(deployment);

                // Send the response to the callback
                if (callback)
                    callback(res);
            }
        });
    }
}

// This method takes in a Deployment object and an array of ancillary date records of the form
// (instrument_type, variable_name, variable_long_name, units, units_from_log_file, timestamp_utc, data)
// and then inserts the ancillary data in the PostgreSQL DB and updates the Deployment with
// the updated ancillary data information
dataAccess.prototype.insertAncillaryDataArray = function (deployment, ancillaryDataArray, callback) {
    logger.debug("insertAncillaryDataArray called with deployment ");
    logger.debug(deployment);
    logger.debug("and with an array of " + ancillaryDataArray.length + " points");

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
                            // go ahead and persist the actual data point
                            processDataArray(updatedUpdatedDeployment, ancillaryDataArray,
                                function (err, deploymentAfterDataInsert) {
                                    // Update the deployment
                                    self.persistDeployment(deploymentAfterDataInsert, function (err, lastUpdatedDeployment) {
                                        callback(err, lastUpdatedDeployment);
                                    });
                                });
                        }
                    });
                }
            });
        } else {
            callback(new Error("No deployment or ancillary data objects associated with the deployment"));
        }
    } else {
        // No data was to be processed, just return
        callback(null, deployment);
    }

    // This method takes in a deployment and ensures there are IDs associated with each of the
    // ancillary data objects.
    function assignSourceIDsToDeployment(deployment, callback) {
        logger.debug("Going to check all source IDs for deployment");
        logger.debug(deployment);
        var deploymentForAssigning = deployment;

        // Connect to the database
        pg.connect(self.pg_conn_string, function (err, client, done) {

            // Check for errors connecting to the DB
            if (err) {
                // Log the error
                logger.fatal("Error connecting to Postgres when assigning source IDs");
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
                logger.debug("There are a total of " + numberOfVariablesToProcess + " variables to check");

                // Successful connection to the DB, now loop over the sources
                sourceNames.forEach(function (sourceName) {

                    // Now loop over the log units for that source
                    Object.keys(deploymentForAssigning.ancillary_data[sourceName]).forEach(function (logUnits) {

                        logger.debug("Checking " + sourceName + " unit " + logUnits);
                        logger.debug(deploymentForAssigning.ancillary_data[sourceName][logUnits]);

                        // Check to see if the ancillary source ID has already been assigned
                        if (deploymentForAssigning.ancillary_data[sourceName][logUnits]["source_id"] &&
                            deploymentForAssigning.ancillary_data[sourceName][logUnits]["source_id"] > 0) {

                            logger.debug("ID already exists, skip it");
                            // Decrement the number of variables to process since we are processing one now
                            numberOfVariablesToProcess--;

                            if (numberOfVariablesToProcess === 0) {
                                logger.debug("Done checking for source IDs, close the DB and send " +
                                    "updated deployment to callback");
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
                                        logger.error("DB error searching for ancillary source ID");
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
                                            deploymentForAssigning.ancillary_data[sourceName][logUnits]["source_id"] = result.rows[0].id;
                                            logger.debug("ID already in DB: " + result.rows[0].id);

                                            // Decrement the number of variables to process since we are processing one now
                                            numberOfVariablesToProcess--;

                                            // Check if we are done
                                            if (numberOfVariablesToProcess === 0) {
                                                logger.debug("Done checking for source IDs, close the DB and send " +
                                                    "updated deployment to callback");
                                                done();
                                                callback(null, deploymentForAssigning);
                                            }
                                        } else {
                                            // No, luck will have to insert one and add it to the deployment, then send it back
                                            client.query("INSERT INTO ancillary_sources(deployment_id_fk, esp_name, instrument_type, " +
                                                "var_name, var_long_name, log_units, units) values ($1,$2,$3,$4,$5,$6,$7) RETURNING id",
                                                [deploymentForAssigning._id, deploymentForAssigning.esp.name, sourceName,
                                                    deploymentForAssigning.ancillary_data[sourceName][logUnits].var_name,
                                                    deploymentForAssigning.ancillary_data[sourceName][logUnits].var_long_name,
                                                    logUnits, deploymentForAssigning.ancillary_data[sourceName][logUnits].units],
                                                function (err, result) {
                                                    // Check for errors
                                                    if (err) {
                                                        // Log the error
                                                        logger.warn("Error trying to insert a new ancillary data source for");
                                                        logger.warn(err);

                                                        // Decrement the number of variables to process since we are processing one now
                                                        numberOfVariablesToProcess--;

                                                        // Close the database and send back to caller
                                                        done();
                                                        callback(err);
                                                    } else {
                                                        // Grab the ID of the ancillary source and set it
                                                        deploymentForAssigning.ancillary_data[sourceName][logUnits]["source_id"] = result.rows[0].id;
                                                        logger.debug("Created new source ID of " + result.rows[0].id);

                                                        // Decrement the number of variables to process since we are processing one now
                                                        numberOfVariablesToProcess--;

                                                        // Check if we are done
                                                        if (numberOfVariablesToProcess === 0) {
                                                            logger.debug("Done checking for source IDs, close the DB and send " +
                                                                "updated deployment to callback");
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

    // This function takes in a deployment an array of ancillary data and persists it to the
    // postgres DB.
    function processDataArray(deployment, ancillaryDataArray, callback) {
        var tempDeployment = deployment;
        var tempAncillaryDataArray = ancillaryDataArray;

        // Grab the number of points to batch insert from the configuration file or assign a default
        var numAncillaryPointsToBatch = espCfg.numAncillaryPointsToBatch;
        if (!numAncillaryPointsToBatch || numAncillaryPointsToBatch <= 0) numAncillaryPointsToBatch = 1000;
        logger.debug("Will batch " + numAncillaryPointsToBatch + " for inserting");

        // Just make sure real conditions exist
        if (tempDeployment && tempAncillaryDataArray && tempAncillaryDataArray.length && tempAncillaryDataArray.length > 0) {
            logger.debug("processDataArray called to process " + tempAncillaryDataArray.length +
                " points into tempDeployment " + tempDeployment.name + " of ESP " + tempDeployment.esp.name);

            // A variable to keep track of how many records have to be processed
            var recordsProcessed = tempAncillaryDataArray.length;

            // A variable to hold how many insert queries are currently running
            var openInsertQueries = 0;

            // A variable to hold the multiple rows that will be inserted at once
            var valueText = '';

            // Connect to the database
            pg.connect(self.pg_conn_string, function (err, client, done) {
                // Check for any error
                if (err) {
                    logger.error("Error connection to the postgres DB");
                    logger.error(err);
                    callback(err);
                } else {
                    // Loop over the array of data records
                    for (var i = 0; i < tempAncillaryDataArray.length; i++) {
                        // Grab a record
                        var recordToProcess = tempAncillaryDataArray[i];

                        // Look up the ancillary source ID from the deployment
                        if (tempDeployment && tempDeployment.ancillary_data && tempDeployment.ancillary_data[recordToProcess[0]] &&
                            tempDeployment.ancillary_data[recordToProcess[0]][recordToProcess[4]] &&
                            tempDeployment.ancillary_data[recordToProcess[0]][recordToProcess[4]].source_id &&
                            tempDeployment.ancillary_data[recordToProcess[0]][recordToProcess[4]].source_id > 0) {

                            // Make sure there is a field for number of points
                            if (tempDeployment.ancillary_data[recordToProcess[0]][recordToProcess[4]].numPoints &&
                                tempDeployment.ancillary_data[recordToProcess[0]][recordToProcess[4]].numPoints >= 0) {
                                // Bump the counter on the number of variables
                                tempDeployment.ancillary_data[recordToProcess[0]][recordToProcess[4]].numPoints++;
                            } else {
                                // Initialize it to one
                                tempDeployment.ancillary_data[recordToProcess[0]][recordToProcess[4]].numPoints = 1;
                            }

                            // Check to see if a comma is necessary
                            if (valueText !== '') {
                                valueText += ",";
                            }

                            // Append the insert value
                            valueText += "(" + tempDeployment.ancillary_data[recordToProcess[0]][recordToProcess[4]].source_id +
                                ",'" + recordToProcess[5] + "'," + recordToProcess[6] + ")";

                            // After a fair number of records, do the insert
                            if (i % numAncillaryPointsToBatch === 0) {
                                logger.debug("Processed " + recordsProcessed +
                                    " records out of the array and will insert them");

                                // Bump the number of open queries
                                openInsertQueries++;

                                // Create the query and run it
                                client.query("INSERT INTO ancillary_data(ancillary_source_id_fk, " +
                                    "timestamp_utc, value) values " + valueText, function (err, result) {

                                    // Decrement the number of running queries
                                    openInsertQueries--;

                                    // Check for errors
                                    if (err) {
                                        logger.error("Error inserting bulk rows");
                                        logger.error(err);
                                        callback(err);
                                    } else {
                                        logger.debug("Done with bulk insert ");
                                        logger.debug(result);
                                    }

                                    // Check to see if there are no more records and no more open queries
                                    if (recordsProcessed === 0 && openInsertQueries === 0) {
                                        logger.debug("Looks like we have processed all records in ...");
                                        // Close the DB connection
                                        done();

                                        // Callback
                                        callback(err, tempDeployment);
                                    }
                                });
                                // Clear the valueText
                                valueText = '';
                            }
                        }
                        // Decrement the counter
                        recordsProcessed--;
                    }

                    // Check to see if there are is any value text that has not been written to the DB yet
                    if (valueText !== '') {
                        // Bump the number of running queries
                        openInsertQueries++;

                        // Insert the last section of data
                        client.query("INSERT INTO ancillary_data(ancillary_source_id_fk, timestamp_utc, value) values " + valueText, function (err, result) {
                            // Decrement the number of queries that are running
                            openInsertQueries--;

                            // Check for errors
                            if (err) {
                                logger.error("Error inserting bulk rows");
                                logger.error(err);
                                callback(err);
                            } else {
                                logger.debug("Done with bulk insert");
                                logger.debug(result);
                            }

                            // Check to see if there are no more records and no more open queries
                            if (recordsProcessed === 0 && openInsertQueries === 0) {
                                // Close the DB connection
                                done();

                                // Send to the callback
                                callback(err, tempDeployment);
                            }
                        });
                    }
                }
            });  // End DB connection call
        } else {
            logger.error("Not enough arguments");
            callback(new Error("Not enough arguments specified"));
        }
    }
}

// This function takes in the ancillary source ID and a start and end time and returns the
// data in whichever format is specified (JSON is default and only one right now)
dataAccess.prototype.getAncillaryData = function (ancillarySourceID, startTimestampUtc, endTimestampUtc, format, callback) {
    var self = this;

    logger.debug("getAncillaryData called: " + ancillarySourceID);
    var response = [];
    pg.connect(self.pg_conn_string, function (err, client, done) {
        if (err) {
            logger.error("Error caught trying to connect to DB");
            logger.error(err);
            if (callback)
                callback(err);
        } else {
            client.query("SELECT * FROM ancillary_data WHERE ancillary_source_id_fk = " + ancillarySourceID + " order by timestamp_utc", function (err, result) {
                if (err) {
                    logger.error("Error running query");
                    logger.error(err);
                    if (callback)
                        callback(err);
                } else {
                    logger.debug("Query came back with " + result.rows.length + " points");
                    if (result && result.rows && result.rows.length > 0) {
                        for (var i = 0; i < result.rows.length; i++) {
                            response.push([Date.parse(result.rows[i].timestamp_utc),parseFloat(result.rows[i].value)]);
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