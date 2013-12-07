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

    // This is the handler for the route which requests all deployments with various filters
    this.getDeployments = function (req, res) {
        logger.debug('getDeployments called');

        // Set the content type to JSON
        res.contentType('application/json');

        // Check to see if the 'namesOnly' parameter was specified and is true
        if (req.query.namesOnly && req.query.namesOnly === 'true') {
            me.dataAccess.getDeploymentNames(function (err, response) {
                if (err) {
                    // TODO handle the error back to caller
                } else {
                    logger.debug('Got response:');
                    logger.debug(response);
                    res.json(response);
                }
            })
        } else if (req.query.openOnly && req.query.openOnly === 'true') {
            logger.debug("The request is for open deployments only");
            me.dataAccess.getOpenDeployments(function (err, response) {
                if (err) {
                    // TODO kgomes: handle the error properly
                } else {
                    // Send the results of the query
                    res.json(response);
                }
            });
        } else if (req.query.name) {
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
        } else {
            logger.debug('No filters, so all deployments will be returned')
            // First thing to do is see if there is a parameter that is asking for just the names
            me.dataAccess.getDeployments(function (err, response) {
                if (err) {
                    // TODO kgomes: handle the error properly
                } else {
                    // Send the results of the query
                    res.json(response);
                }
            });
        }
    }

    // This method requests a specific deployment
    this.getDeploymentByID = function (req, res) {
        logger.debug("getDeploymentByID called with params: ", req.params);

        // Set the content type to JSON
        res.contentType('application/json');

        // Verify there is an ID first
        if (req.params.id) {
            // Set a parameter if the caller wants the full return
            var returnFull = false;
            if (req.query.returnFull && req.query.returnFull === 'true') {
                returnFull = true;
            }
            logger.debug("Will look for deployment with ID " + req.params.id);
            me.dataAccess.getDeploymentByID(req.params.id, returnFull, function (err, response) {
                if (err) {
                    // TODO kgomes: handle this error
                } else {
                    // Send the results
                    res.json(response);
                }
            });
        } else {
            logger.warn("No ID specified in getDeploymentById");
        }
    }

    this.getDeploymentErrors = function (req, res) {
        // Set the content type to JSON
        res.contentType('application/json');

        // Verify there is an ID first
        if (req.params.id) {
            me.dataAccess.getDeploymentErrors(req.params.id, function (err, response) {
                if (err) {
                    // TODO kgomes: handle this error
                } else {
                    // Send the results
                    res.json(response);
                }
            });
        } else {
            logger.warn("No ID specified in getDeploymentErrors");
        }
    }

    this.getDeploymentProtocolRuns = function (req, res) {
        // Set the content type to JSON
        res.contentType('application/json');

        // Verify there is an ID first
        if (req.params.id) {
            me.dataAccess.getDeploymentProtocolRuns(req.params.id, function (err, response) {
                if (err) {
                    // TODO kgomes: handle this error
                } else {
                    // Send the results
                    res.json(response);
                }
            });
        } else {
            logger.warn("No ID specified in getDeploymentProtocolRuns");
        }
    }

    this.getDeploymentSamples = function (req, res) {
        // Set the content type to JSON
        res.contentType('application/json');

        // Verify there is an ID first
        if (req.params.id) {
            me.dataAccess.getDeploymentSamples(req.params.id, function (err, response) {
                if (err) {
                    // TODO kgomes: handle this error
                } else {
                    // Send the results
                    res.json(response);
                }
            });
        } else {
            logger.warn("No ID specified in getDeploymentSamples");
        }
    }

    this.getDeploymentImages = function (req, res) {
        // Set the content type to JSON
        res.contentType('application/json');

        // Verify there is an ID first
        if (req.params.id) {
            me.dataAccess.getDeploymentImages(req.params.id, function (err, response) {
                if (err) {
                    // TODO kgomes: handle this error
                } else {
                    // Send the results
                    res.json(response);
                }
            });
        } else {
            logger.warn("No ID specified in getDeploymentImages");
        }
    }

    this.getDeploymentPCRTypes = function (req, res) {
        // Set the content type to JSON
        res.contentType('application/json');

        // Verify there is an ID first
        if (req.params.id) {
            // Check to see if the fullTree = true query param was set
            if (req.query.fullTree && req.query.fullTree === 'true') {
                me.dataAccess.getDeploymentPCRTypesFullTree(req.params.id, function (err, response) {
                    if (err) {
                        // TODO kgomes: handle this error
                    } else {
                        // Send the results
                        res.json(response);
                    }
                });
            } else if (req.query.byTime && req.query.byTime === 'true') {
                me.dataAccess.getDeploymentPCRsByTime(req.params.id, function (err, response) {
                    if (err) {
                        // TODO kgomes: handle this error
                    } else {
                        // Send the results
                        res.json(response);
                    }
                });
            } else {
                me.dataAccess.getDeploymentPCRTypes(req.params.id, function (err, response) {
                    if (err) {
                        // TODO kgomes: handle this error
                    } else {
                        // Send the results
                        res.json(response);
                    }
                });
            }
        } else {
            logger.warn("No ID specified in getDeploymentPCRTypes");
        }
    }

