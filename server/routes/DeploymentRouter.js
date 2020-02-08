// Configure logging
var log4js = require('log4js');
log4js.loadAppender('file');

// Grab the logger
var logger = log4js.getLogger('DeploymentRouter');

// The moment library
var moment = require('moment');

// Grab the model objects
var Deployment = require('../models/Deployment');

// The constructor function
function DeploymentRouter(dataAccess, opts, logDir) {
    // If the options specify a logger level, set it
    if (opts.loggerLevel) {
        logger.setLevel(opts.loggerLevel);
    }
    logger.debug('Creating DeploymentRouter');

    // Set log directory
    log4js.addAppender(log4js.appenders.file(logDir + '/DeploymentRouter.log'), 'DeploymentRouter');

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

        // Verify there is an ID first
        if (req.params.id) {
            // Set a parameter if the caller wants the full return
            var returnFull = false;
            if (req.query.returnFull && req.query.returnFull === 'true') {
                returnFull = true;
            }
            // See if the caller wanted it in summary form
            var returnSummary = false;
            if (req.query.returnSummary && req.query.returnSummary === 'true') {
                returnFull = true;
                returnSummary = true;
            }
            logger.debug("Will look for deployment with ID " + req.params.id);
            me.dataAccess.getDeploymentByID(req.params.id, returnFull, function (err, response) {
                if (err) {
                    // TODO kgomes: handle this error
                    logger.error("Error trying to look up deployment with ID " + req.params.id);
                } else {
                    // See if the summary is to be returned
                    if (returnSummary) {
                        logger.debug("Will provide summary for deployment with ID " + req.params.id);

                        try {
                            // Construct the array to be returned
                            var arrayToReturn = [
                                ["Protocol", "Start Date", "Start Date (Julian)",
                                    "Sample Start Date", "Sample Start Date (Julian)",
                                    "Sample End Date", "Sample End Date (Julian)", "Time To Sample (hh:mm:ss)",
                                    "Target Volume (ml)", "Actual Volume (ml)", "Difference (ml)",
                                    "WCR Sample Start Date", "WCR Sample Start Date (Julian)",
                                    "WCR Sample End Date", "WCR Sample End Date (Julian)",
                                    "WCR Time To Sample (hh:mm:ss)", "WCR Target Volume (ml)",
                                    "WCR Actual Volume (ml)", "WCR Difference (ml)"
                                ]
                            ];
                            // First thing to do is combine all the timestamps for the protocols, samples and images
                            var timestamps = Object.keys(response.samples);
                            timestamps = timestamps.concat(Object.keys(response.protocolRuns), Object.keys(response.images));

                            // Now sort them
                            timestamps.sort();

                            // Create a line that will be filled in with info from the response
                            var newline = [];

                            // A counter to keep track of the number of images
                            var numImages = 0;

                            // A placeholder to hang on to the most recent
                            var mostRecentProtocolRun = null;

                            // Now loop over those timestamps
                            logger.debug("Will loop over timestamps ...");
                            for (var i = 0; i < timestamps.length; i++) {
                                var currentTimestamp = timestamps[i];
                                // Try to grab any protocol run, sample or image at that timestamp
                                var protocolRun = response.protocolRuns[currentTimestamp];
                                var sample = response.samples[currentTimestamp];
                                var image = response.images[currentTimestamp];

                                // Check to see if there is a protocol run
                                if (protocolRun) {
                                    logger.debug("Entry at timestamp " + currentTimestamp + " is a protocolRun");
                                    // Set it as the most recent protocol run
                                    mostRecentProtocolRun = protocolRun;

                                    // If there is data from the previous protocol run, push that onto the response array
                                    if (newline.length > 0) {
                                        arrayToReturn.push(newline);
                                    }

                                    // Create a date from the unix seconds
                                    var prStartDate = moment.unix(currentTimestamp / 1000);

                                    // Calculate Julian date
                                    var prJulianDate = (parseInt(prStartDate.format('DDD')) + (((prStartDate.hours() * 60 * 60) +
                                    (prStartDate.minutes() * 60) + (prStartDate.seconds())) / 86400)).toFixed(2);

                                    // Now start a new line with the protocol name and start time and date
                                    newline = [protocolRun.name, prStartDate.format('YYYY-MM-DD HH:mm:ss Z'),
                                        prJulianDate];

                                    // Clear the image counter
                                    numImages = 0;
                                }

                                // If it's a sample
                                if (sample) {
                                    logger.debug("Entry at timestamp " + currentTimestamp + " is a sample");
                                    logger.debug(sample);
                                    // Create a sample start date from the unix seconds
                                    var sampStartDate = moment.unix(currentTimestamp / 1000);
                                    logger.debug("sampStartDate = " + sampStartDate);

                                    // Calculate Julian date
                                    var sampJulianStartDate = (parseInt(sampStartDate.format('DDD')) + (((sampStartDate.hours() * 60 * 60) +
                                    (sampStartDate.minutes() * 60) + (sampStartDate.seconds())) / 86400)).toFixed(2);
                                    logger.debug("sampJulianStartDate = " + sampJulianStartDate);

                                    // Calculate end date if there is one and the sample duration
                                    var sampEndDate;
                                    var sampJulianEndDate;
                                    var sampDuration;
                                    if (sample.endts) {
                                        sampEndDate = moment.unix(sample.endts / 1000);

                                        // Calculate Julian date
                                        sampJulianEndDate = (parseInt(sampEndDate.format('DDD')) + (((sampEndDate.hours() * 60 * 60) +
                                        (sampEndDate.minutes() * 60) + (sampEndDate.seconds())) / 86400)).toFixed(2);
                                        sampDuration = moment.duration(sample.endts - currentTimestamp);
                                    }
                                    logger.debug("sampEndDate = " + sampEndDate);
                                    logger.debug("sampJulianEndDate = " + sampJulianEndDate);
                                    logger.debug("sampDuration = " + sampDuration);

                                    // Now, we need to check and see if it is a DWSM sample
                                    if (sample.dwsm) {
                                        // We should clear the most recent protocol run so that the next set of
                                        // samples does not get tacked on to any particular protocol run
                                        mostRecentProtocolRun = null;
                                    }

                                    // Now check to see if there is a most recent protocol run.  If there is not, we
                                    // should start a new row to indicate this is a sample outside of any particular
                                    // protocol run.
                                    if (mostRecentProtocolRun === null) {
                                        // If there is data from the previous line, push that onto the response array
                                        if (newline.length > 0) {
                                            arrayToReturn.push(newline);
                                        }

                                        // If this is a DWSM, write that as the protocol, otherwise, just put
                                        // other sample
                                        if (sample.dwsm) {
                                            newline = ['Sample-DWSM', '', ''];
                                            // Clear the image counter
                                            numImages = 0;
                                        } else {
                                            newline = ['Sample-Other', '', ''];
                                            // Clear the image counter
                                            numImages = 0;
                                        }
                                    }

                                    // Now we just need to figure out if this is the first sample, or a linked archive
                                    // sample
                                    if (mostRecentProtocolRun && mostRecentProtocolRun.archive && sample.actor === 'WCR') {
                                        // This is the combination that means it is a linked archive and should to in the
                                        // second set of columns
                                        newline[11] = sampStartDate.format('YYYY-MM-DD HH:mm:ss Z');
                                        newline[12] = sampJulianStartDate;
                                        if (sampEndDate) {
                                            newline[13] = sampEndDate.format('YYYY-MM-DD HH:mm:ss Z');
                                            newline[14] = sampJulianEndDate;
                                            newline[15] = sampDuration.hours() + ":" + sampDuration.minutes() + ":" + sampDuration.seconds();
                                        } else {
                                            newline[13] = '';
                                            newline[14] = '';
                                            newline[15] = '';
                                        }
                                        if (sample.targetVolume) {
                                            newline[16] = sample.targetVolume;
                                        } else {
                                            newline[16] = '';
                                        }
                                        if (sample.actualVolume) {
                                            newline[17] = sample.actualVolume;
                                        } else {
                                            newline[17] = '';
                                        }
                                        if (sample.targetVolume && sample.actualVolume) {
                                            newline[18] = sample.targetVolume - sample.actualVolume;
                                        } else {
                                            newline[18] = '';
                                        }
                                    } else {
                                        // This means it is not a linked archive and should go in the first column
                                        newline[3] = sampStartDate.format('YYYY-MM-DD HH:mm:ss Z');
                                        newline[4] = sampJulianStartDate;
                                        if (sampEndDate) {
                                            newline[5] = sampEndDate.format('YYYY-MM-DD HH:mm:ss Z')
                                            newline[6] = sampJulianEndDate;
                                            newline[7] = sampDuration.hours() + ":" + sampDuration.minutes() + ":" + sampDuration.seconds();
                                        } else {
                                            newline[5] = '';
                                            newline[6] = '';
                                            newline[7] = '';
                                        }
                                        if (sample.targetVolume) {
                                            newline[8] = sample.targetVolume;
                                        } else {
                                            newline[8] = '';
                                        }
                                        if (sample.actualVolume) {
                                            newline[9] = sample.actualVolume;
                                        } else {
                                            newline[9] = '';
                                        }
                                        if (sample.targetVolume && sample.actualVolume) {
                                            newline[10] = sample.targetVolume - sample.actualVolume;
                                        } else {
                                            newline[10] = '';
                                        }
                                    }
                                    logger.debug("New line:",newline);
                                }
                                // Now check for an image
                                if (image) {
                                    logger.debug("Entry at timestamp " + currentTimestamp + " is an image");
                                    // Bump the image counter
                                    numImages++;

                                    // Make sure the image header is there
                                    arrayToReturn[0][18 + numImages + numImages - 1] = "Image " + numImages + " Filename";
                                    arrayToReturn[0][19 + numImages + numImages - 1] = "Image " + numImages + " Exposure";

                                    // Add the image file name and exposure
                                    newline[18 + numImages + numImages - 1] = image.fullImagePath;
                                    newline[19 + numImages + numImages - 1] = image.exposure;
                                }
                            }

                            logger.debug("Done with protocol runs ...");

                            // Push the last record on to the results as the loop won't do it.
                            if (newline.length > 0) arrayToReturn.push(newline);

                            // Set the name of the file to download
                            res.setHeader('Content-disposition', 'inline; filename=' +
                                response.esp.name.replace(/\s+/g, '_') + '_' + response.name.replace(/\s+/g, '_') + '.csv');

                            // Now send the CSV data
                            res.csv(arrayToReturn);
                        } catch (ex) {
                            res.csv([]);
                        }
                    } else {
                        // Set the content type to JSON
                        res.contentType('application/json');

                        // Send the results
                        res.json(response);
                    }
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

    // This method handles creation of new deployments using JSON that was submitted
    // by the caller
    this.insertDeployment = function (req, res) {
        // The incoming body should be a JSON representation of a Deployment
        logger.debug('insertDeployment: incoming request body: ');
        logger.debug(req.body);

        // Create a Deployment object and deserialize the JSON data into that object
        // var newDeployment = new Deployment();
        // newDeployment.deserialize(req.body);
        // logger.debug('After converting to Deployment model object');
        // logger.debug(newDeployment);

        me.dataAccess.persistDeployment(req.body, function (err, result) {
            res.send('INSERT ME BABY!');
        });
    }

    // This method handles patch requests
    this.updateDeployment = function (req, res) {
        me.dataAccess.updateDeploymentByJSON(req.body);
        res.send('PATCH ME BABY!');
    }
}

// Export the factory method
exports.createDeploymentRouter = function (dataAccess, opts, logDir) {
    // Create the new DeploymentRouter
    return new DeploymentRouter(dataAccess, opts, logDir);
}