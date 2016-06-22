// Import the necessary libraries
var express = require("express");
var mongoConnection = require('../modules/esp-mongo-connection');

// Configure logging
var log4js = require('log4js');
log4js.loadAppender('file');

// Create a logger
var logger = log4js.getLogger('api-router-v1');


// Define the API router
function APIRouter(opts, logDir) {

    // If the opts specifies the logging level, set it
    if (opts.loggerLevel) {
        logger.setLevel(opts.loggerLevel);
    }

    // Set the log directory
    if (logDir) {
        log4js.addAppender(log4js.appenders.file(logDir + '/api-router-v1.log'), 'api-router-v1');
    }

    // Create connection interface to the MongoDB instance
    var mongoConnectionObject =
        mongoConnection.createMongoConnection(opts.mongodbOptions, logDir);

    // Grab the Source model object
    var Source = mongoConnectionObject.getSourceModel();

    // Create a router
    var router = express.Router();

    // ****************************************************************************** //
    //                           Routes for the Source objects                           //
    // ****************************************************************************** //
    router.get('/sources', function (req, res) {

        // Grab the response skeleton first
        var responseJSON = generateJSONResponseSkeleton(req);

        // Add the method
        responseJSON['method'] = 'sources.get';

        // Find all esps
        Source.find(function (err, sources) {

            if (sources){
                logger.debug(sources);
            }
            // Now add the data
            if (err) {
                // Add the error to the JSON response
                responseJSON['error'] = err;
            } else {

                // Attach the data
                responseJSON['data'] = {
                    kind: 'source',
                    fields: '_id,name,mode,logFile,ftpHost,ftpPort,ftpUsername,ftpPassword,ftpWorkingDirectory',
                    items: sources
                }
            }
            // Send the response
            res.json(responseJSON);
        });
    });

    // Post method to create new ESP entries
    router.post('/esps', function (req, res) {
        // First create a response skeleton
        var responseJSON = generateJSONResponseSkeleton(req);

        // Add the method
        responseJSON['method'] = 'esps.post';

        // First thing to do is make sure there is a body
        if (!req.body) {
            responseJSON['error'] = {
                message: "No body was specified in the POST"
            };
            res.json(responseJSON);
        } else {
            // Now see there is a name in the post data
            if (!req.body.name) {
                responseJSON['error'] = {
                    message: "No name property for the ESP was specified"
                };
                res.json(responseJSON);
            } else {
                // Check to see if there is one by that name already
                ESP.find({name: req.body.name}, function (err, esp) {
                    if (err) {
                        responseJSON['error'] = {
                            message: "Something went wrong looking for an existing ESP with the name " + req.body.name +
                            err
                        };
                        res.json(responseJSON);
                    } else {
                        if (esp) {
                            responseJSON['error'] = {
                                message: "An ESP with the name " + req.body.name + " already exists."
                            };
                            res.json(responseJSON);
                        } else {
                            // No ESP was found, so create a new one
                            // Create a new ESP
                            var newESP = new ESP({name: req.body.name});

                            // Now check for and fill in other fields
                            if (req.body.mode) {
                                newESP['mode'] = req.body.mode;
                            }
                            if (req.body.logFile) {
                                newESP['logFile'] = req.body.logFile;
                            }
                            if (req.body.ftpHost) {
                                newESP['ftpHost'] = req.body.ftpHost;
                            }
                            if (req.body.ftpPort) {
                                newESP['ftpPort'] = req.body.ftpPort;
                            }
                            if (req.body.ftpUsername) {
                                newESP['ftpUsername'] = req.body.ftpUsername;
                            }
                            if (req.body.ftpPassword) {
                                newESP['ftpPassword'] = req.body.ftpPassword;
                            }
                            if (req.body.ftpWorkingDirectory) {
                                newESP['ftpWorkingDirectory'] = req.body.ftpWorkingDirectory;
                            }

                            // Now save it
                            newESP.save(function (err) {
                                if (err) {
                                    logger.error("Error saving the ESP: ", err);
                                    responseJSON['error'] = {
                                        message: "No name property for the ESP was specified"
                                    };
                                    res.json(responseJSON);
                                } else {
                                    res.json(responseJSON);
                                }
                            });

                        }
                    }
                });
            }
        }
    });

    // ****************************************************************************** //
    //                       Routes for the DataContainer objects                     //
    // ****************************************************************************** //
    // The method to create new DataContainers
    router.post('/data-containers', function(req, res){
        
    });
    
    // The method to return the router
    this.getRouter = function () {
        return router;
    }

}

// This function will generate the skeleton for a JSON response to the given request
function generateJSONResponseSkeleton(req) {
    // The object to return
    var skeleton = {
        "apiVersion": "1.0",
        "params": {}
    };

    // Check for a context
    if (req.query.context) {
        skeleton['context'] = req.query.context;
    }

    // Loop over the query params
    for (var param in req.query) {
        skeleton['params'][param] = req.query[param];
    }

    // Return it
    return skeleton;
}

// Export the method to create a new Router
exports.createAPIRouter = function (opts, logDir) {
    return new APIRouter(opts, logDir);
};