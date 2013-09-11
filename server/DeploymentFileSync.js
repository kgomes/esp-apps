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
        } else {
            // Put it in the queue
            deploymentIDsInProcess.push(deployment._id);
            logger.debug("deploymentIDsInProcess after insert:", deploymentIDsInProcess);

            // Create the FTP client that the deployment will use
            var ftpClient = new JSFtp({
                host: deployment.esp.ftp_host,
                port: deployment.esp.ftp_port,
                user: deployment.esp.ftp_username,
                pass: deployment.esp.ftp_password
            });

            // Grab the local directory
            var localDirectory = path.join(basedir, 'instances', deployment.esp.name, 'deployments', deployment.name, 'data', 'raw');

            // The array of files to sync
            var filesToSync = {};

            // Populate the array of files to sync
            getListOfFileToSync(localDirectory, deployment.esp.ftp_working_dir, ftpClient, filesToSync, function () {
                logger.debug('The files that need syncing are: ', filesToSync);
                syncFiles(deployment, filesToSync, ftpClient, function () {
                    callback();
                });
            });
        }
    }

    // This method takes in a local directory and a remote directory
    function getListOfFileToSync(localDirectory, remoteDirectory, ftpClient, filesToSync, callback) {
        logger.debug("getArrayOfFileToSync: Local: " + localDirectory + ", Remote: " + remoteDirectory);

        // We first need to make sure the base local directory is built
        var pathElements = localDirectory.split(path.sep);
        var growPath = '';
        for (var i = 0; i < pathElements.length; i++) {
            growPath = path.normalize(growPath + path.sep + pathElements[i]);
            if (!fs.existsSync(growPath)) {
                fs.mkdirSync(growPath);
            }
        }

        // Grab a listing of the directory
        ftpClient.ls(remoteDirectory, function (err, res) {
            // Check for an error
            if (err) {
                logger.error("Error during listing of remote directory " + remoteDirectory + ":", err);
                if (callback)
                    callback(err);
            } else {
                // The number of files to handle
                var numFiles = res.length;

                // Loop over the listing of files
                res.forEach(function (file) {

                    // A bit of a hack, but grab a remote directory name with ending /
                    var remoteDirectoryWithSlash = remoteDirectory;
                    if (remoteDirectoryWithSlash.substring(remoteDirectoryWithSlash.length - 1) !== '/') {
                        remoteDirectoryWithSlash += '/';
                    }

                    // If it is a directory, recursively call syncDirectory
                    if (file.type === 1) {
                        // Now sync remote and local directory
                        getListOfFileToSync(path.join(localDirectory, file.name), remoteDirectoryWithSlash + file.name,
                            ftpClient, filesToSync, function (err) {
                                // Decrement the counter
                                numFiles--;
                                // Check for exit condition
                                if (numFiles <= 0) {
                                    logger.debug('Done processing files from remote directory ' + remoteDirectory);
                                    callback(null);
                                }
                            });
                    } else {
                        // It is a file.  First thing to do is to see if the local file exists
                        var localFile = path.join(localDirectory, file.name);
                        //logger.debug('\nFile:\nLocal:' + localFile + '\nRemote:' + remoteDirectory + '/' + file.name);
                        if (fs.existsSync(localFile)) {
                            // Grab the file statistics
                            var stat = fs.statSync(localFile);

                            // Check to see if the remote time is newer or file size is larger
                            if (parseInt(file.size) !== stat.size) {
                                logger.debug('Comparing sizes of remote ' + file.size +
                                    ' to local ' + stat.size);
                                logger.debug('Local file ' + localFile + ' size is different, will download');
                                filesToSync[localFile] = (remoteDirectory + '/' + file.name).replace(new RegExp('//', 'g'), '/');
                            }

                            // Decrement the counter
                            numFiles--;
                            // Check for exit condition
                            if (numFiles <= 0) {
                                logger.debug('Done processing files from remote directory ' + remoteDirectory);
                                callback(null);
                            }
                        } else {
                            logger.debug('Local file ' + localFile + ' does not exist, marking for sync ...');
                            filesToSync[localFile] = (remoteDirectory + '/' + file.name).replace(new RegExp('//', 'g'), '/');

                            // Decrement the counter
                            numFiles--;
                            // Check for exit condition
                            if (numFiles <= 0) {
                                logger.debug('Done processing files from remote directory ' + remoteDirectory);
                                callback(null);
                            }
                        }
                    }
                });
            }
        });
    }

    // This is a function that takes in an object which has keys of local files and properties of
    // remote files that need to be sync'd.  It is called recursively
    function syncFiles(deployment, filesToSync, ftpClient, callback) {
        logger.debug('There are ' + Object.keys(filesToSync).length + ' files to sync');
        // Check for exit condition
        if (Object.keys(filesToSync).length === 0) {
            // Check to see if there are any files to process
            ftpClient.raw.quit(function (err, data) {
                logger.debug("err on quit?", err);
                logger.debug("data on quit:", data);
            });

            // Remove it from the queue
            deploymentIDsInProcess.splice(deploymentIDsInProcess.indexOf(deployment._id), 1);
            logger.debug("deploymentIDsInProcess after removal:", deploymentIDsInProcess);

            callback();
        } else {
            // Grab the local file name (key)
            var localFile = Object.keys(filesToSync)[0];
            var remoteFile = filesToSync[localFile];
            logger.debug("Will sync remote: " + remoteFile + " to local " + localFile);

            // Now remove the property
            delete filesToSync[localFile];

            // Download the file
            ftpClient.get(remoteFile, localFile, function (hadErr) {
                if (hadErr) {
                    logger.error('Error downloading remote file ' + remoteFile);
                } else {
                    // Now if the file is a TIFF image, for browser support we need to create
                    // a version that is a JPG.
                    if (localFile.indexOf('.tif') !== -1) {
                        logger.debug('The downloaded file was a tif, let\'s create a JPEG version');
                        var jpgFilePath = localFile.replace(path.sep + 'data' + path.sep + 'raw' +
                            path.sep + 'esp', path.sep + 'data' + path.sep + 'processed' + path.sep + 'esp').replace('.tif', '.jpg');
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
                            logger.error('Error caught trying to ensure directory ' + incrementalPath + ' exists');
                            logger.error(error);
                        }
                        // Convert it
                        im.convert([localFile, jpgFilePath]);
                    }

                    // Send notification that local file was updated
                    me.emit('ftp_file_updated', {
                        deployment: deployment,
                        file: localFile
                    });
                }
                // We recursively sync the files
                syncFiles(deployment, filesToSync, ftpClient, callback);
            });
        }

    }
}

// Export the factory method
exports.createDeploymentFileSync = function (opts) {
    return new DeploymentFileSync(opts);
}