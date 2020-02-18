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

// Grab the logger
var logger = log4js.getLogger('DeploymentFileSync');

// Inherit event emitter functionality
util.inherits(DeploymentFileSync, eventEmitter);

// The constructor function
function DeploymentFileSync(opts, basedir, logDir) {

    // Grab a handle for scoping
    var me = this;

    // Set the log level if sent in
    if (opts.loggerLevel) {
        logger.setLevel(opts.loggerLevel);
    }

    // Set the log directory
    log4js.addAppender(log4js.appenders.file(logDir + '/DeploymentFileSync.log'), 'DeploymentFileSync');

    // A flag that indicates if a syncronization is underway
    var inProcess = false;

    // This is the array of deployments being processed
    var deploymentsToSync = [];

    // This is the base directory where all deployment files will be synchronized to locally
    var basedir = basedir;

    // This is the method that takes in a Deployment and synchronizes the
    // files that are on the remote server to the local base directory
    this.syncDeployment = function (deployment, callback) {
        logger.debug("syncDeployment called with deployment " + deployment.name + "(basedir=" + basedir + ")");

        // First check to see if the deployment is in the queue for processing
        if (checkForDeploymentInQueue(deployment)) {
            logger.debug("Deployment " + deployment.name + " already in queue for sync.");
            // Just callback to the caller
            if (callback)
                callback(null);
        } else {
            logger.debug("Deployment " + deployment.name + " not in queue, will be added for sync.");
            // Since it's not in the queue, add it
            deploymentsToSync.push(deployment);

            // Send the callback to the caller
            if (callback)
                callback(null);

            // Now call the method to sync a deployment off the queue
            syncDeploymentOffQueue();
        }
    }

    /**
     * This function simply checks to see if the deployment is already listed in the queue of deployments
     * to process.  It matches on deployment._id
     * @param deployment
     */
    function checkForDeploymentInQueue(deployment) {
        // The flag to indicate if the deployment is in the queue
        var inQueue = false;

        // Loop over the deployment queue
        for (var i = 0; i < deploymentsToSync.length; i++) {
            if (deploymentsToSync[i]._id === deployment._id)
                inQueue = true;
        }

        // Now return the flag
        return inQueue;
    }

    /**
     * This method checks to see if there is currently processing happening and if not, starts a new
     * synchronization if there are any deployment queued up
     */
    function syncDeploymentOffQueue() {
        // First check the flag.  If we are processing something, just ignore the call
        if (!inProcess) {
            logger.debug("syncDeploymentOffQueue called and nothing is processing");

            // First check to see if there is anything in the queue to process
            if (deploymentsToSync && deploymentsToSync.length > 0) {
                logger.debug("There are " + deploymentsToSync.length + " deployments left to sync");
                // First set the flag to say we are in process
                inProcess = true;

                // OK, let's just work with the first one in the queue
                var deploymentToSync = deploymentsToSync[0];
                logger.info("Synchronizing deployment " + deploymentToSync.name);

                // First create the object to track the files that will need synchronization
                var filesNeedingSync = {};

                // Next create the object that will track which files were actually syncronized
                var filesSynchronized = {};

                // Create the FTP client that will be used to sync search and sync files
                var ftpClient = new JSFtp({
                    host: deploymentToSync.esp.ftpHost,
                    port: deploymentToSync.esp.ftpPort,
                    user: deploymentToSync.esp.ftpUsername,
                    pass: deploymentToSync.esp.ftpPassword
                });

                // Add an error handler to clean up if there is an FTP error
                ftpClient.on('error', function (error) {
                    logger.error('FTPClient threw an error trying to syc files from deployment ' +
                        deploymentToSync.name, error);
                    logger.error('Will close the client, clear the flag, ' +
                        'and remove it from the queue');

                    // Clear the current sync
                    clearCurrentSync(ftpClient);
                });

                // Create the local path where the files for the deployment should go
                var localDirectory = path.join(basedir, 'instances', deploymentToSync.esp.name, 'deployments',
                    deploymentToSync.name, 'data', 'raw');

                // Call the method to grab the full list of all the files that need to be sync'd between
                // the local and remote directories (this is a recursive call).
                getListOfFilesToSync(localDirectory, deploymentToSync.esp.ftpWorkingDir, ftpClient, filesNeedingSync,
                    function (err) {
                        // First check for an error
                        if (err) {
                            logger.error("Error occurred during getListOfFilesToSync " +
                                "so nothing will be syncd:", err);

                            // Clear the current sync
                            clearCurrentSync(ftpClient);
                        } else {
                            // We successfully retrieved the list of all the files to be synchronized.
                            logger.debug("We should be done with getting the list of files to " +
                                "sync and the list is", filesNeedingSync);
                            if (Object.keys(filesNeedingSync).length > 0) {
                                syncFiles(deploymentToSync, filesNeedingSync, ftpClient, filesSynchronized, function (err) {
                                    // Check for an error
                                    if (err) {
                                        logger.error("Error trying to sync remote to local files:", err);
                                    } else {
                                        logger.debug("All remote files should be syncd for deployment " +
                                            deploymentToSync.name);
                                        // Now emit the listing of files that were sync'd
                                        // for (var syncdFile in filesSynchronized) {
                                        //     me.emit('ftpFileUpdated', {
                                        //         deployment: deploymentToSync,
                                        //         file: syncdFile,
                                        //         stats: filesSynchronized[syncdFile]
                                        //     });
                                        // }
                                    }

                                    // Since all the files should be syncd, clear the sync and move on
                                    clearCurrentSync(ftpClient);
                                });
                            } else {
                                logger.info("No files need synchronizing");
                                clearCurrentSync(ftpClient);
                            }
                        }
                    });
            } else {
                // Nothing to process so return
                logger.debug("No deployment queued up for sync, will simply return");
                return;
            }
        } else {
            // Ignore the call and just return
            logger.debug("syncDeploymentOffQueue called and it is currently processing so the call is ignored");
            return;
        }
    }

    /**
     * TODO kgomes document this
     * @param localDirectory
     * @param remoteDirectory
     * @param ftpClient
     * @param filesToSync
     * @param callback
     */
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
            // Send it back to the caller
            if (callback)
                callback(error);
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
                        logger.debug("The remote directory has " + numFiles + " listed in it");

                        // If there are no files, just execute the callback
                        if (numFiles === 0) {
                            logger.debug("Empty directory, just executing callback");
                            if (callback)
                                callback(null);
                        }

                        // If here, loop over the listing of files
                        res.forEach(function (file) {

                            // A bit of a hack, but create a remote directory name with ending / for later
                            var remoteDirectoryWithSlash = remoteDirectory;
                            if (remoteDirectoryWithSlash.substring(remoteDirectoryWithSlash.length - 1) !== '/') {
                                remoteDirectoryWithSlash += '/';
                            }

                            // If it is a directory, recursively call syncDirectory
                            if (file.type === 1) {
                                getListOfFilesToSync(path.join(localDirectory, file.name),
                                    remoteDirectoryWithSlash + file.name, ftpClient,
                                    filesToSync, function (err) {
                                        // Log the error if there is one and just bail out with callback
                                        if (err) {
                                            logger.error("Error in callback during sync of remote directory " +
                                                remoteDirectoryWithSlash + file.name);
                                            if (callback)
                                                callback(err);
                                            return;
                                        } else {

                                            // Decrement the counter
                                            numFiles--;

                                            // Check for exit condition
                                            if (numFiles <= 0) {
                                                logger.debug('Done processing files from remote directory ' +
                                                    remoteDirectory);
                                                if (callback)
                                                    callback(null);
                                                return;
                                            }
                                        }
                                    });
                            } else {
                                // First make sure the file on the remote server has some bytes in it
                                if (file.size > 0) {
                                    // It is a file.  First thing to do is to see if the local file exists
                                    var localFile = path.join(localDirectory, file.name);
                                    if (fs.existsSync(localFile)) {
                                        // Grab the file statistics
                                        var stat = fs.statSync(localFile);

                                        // Check to see if the file size if different
                                        if (parseInt(file.size) !== stat.size) {
                                            logger.debug('Comparing sizes of remote ' + file.size +
                                                ' to local ' + stat.size);
                                            logger.debug('Local file ' + localFile +
                                                ' size is different, marking for sync ...');
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
                                            return;
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
                                            return;
                                        }
                                    }
                                } else {
                                    // Decrement the counter
                                    numFiles--;

                                    // Check for exit condition
                                    if (numFiles <= 0) {
                                        logger.debug('Done processing files from remote directory ' + remoteDirectory);
                                        if (callback)
                                            callback(null);
                                        return;
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
            logger.warn("The local directory " + localDirectory +
                " appears to have not been created successfully");
            if (callback)
                callback(new Error("The local directory " + localDirectory +
                    " appears to have not been created successfully"));
        }
    };

    /**
     * TODO kgomes document this
     * @param deployment
     * @param filesToSync
     * @param ftpClient
     * @param callback
     */
    function syncFiles(deployment, filesToSync, ftpClient, filesSynchronized, callback) {
        logger.debug('syncFiles called for deployment ' + deployment.name + ' and there are ' +
            Object.keys(filesToSync).length + ' files to sync');

        // Check for exit condition
        if (Object.keys(filesToSync).length === 0) {
            logger.debug("No more files to sync");
            if (callback)
                callback(null);
            return;
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

                    // Create the handler for when this write is complete
                    localFileWriteStream.on('finish', function () {
                        logger.debug("File " + localFile + " write finished");

                        // Now if the file is a TIFF image, for browser support we need to create
                        // a version that is a JPG.
                        if (localFile.indexOf('.tif') !== -1) {
                            logger.debug('The downloaded file was a tif, let\'s create a JPEG version');

                            try {
                                // The JPG path
                                var jpgFilePath = localFile.replace(path.sep + 'data' + path.sep + 'raw' +
                                    path.sep + 'esp', path.sep + 'data' + path.sep + 'processed' + path.sep +
                                    'esp').replace('.tif', '.jpg');
                                logger.debug('JPG Path will be ' + jpgFilePath);

                                // Let's make sure the directory exists
                                var pathSegments = jpgFilePath.split(path.sep);

                                // Loop over the array (except the last which is the file name) to build the path
                                var incrementalPath = '';
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

                                // Convert to a JPG
                                im.convert([localFile, jpgFilePath], function (err, stdout) {
                                    if (err) {
                                        logger.error("Error trying to create JPG " + jpgFilePath + ":", err);
                                    } else {
                                        logger.debug("JPG " + jpgFilePath + " conversion done");
                                    }
                                });
                            } catch (error) {
                                logger.error('Error caught trying to create JPG' + jpgFilePath + ':', error);
                            }
                        }

                        // Grab the stats of the local file and add them to the object of files that were syncd.
                        filesSynchronized[localFile] = fs.statSync(localFile);
                        logger.debug("File that was synchronized has stats:", filesSynchronized[localFile]);

                        // We recursively sync the files
                        syncFiles(deployment, filesToSync, ftpClient, filesSynchronized, callback);
                    });

                    // Open the write stream
                    localFileWriteStream.once('open', function (fd) {
                        // Open the FTP socket and write to the file
                        ftpClient.get(remoteFile, function (err, socket) {
                                // Check for error first
                                if (err) {
                                    logger.error("Error trying to get socket for downloading remote file " +
                                        remoteFile + ":", err);

                                    // Close the local file
                                    localFileWriteStream.end();
                                } else {

                                    // Set up the handler to deal with the socket closing
                                    socket.on("close", function (hadErr) {
                                        logger.debug("Socket for file " + remoteFile + " is closed");
                                        if (hadErr) {
                                            logger.error('There was an error streaming remote file ' +
                                                remoteFile, hadErr);
                                        }

                                        // Close the write
                                        localFileWriteStream.end(function () {
                                            logger.debug("Writing to file " + localFile + " ended");
                                        });
                                    });

                                    logger.debug("Got socket for remote file " + remoteFile);

                                    // Set up the handler to handle the data and have it write to the file
                                    socket.on("data", function (d) {
                                        localFileWriteStream.write(d);
                                    });

                                    // Start the streaming!
                                    socket.resume();
                                }
                            }
                        );
                    });
                } catch (err) {
                    logger.debug("Error caught in FTP get:", err);
                    // While an error was caught, there is no reason not to keep trying
                    syncFiles(deployment, filesToSync, ftpClient, filesSynchronized, callback);
                }
            } else {
                // The remote file was empty, nothing to do, just recurse
                syncFiles(deployment, filesToSync, ftpClient, filesSynchronized, callback);
                return;
            }
        }
    };

    /**
     * This method takes in an FTPClient, closes the client and then clears out the currently processing deployment,
     * resets any flags and calls the method to process off the queue again
     * @param ftpClient
     */
    function clearCurrentSync(ftpClient) {
        // Make sure the FTP client is closed
        ftpClient.raw.quit(function (err, data) {
            if (err)
                logger.warn("err on FTPClient quit:", err);
            logger.debug("data on FTPClient quit:", data);
        });

        // Remove the deployment from the top
        deploymentsToSync.shift();

        // Clear the in process flag
        inProcess = false;

        // Call the method to process off the queue again
        syncDeploymentOffQueue();
    }
}

// Export the factory method
exports.createDeploymentFileSync = function (opts, basedir, logDir) {
    return new DeploymentFileSync(opts, basedir, logDir);
}