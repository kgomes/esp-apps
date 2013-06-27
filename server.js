// Read in the ESP application configuration
var espCfg = require('./cfg/esp_cfg.json');

// Set up the logging object
var log4js = require('log4js');

// Setup Dependencies
var connect = require('connect');
var express = require('express');
var io = require('socket.io');
var url = require('url');
var port = (process.env.PORT || 8081);

// Application libraries
var dataAccess = require('./dataAccess').dataAccess;

// The event handler for the application
var EventHandler = require('./EventHandler').EventHandler;

// The FTP sync object
var ftpsync = require('./ftpsync').ftpsync;

// Use a file appender
log4js.loadAppender('file');
log4js.addAppender(log4js.appenders.file('logs/server.log'), 'server');

// Grab the logger
var logger = log4js.getLogger('server');

// Set the default logging level from the config
logger.setLevel(espCfg["logger_levels"]["server"]);

// Log the configuration at startup
logger.info("Staring up ESP Web Application Server and using base directory of " + espCfg["espdir"]);
logger.info("CouchDB\n->Host: " + espCfg["couchdb"]["host"] + "\n->Port: " + espCfg["couchdb"]["port"] +
    "\n->SSL?: " + espCfg["couchdb"]["ssl"] + "\n->Username: " + espCfg["couchdb"]["username"] +
    "\n->Database: " + espCfg["couchdb"]["database"]);
logger.info("PostgreSQL\n->Protocol: " + espCfg["postgresql"]["protocol"] + "\n->Host: " +
    espCfg["postgresql"]["host"] + "\n->Port: " + espCfg["postgresql"]["port"] + "\n->Username: " +
    espCfg["postgresql"]["username"] + "\n->Database: " + espCfg["postgresql"]["database"]);

// The directory where the esp applications and data live
var espdir = espCfg["espdir"];

// Connect to the data sources through the access object
var da = new dataAccess(espCfg["couchdb"]["host"], espCfg["couchdb"]["port"], espCfg["couchdb"]["ssl"],
    espCfg["couchdb"]["username"], espCfg["couchdb"]["password"], espCfg["couchdb"]["database"],
    espCfg["postgresql"]["protocol"], espCfg["postgresql"]["host"], espCfg["postgresql"]["port"],
    espCfg["postgresql"]["username"], espCfg["postgresql"]["password"], espCfg["postgresql"]["database"]);

// Create the ftp object
var ftp = new ftpsync(espCfg["logger_levels"]["ftpsync"]);

// Setup Express server
var server = express.createServer();

// Set up the 'all environment' configuration
server.configure(function () {
    server.use(connect.bodyParser());
    server.use(express.cookieParser());
    server.use(express.session({ secret: "shhhhhhhhh!"}));
    server.use(connect.static(__dirname + '/static'));
    server.use(server.router);
});

// Setup the error handler on the server
server.error(function (err, req, res, next) {
    if (err instanceof NotFound) {
        console.log("File not found: ");
        console.log(err);
    } else {
        console.log(err);
    }
});

///////////////////////////////////////////
//              Routes                   //
///////////////////////////////////////////
// A route for ancillary data
server.get('/ancdata', function (req, res) {
    logger.debug("/ancdata called");

    // Grab the URL params
    var url_parts = url.parse(req.url, true);
    var query = url_parts.query;

    // Look for 'sourceid', 'starttime', 'endtime'
    var sourceId = query.sourceid;
    var startTime = query.starttime;
    var endTime = query.endtime;
    var format = query.format;
    logger.debug(sourceId + "," + startTime + "," + endTime + "," + format);

    // Set the response to JSON
    res.contentType('application/json');

    // Make sure we have a source ID that is a number
    var sourceIDInt = null;
    if (sourceId) {
        try {
            sourceIDInt = parseInt(sourceId);
            logger.debug("Source ID int = " + sourceIDInt);
        } catch (error) {
            logger.warn("Could not convert sourceid " + sourceId + " to integer");
        }
    }

    // TODO validate the timestamps
    if (sourceIDInt) {
        logger.debug("Going to the DB");
        da.getAncillaryData(sourceIDInt, startTime, endTime, format, function (err, data) {
            logger.debug("data access replied");
            if (err) {
                logger.error("Error on reply");
                logger.error(err)
                res.send("[]");
            } else {
                res.send(JSON.stringify(data));
            }
        });
    } else {

        // Now send the response
        res.send("[]");
    }
});

