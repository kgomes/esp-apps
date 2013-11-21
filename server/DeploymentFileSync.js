// Grab all dependencies
var util = require('util');
var fs = require('fs');
var path = require('path');
var im = require('imagemagick');
var eventEmitter = require('events').EventEmitter;

// Create the FTP client from the FTP library that
// can be used to create connections
var JSFtp = require('jsftp');

// Configure logging
var log4js = require('log4js');
log4js.loadAppender('file');
log4js.addAppender(log4js.appenders.file('./logs/DeploymentFileSync.log'), 'DeploymentFileSync');

// Grab the logger
var logger = log4js.getLogger('DeploymentFileSync');

// Inherit event emitter functionality
util.inherits(DeploymentFileSync, eventEmitter);

// The constructor function
function DeploymentFileSync(opts) {

    // Grab a handle for scoping
    var me = this;

    // Set the log level if sent in
    if (opts.loggerLevel) {
        logger.setLevel(opts.loggerLevel);
    }

    // This is the array of deployments being processed
    var deploymentIDsInProcess = [];

    // This is the method that takes in a Deployment and a base directory and syncronizes the
    // files that are on the remote server to the local base directory
    this.syncDeployment = function (deployment, basedir, callback) {
        logger.debug("Starting syncDeployment with deployment " + deployment.name + " and basedir " + basedir);

        // Check to see if it is in the array of processing deployments
        if (deploymentIDsInProcess.indexOf(deployment._id) !== -1) {
            logger.debug('Deployment ' + deployment.name + ' is already queued for FTP sync');
            if (callback)
                callback(null);
        } else {
            // Put it in the queue
            logger.info("Adding Deployment ID: " + deployment._id);
            deploymentIDsInProcess.push(deployment._id);
            logger.debug("Added deployment with ID of " + deployment._id + " to list of deployments to sync");
            logger.debug("deploymentIDsInProcess after insert:", deploymentIDsInProcess);

            // Create the FTP client that the deployment will use
            var ftpClient = new JSFtp({
                host: deployment.esp.ftpHost,
                port: deployment.esp.ftpPort,
                user: deployment.esp.ftpUsername,
                pass: deployment.esp.ftpPassword
            });

            logger.trace("ftpClient ", ftpClient);
            logger.trace("ftpClient.socket ", ftpClient.socket);
            // Add event handlers
            ftpClient.on('progress', function (progress) {
                logger.debug("FTP " + progress.action + " " + progress.filename + "->" + progress.transferred);
            });
            ftpClient.on('timeout', function (timeout) {
                logger.error('Timeout: ', timeout);
            });
            ftpClient.on('connect', function (connect) {
                logger.trace('Connect: ', connect);
            });
            ftpClient.on('error', function (error) {
                logger.error('Error: ', error);
                // Remove the deployment ID from the list
                removeIDFromList(deployment._id);

                logger.error("Will close FTP client");
                ftpClient.raw.quit(function (err, data) {
                    logger.error("err on FTPClient quit:", err);
                    logger.error("data on FTPClient quit:", data);
                    if (callback)
                        callback(error);
                });
            });
            ftpClient.on('data', function (data) {
                logger.trace('Data: ', data);
                if (data.code === 226) ftpClient.raw['stat'](function (res) {
                    logger.trace("stat response: ", res);
                });
            });
            ftpClient.on('close', function (close) {
                logger.trace('Close: ', close);
            });
            ftpClient.on('end', function (end) {
                logger.trace('End: ', end);
            });
            ftpClient.on('cmdSend', function (cmdSend) {
                logger.trace('CmdSend: ', cmdSend);
            });

            // Make sure it was created
            if (ftpClient) {

                // Grab the local directory
                var localDirectory = path.join(basedir, 'instances', deployment.esp.name, 'deployments',
                    deployment.name, 'data', 'raw');

                // The array of files to sync
                var filesToSync = {};

                // Populate the array of files to sync
                getListOfFilesToSync(localDirectory, deployment.esp.ftpWorkingDir, ftpClient, filesToSync,
                    function (error) {
                        // Log an error if one was found
                        if (error) {
                            logger.error("Error returned in callback from getListOfFilesToSync:", error);
                        }

                        // The array of the file that were sync'd successfully
                        var filesThatWereSyncd = {};

                        logger.debug('For deployment ' + deployment.name + ' of ESP ' + deployment.esp.name +
                            ', the files that need syncing are: ', filesToSync);
                        syncFiles(deployment, filesToSync, ftpClient, filesThatWereSyncd, function (error) {
                            // Log the error if found
                            if (error) {
                                logger.error("Error returned from call to sync files: ", error);
                            }

                            // This is where I need to now go through the list of files that were sync'd and
                            // emit events as to which ones were synchronized
                            logger.debug("Done with sync and " + Object.keys(filesThatWereSyncd).length +
                                " files were successfully synchronized");
                            for (syncdLocalFile in filesThatWereSyncd) {
                                // Send notification that local file was updated
                                me.emit('ftpFileUpdated', {
                                    deployment: deployment,
                                    file: syncdLocalFile
                                });
                            }


                            // Remove the ID from the list of deployments to process
                            removeIDFromList(deployment._id);

                            // Send the callback
                            if (callback)
                                callback(error);
                        });
                    });
            } else {
                logger.warn("No FTPClient was created");

                // Remove the ID from the list
                removeIDFromList(deployment._id);

                // Send error to the callback
                if (callback)
                    callback(new Error("No FTP client was created for deployment " + deployment.name));
            }

        }
    }

    // This method takes in a local directory and a remote directory
    function getListOfFilesToSync(localDirectory, remoteDirectory, ftpClient, filesToSync, callback) {
        logger.debug("getListOfFilesToSync: Local: " + localDirectory + ", Remote: " + remoteDirectory);

        // We first need to make sure the base local directory is built
        var pathElements = localDirectory.split(path.sep);
        try {
            var growPath = '';
            for (var i = 0; i < pathElements.length; i++) {
                growPath = path.normalize(growPath + path.sep + pathElements[i]);
                if (!fs.existsSync(growPath)) {
                    fs.mkdirSync(growPath);
                }
            }
        } catch (error) {
            logger.error("Error caught trying to make local directory:", error);
        }

        // Make sure the local directory exists
        if (fs.existsSync(localDirectory)) {
            try {
                // Get the remote listing of the directory
                ftpClient.ls(remoteDirectory, function (err, res) {
                    // Check for an error
                    if (err) {
                        logger.error("Error during listing of remote directory " + remoteDirectory + ":", err);
                        if (callback)
                            callback(err);
                    } else {
                        // The number of files to handle
                        var numFiles = res.length;

                        // If there are no files, just execute the callback
                        if (numFiles === 0) {
                            logger.debug("Empty directory, just executing callback");
                            if (callback)
                                callback(null);
                        }

                        // If here, loop over the listing of files
                        res.forEach(function (file) {

                            // A bit of a hack, but grab a remote directory name with ending /
                            var remoteDirectoryWithSlash = remoteDirectory;
                            if (remoteDirectoryWithSlash.substring(remoteDirectoryWithSlash.length - 1) !== '/') {
                                remoteDirectoryWithSlash += '/';
                            }

                            // If it is a directory, recursively call syncDirectory
                            if (file.type === 1) {
                                // Now sync remote and local directory recursively
                                getListOfFilesToSync(path.join(localDirectory, file.name),
                                    remoteDirectoryWithSlash + file.name, ftpClient,
                                    filesToSync, function (err) {
                                        // Log the error if there is one
                                        if (err) {
                                            logger.error("Error in callback during sync of remote directory " +
                                                remoteDirectoryWithSlash + file.name);
                                        }

                                        // Decrement the counter
                                        numFiles--;

                                        // Check for exit condition
                                        if (numFiles <= 0) {
                                            logger.debug('Done processing files from remote directory ' +
                                                remoteDirectory);
                                            if (callback)
                                                callback(null);
                                        }
                                    });
                            } else {
                                // It is a file.  First thing to do is to see if the local file exists
                                var localFile = path.join(localDirectory, file.name);
                                if (fs.existsSync(localFile)) {
                                    // Grab the file statistics
                                    var stat = fs.statSync(localFile);

                                    // Check to see if the file size if different
                                    if (parseInt(file.size) !== stat.size) {
                                        logger.debug('Comparing sizes of remote ' + file.size +
                                            ' to local ' + stat.size);
                                        logger.debug('Local file ' + localFile + ' size is different, will download');
                                        filesToSync[localFile] = (remoteDirectory + '/' +
                                            file.name).replace(new RegExp('//', 'g'), '/');
                                    }

                                    // Decrement the counter
                                    numFiles--;

                                    // Check for exit condition
                                    if (numFiles <= 0) {
                                        logger.debug('Done processing files from remote directory ' + remoteDirectory);
                                        if (callback)
                                            callback(null);
                                    }
                                } else {
                                    logger.debug('Local file ' + localFile + ' does not exist, marking for sync ...');
                                    filesToSync[localFile] = (remoteDirectory + '/' +
                                        file.name).replace(new RegExp('//', 'g'), '/');

                                    // Decrement the counter
                                    numFiles--;

                                    // Check for exit condition
                                    if (numFiles <= 0) {
                                        logger.debug('Done processing files from remote directory ' + remoteDirectory);
                                        if (callback)
                                            callback(null);
                                    }
                                }
                            }
                        });
                    }
                });
            } catch (error) {
                logger.error("Error caught trying to get remote listing of directory " +
                    remoteDirectory + ":", error);
                if (callback)
                    callback(error);
            }
        } else {
            logger.warn("The local directory " + localDirectory + " appears to have not been created successfully");
            if (callback)
                callback(new Error("The local directory " + localDirectory +
                    " appears to have not been created successfully"));
        }
    };

    // This is a function that takes in an object which has keys of local files and properties of
    // remote files that need to be sync'd.  It is called recursively
    function syncFiles(deployment, filesToSync, ftpClient, filesThatWereSyncd, callback) {
        logger.debug('There are ' + Object.keys(filesToSync).length + ' files to sync');
        // Check for exit condition
        if (Object.keys(filesToSync).length === 0) {
            logger.debug("Since no more file to process, will close the FTP connection");
            // Close the FTP client as there are no more file to process
            ftpClient.raw.quit(function (err, data) {
                logger.debug("err on FTPClient quit:", err);
                logger.debug("data on FTPClient quit:", data);
                if (callback)
                    callback(null);
            });
        } else {
            // Grab the local file name (key)
            var localFile = Object.keys(filesToSync)[0];
            var remoteFile = filesToSync[localFile];
            logger.debug("Will sync remote: " + remoteFile + " to local " + localFile);

            // Now remove the property
            delete filesToSync[localFile];

            // Just make sure we have a remote file specified
            if (remoteFile) {
                try {
                    // Create the write stream to the local file
                    var localFileWriteStream = fs.createWriteStream(localFile, {'flags': 'w'});

                    // Write a finish handler
                    localFileWriteStream.on('finish', function () {
                        logger.debug("File " + localFile + " write finished");
                        // Now if the file is a TIFF image, for browser support we need to create
                        // a version that is a JPG.
                        if (localFile.indexOf('.tif') !== -1) {
                            logger.debug('The downloaded file was a tif, let\'s create a JPEG version');
                            var jpgFilePath = localFile.replace(path.sep + 'data' + path.sep + 'raw' +
                                path.sep + 'esp', path.sep + 'data' + path.sep + 'processed' + path.sep +
                                'esp').replace('.tif', '.jpg');
                            logger.debug('JPG Path will be ' + jpgFilePath);

                            // Let's make sure the directory exists
                            var pathSegments = jpgFilePath.split(path.sep);

                            // Loop over the array (except the last which is the file name) to build the path
                            var incrementalPath = '';
                            try {
                                for (var i = 0; i < pathSegments.length - 1; i++) {
                                    // the new path segment
                                    if (pathSegments[i] && pathSegments[i] !== '') {
                                        // Build the path
                                        incrementalPath += path.normalize(path.sep + pathSegments[i]);

                                        // Create it if it does not exist
                                        var incrementalExists = fs.existsSync(incrementalPath);
                                        if (!incrementalExists) {
                                            fs.mkdirSync(incrementalPath);
                                        }
                                    }
                                }
                            } catch (error) {
                                logger.error('Error caught trying to ensure directory ' + incrementalPath +
                                    ' exists');
                                logger.error(error);
                            }

                            // Convert it
                            try {
                                im.convert([localFile, jpgFilePath], function (err, stdout) {
                                    logger.debug("IM:Conversion done");
                                    logger.debug("IM:Err", err);
                                    logger.debug("IM:stdout", stdout);
                                });
                            } catch (error) {
                                logger.error("Error caught trying to create JPG version of TIFF");
                            }
                        }
                    });

                    // Open the write stream
                    localFileWriteStream.once('open', function (fd) {
                        // Open the FTP socket and write to the file
                        ftpClient.get(remoteFile, function (err, socket) {
                                // Check for error first
                                if (err) {
                                    logger.error("Error trying to get socket for streaming remote file " +
                                        remoteFile + ":", err);
                                    // Even though there was an error, we will recursively keep going
                                    syncFiles(deployment, filesToSync, ftpClient, filesThatWereSyncd, callback);
                                } else {

                                    logger.debug("Got socket for remote file " + remoteFile);

                                    // Set up the handler to handle the data and have it write to the file
                                    socket.on("data", function (d) {
                                        localFileWriteStream.write(d);
                                    });

                                    // Set up the handler to deal with the socket closing
                                    socket.on("close", function (hadErr) {
                                        logger.debug("Socket for file " + remoteFile + " is closed");
                                        if (hadErr)
                                            logger.error('There was an error streaming remote file ' + remoteFile, hadErr);

                                        // Close the write
                                        localFileWriteStream.end(function () {
                                            logger.debug("Writing to file " + localFile + " ended");
                                        });

                                        // Add the file to the object that tracks which files were successfully
                                        // sync'd over FTP
                                        filesThatWereSyncd[localFile] = remoteFile;

                                        // We recursively sync the files
                                        syncFiles(deployment, filesToSync, ftpClient, filesThatWereSyncd, callback);
                                    });

                                    // Start the streaming!
                                    socket.resume();
                                }
                            }
                        );
                    });
                } catch (err) {
                    logger.debug("Error caught in FTP get:", err);
                    // We still need to call the recurse to move on
                    syncFiles(deployment, filesToSync, ftpClient, filesThatWereSyncd, callback);
                }
            } else {
                // The remote file was empty, nothing to do, just recurse
                syncFiles(deployment, filesToSync, ftpClient, filesThatWereSyncd, callback);
            }
        }
    };

    // This is the function to remove the deployment ID from the list of IDs to process
    function removeIDFromList(deploymentID) {
        logger.info("Removing deployment ID " + deploymentID);
        logger.debug("Will remove deployment ID " + deploymentID + " from list of IDs to process");
        // Remove it from the queue
        deploymentIDsInProcess.splice(deploymentIDsInProcess.indexOf(deploymentID), 1);
        logger.debug("deploymentIDsInProcess after removal:", deploymentIDsInProcess);
    };
}

// Export the factory method
exports.createDeploymentFileSync = function (opts) {
    return new DeploymentFileSync(opts);
}