//    this.getDeploymentPCRRunNames = function (req, res) {
//        // Set the content type to JSON
//        res.contentType('application/json');
//
//        // Verify there is an ID and pcrType first
//        if (req.params.id && req.params.pcrType) {
//            me.dataAccess.getDeploymentPCRRunNames(req.params.id, req.params.pcrType, function (err, response) {
//                if (err) {
//                    // TODO kgomes: handle this error
//                } else {
//                    // Send the results
//                    res.json(response);
//                }
//            });
//        } else {
//            logger.warn("Not all parameters specified in getDeploymentPCRRunNames");
//        }
//    }

    this.getDeploymentPCREpochSeconds = function (req, res) {
        // Set the content type to JSON
        res.contentType('application/json');

        // Verify there is an ID and pcrType first
        if (req.params.id && req.params.pcrType) {
            me.dataAccess.getDeploymentPCREpochSeconds(req.params.id, req.params.pcrType, req.params.columnName,
                function (err, response) {
                    if (err) {
                        // TODO kgomes: handle this error
                    } else {
                        // Send the results
                        res.json(response);
                    }
                });
        } else {
            logger.warn("Not all parameters specified in getDeploymentPCREpochSeconds");
        }
    }

    this.getDeploymentPCRColumnNames = function (req, res) {
        // Set the content type to JSON
        res.contentType('application/json');

        // Verify there are correct params
        if (req.params.id && req.params.pcrType) {
            me.dataAccess.getDeploymentPCRColumnNames(req.params.id, req.params.pcrType,
                function (err, response) {
                    if (err) {
                        // TODO kgomes: handle this error
                    } else {
                        // Send the results
                        res.json(response);
                    }
                });
        } else {
            logger.warn("Not all parameters specified in getDeploymentPCRColumnNames");
        }
    }
    this.getDeploymentPCRDataRecords = function (req, res) {
        // Set the content type to JSON
        res.contentType('application/json');

        // Grab the sortBy query param if it exists
        var sortBy = req.query.sortBy;

        // Verify there are correct params
        if (req.params.id && req.params.pcrType && req.params.columnName && req.params.epochSecs) {
            me.dataAccess.getDeploymentPCRDataRecords(req.params.id, req.params.pcrType, req.params.columnName,
                req.params.epochSecs, function (err, response) {
                    if (err) {
                        // TODO kgomes: handle this error
                    } else {
                        // Check for filter criteria
                        if (sortBy) {
                            // Index to sort by
                            var indexToSortBy = -1;
                            // By cycle number
                            if (sortBy === 'cycle') {
                                indexToSortBy = 0;
                            } else if (sortBy === 'time') {
                                indexToSortBy = 1;
                            } else if (sortBy === 'temp') {
                                indexToSortBy = 2;
                            }
                            if (indexToSortBy >= 0) {
                                var newDataRecords = [];
                                for (var i = 0; i < response.length; i++) {
                                    newDataRecords.push([response[i][indexToSortBy], response[i][3]]);
                                }
                                res.json(newDataRecords)
                            } else {
                                // Send the results
                                res.json(response);
                            }
                        } else {
                            // Send the results
                            res.json(response);
                        }
                    }
                });
        } else {
            logger.warn("Not all parameters specified in getDeploymentPCRDataRecords");
        }
    }
}

// Export the factory method
exports.createDeploymentRouter = function (dataAccess, opts) {
    // Create the new DeploymentRouter
    return new DeploymentRouter(dataAccess, opts);
}