// A route for returning the list of deployments
server.get('/deployments', function (req, res) {
    logger.trace("/deployments called");
    da.getAllDeployments(function (err, response) {
        res.json(response);
    });
});

server.get('/deployments/names', function (req, res) {
    logger.debug("Get deployment names called");

    da.getDeploymentNames(function (err, response) {
        if (err) {
            // TODO handle the error back to caller
        } else {
            logger.debug("Got response:");
            logger.debug(response);
            res.json(response);
        }
    })
});

// This is a method to get the list of ESP names that have deployments with the given name
server.get('/deployments/espNamesInDeployment', function (req, res) {
    logger.debug("Called get espNamesInDeployment with deployment " + req.query.key);
    // Got a request to get the list of ESP names in a deployment
    da.getESPNamesInDeployment(req.query.key, function(err, response){
        if (err){
            // TODO handle the error
        } else {
            logger.debug("Got the response");
            res.send(response);
        }
    });
});

// This route takes in a deployment name off the parameters list and then grabs all
// deployments by that name
server.get('/deployments/getByName', function (req, res) {
    logger.debug("Called getByName with deployment " + req.query.key);

    // Got a request to get the list deployments with a certain name
    da.getDeploymentsByName(req.query.key, function(err, response){
        if (err){
            logger.error("Error trying to get deployments by name " + req.query.key);
            logger.error(err);
        } else {
            logger.debug("Should have the list of deployments");
            logger.debug(response);
            res.json(response);
        }
    });
});

//A Route for Creating a 500 Error (Useful to keep around)
server.get('/500', function (req, res) {
    throw new Error('This is a 500 Error');
});

//The 404 Route (ALWAYS Keep this as the last route)
server.get('/*', function (req, res) {
    throw new NotFound;
});

// Start listening on a port
server.listen(port);
logger.info('Listening on http://0.0.0.0:' + port);

// Setup Socket.IO on the express server
var io = io.listen(server);

// Create an event handler
new EventHandler(io, ftp, da);

// Go ahead and call the first processing of deployments since we are in start
try {
    da.getOpenDeployments(function (err, deployments) {
        for (var i = 0; i < deployments.length; i++) {
            processDeployment(deployments[i]);
        }
    });
} catch (error) {
    logger.error("Error caught from initial processing of open deployments");
    logger.error(error);
}

// Set up the interval to walk through the list of deployments
// for processing
setInterval(function () {
    try {
        // Load the deployment data
        da.getOpenDeployments(function (err, deployments) {
            for (var i = 0; i < deployments.length; i++) {
                processDeployment(deployments[i]);
            }
        });
    } catch (error) {
        logger.error("Error caught trying to process deployments");
        logger.error(error);
    }
}, 60000);

///////////////////////////////////////////
// Function definitions                  //
///////////////////////////////////////////

// The function to take in deployment information, connect
// up to the FTP server and process the data
function processDeployment(deployment) {
    logger.debug("Processing deployment " + deployment.name + " of ESP " + deployment.esp.name);

    // Check deployment parameters and process the directory recursively
    if (deployment &&
        deployment.esp &&
        deployment.esp.ftp_host &&
        deployment.esp.ftp_port &&
        deployment.esp.name &&
        deployment.name &&
        deployment.esp.ftp_working_dir &&
        espdir) {
        try {
            ftp.syncDeployment(deployment, espdir, function (error) {
                if (error) {
                    logger.error("Error returned from FTP sync for deployment " + deployment.name);
                    logger.error(error);
                } else {
                    logger.debug("Done processing deployment " + deployment.name);
                }
            });
        } catch (error) {
            logger.error("Error trapped while processing deployment " + deployment.name +
                " of esp " + deployment.esp.name);
            logger.error(error);
        }
    } else {
        logger.warn("Deployment " + deployment.name +
            " did not have enough information to be synchronized");
    }
}

// This is the function that is used when a resource is not found
function NotFound(msg) {
    this.name = 'NotFound';
    Error.call(this, msg);
    Error.captureStackTrace(this, arguments.callee);
}
