// Grab all dependencies
var util = require('util');
var fs = require('fs');
var path = require('path');
var im = require('imagemagick');
var eventEmitter = require('events').EventEmitter;
// Create the FTP client from the FTP library that
// can be used to create connections
var FTP = require('ftp');

// Configure logging
var log4js = require('log4js');
log4js.loadAppender('file');
log4js.addAppender(log4js.appenders.file('./logs/FTPSync.log'), 'FTPSync');

// Grab the logger
var logger = log4js.getLogger('FTPSync');

// The constructor function
function FTPSync(opts) {
    // Set the log level if sent in
    if (opts.loggerLevel) {
        logger.setLevel(opts.loggerLevel);
    }
    logger.info('Constructing new FTPSync with logger level ' + opts.loggerLevel);

    // This is an array of the deployments that are queued up to sync
    this.arrayOfDeploymentInformationToSync = [];

    // A flag to indicate processing is happening
    this.isDeploymentBeingProcessed = false;

    // The deployment that is currently being synchronized (null if none)
    this.deploymentBeingSyncd = null;

    // This is the base directory associated with the deployment
    this.baseDirForDeployment = null;

    // This is the callback associated with the deployment being processed
    this.deploymentCallback = null;

    // The list of local files that were updated via FTP
    this.filesUpdated = [];

    // The ftp client being used
    this.ftpClient = null;

    // The number of directories left to process for the given deployment
    this.numberOfDirectoriesToProcess = 0;

    // The number of files left to process for the given deployment
    this.numberOfFilesToProcess = 0;

    logger.debug('Initialized FTPSync...');

    // *********************************************************************************
    // This function adds an incoming deployment to the array of deployments to process
    // and then starts to process them serially
    // *********************************************************************************
    this.syncDeployment = function (deployment, basedir, clientCallback) {
        logger.debug('syncDeployment [Deployment=' + deployment.name + ', ESP=' + deployment.esp.name + ']');

        // Check to see if the deployment is already scheduled for sync
        if (this.arrayOfDeploymentInformationToSync && this.arrayOfDeploymentInformationToSync.length > 0) {

            // Check each one and if one with the same ID is found, do not insert
            var found = false;
            this.arrayOfDeploymentInformationToSync.forEach(function (deploymentArrayElement) {
                if (deploymentArrayElement && deploymentArrayElement[0] && deploymentArrayElement[0]._id && deploymentArrayElement[0]._id === deployment._id) {
                    found = true;
                }
            });

            // If not found, add it to the array for processing
            if (!found) {
                logger.debug('Deployment is not in list, adding for sync [Deployment=' +
                    deployment.name + ', ESP=' + deployment.esp.name + ']');
                this.arrayOfDeploymentInformationToSync.push([deployment, basedir, clientCallback]);

                // If something is not currently being processed, process it off the array
                if (!this.isDeploymentBeingProcessed) {
                    logger.debug('Nothing currently processing, so will go ahead and sync');
                    this.syncDeploymentFromArray();
                } else {
                    logger.debug('Something is already in process, so I will wait');
                }
            } else {
                logger.debug('Deployment is already in list, will do nothing.');
            }
        } else {
            logger.debug('Empty list, adding for sync [Deployment=' + deployment.name + ', ESP=' + deployment.esp.name + ']');

            // Since the array is empty, add it
            this.arrayOfDeploymentInformationToSync.push([deployment, basedir, clientCallback]);

            // Now call the method to process deployment off the array
            if (!this.isDeploymentBeingProcessed) {
                logger.debug('Nothing currently processing, so will go ahead and sync');
                this.syncDeploymentFromArray();
            } else {
                logger.debug('Something is already in process, so I will wait');
            }
        }
    }; // End syncDeployment

    // *********************************************************************************
    // This method initializes all the instance variables to their defaults
    // *********************************************************************************
    this.clearInstanceVariables = function () {
        // Set all the instance variables to their defaults
        this.deploymentBeingSyncd = null;
        this.baseDirForDeployment = null;
        this.deploymentCallback = null;
        this.filesUpdated = [];
        this.ftpClient = null;
        this.numberOfDirectoriesToProcess = 0;
        this.numberOfFilesToProcess = 0;
        this.isDeploymentBeingProcessed = false;
    }

    // *********************************************************************************
    // This method pulls deployments off the array and synchronizes the files
    // *********************************************************************************
    this.syncDeploymentFromArray = function () {
        logger.debug('syncDeploymentFromArray called...');

        // Need a reference to self for some scoping in callbacks
        var me = this;

        // First make sure we are not currently processing a deployment
        if (!this.isDeploymentBeingProcessed && this.arrayOfDeploymentInformationToSync.length > 0) {

            // Since there are deployments to process, let's set up all the information we need
            logger.debug('Not processing and something is waiting, will process next entry');

            // Set the processing flag first
            this.isDeploymentBeingProcessed = true;

            // Pull an array of deployment information off the array
            var deploymentInfoArray = this.arrayOfDeploymentInformationToSync.shift();

            // Grab the deployment
            this.deploymentBeingSyncd = deploymentInfoArray[0];

            // The base directory
            this.baseDirForDeployment = deploymentInfoArray[1];

            // The callback
            this.deploymentCallback = deploymentInfoArray[2];

            // Create a new array for the list of files that were synchronized
            this.filesUpdated = [];

            // Clear the number of directories and files to parse
            this.numberOfDirectoriesToProcess = 0;
            this.numberOfFilesToProcess = 0;

            // Make sure we have what we need to do this
            if (!this.deploymentBeingSyncd || !this.deploymentBeingSyncd.esp || !this.deploymentBeingSyncd.esp.name || !this.deploymentBeingSyncd.esp.ftp_host || !this.deploymentBeingSyncd.esp.ftp_port || !this.deploymentBeingSyncd.esp.ftp_username || !this.baseDirForDeployment) {
                logger.warn('Not enough information provided in deployment ' + this.deploymentBeingSyncd.name + ' to be an FTP client');
                // Check for exit with error
                if (this.deploymentCallback)
                    this.deploymentCallback(
                        new Error('Not enough information was provided for deployment ' + this.deploymentBeingSyncd.name));

                // Clear everything
                this.clearInstanceVariables();

                // Call the method to process again
                this.syncDeploymentFromArray();

            } else {

                logger.info('Synchronizing [Deployment=' + this.deploymentBeingSyncd.name +
                    ', ESP=' + this.deploymentBeingSyncd.esp.name + ']');
                logger.debug(this.deploymentBeingSyncd);
                logger.debug('Base directory=' + this.baseDirForDeployment);

                // Create the new client
                this.ftpClient = new FTP();
                logger.debug('New FTP client created');
                logger.debug(this.ftpClient);

                // Assign the event handler for an error
                this.ftpClient.on('error', function (err) {
                    // If the error is a timeout, move on to the next one
                    if (err.code === 500) {
                        logger.debug('500 Error caught in FTP Client.  This can be ' +
                            'caused by server on exit, so we will ignore');
                    } else {
                        if (err.toString().indexOf('Error: Timeout') !== -1) {
                            logger.error('Got a time out from server ' +
                                me.deploymentBeingSyncd.esp.ftp_host + ' will skip');
                        } else {
                            logger.error('Unknown FTP Error:');
                            logger.error('Code = ' + err.code);
                            logger.error(util.inspect(err));
                        }
                        // Clear everything and move on
                        me.clearInstanceVariables();
                        me.syncDeploymentFromArray();
                    }
                });
                this.ftpClient.on('close', function (hadErr) {
                    logger.debug('Close event handled, was there an error? ' + hadErr);
                });
                this.ftpClient.on('end', function () {
                    logger.debug('End event handled');
                });
                this.ftpClient.on('greeting', function (message) {
                    logger.debug('Greeting event trapped: ' + message);
                });

                // Set up ready handler so that when the connection is ready, the processing can start
                this.ftpClient.on('ready', function () {
                    logger.debug('Connection successful, FTP ready.');
                    me.syncTopLevelFTPDirectory();
                });

                try {
                    logger.debug('Connecting [' + this.deploymentBeingSyncd.esp.ftp_host + ':' +
                        this.deploymentBeingSyncd.esp.ftp_port + ':' + this.deploymentBeingSyncd.esp.ftp_username +
                        ':' + this.deploymentBeingSyncd.esp.ftp_password + ']');

                    // Now connect which should fire off the sync after the 'ready' event happens
                    if (this.ftpClient) {
                        this.ftpClient.connect({
                            host: this.deploymentBeingSyncd.esp.ftp_host,
                            port: this.deploymentBeingSyncd.esp.ftp_port,
                            user: this.deploymentBeingSyncd.esp.ftp_username,
                            password: this.deploymentBeingSyncd.esp.ftp_password
                        });
                    } else {
                        logger.error('There was not FTP client when connecting, VERY strange!');
                    }

                } catch (error) {
                    logger.error('Error while creating FTP client:');
                    logger.error(error);

                    // Send to callback
                    if (this.deploymentCallback)
                        this.deploymentCallback(error);

                    // Clear the instance level variables
                    this.clearInstanceVariables();

                    // Call the method again
                    this.syncDeploymentFromArray();
                }
            }
        } else {
            // Exit quietly, we are done
            if (this.isDeploymentBeingProcessed) {
                logger.debug('Currently processing something so will skip this call');
            } else {
                logger.debug('List of queued deployment is empty, nothing to do');
            }
        }
    }; // End syncDeploymentFromArray

    // *********************************************************************************
    // The method that takes a local and remote directory and synchronizes
    // the remote files to the local files.
    // *********************************************************************************
    this.syncTopLevelFTPDirectory = function () {
        // Grab reference to the instance for callbacks
        var me = this;

        // Build the local directory path
        var localDirectoryPath = me.baseDirForDeployment + '/instances/' + me.deploymentBeingSyncd.esp.name +
            '/deployments/' + me.deploymentBeingSyncd.name + '/data/raw';

        // Call the function to recurse down the directory
        drillDown(localDirectoryPath, me.deploymentBeingSyncd.esp.ftp_working_dir);

        // Define function is used to call recursively down directory trees
        function drillDown(localCurrentDirectory, remoteCurrentDirectory) {
            logger.debug('Remote Dir ' + remoteCurrentDirectory);

            // Bump the number of directories being processed for this deployment
            me.numberOfDirectoriesToProcess++;

            // First thing to do would be to make sure the local directory exists
            // and if not create it.
            if (!fs.existsSync(localCurrentDirectory)) {

                // In order to make sure it gets created correctly, it needs
                // to be split up and walked
                var pathSegments = localCurrentDirectory.split(path.sep);

                // Loop over the array to build the path
                var incrementalPath = '';
                try {
                    for (var i = 0; i < pathSegments.length; i++) {
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

                    // Drop the number of directories to process since it did not work
                    me.numberOfDirectoriesToProcess--;

                    // Check to see if it is time to exit
                    checkForExit(error);

                    // And return
                    return;
                }
            }

            // Try to get a file listing from the remote directory
            try {
                me.ftpClient.list(remoteCurrentDirectory, function (err, fileList) {

                    // First check for errors
                    if (err) {
                        logger.error('Error returned when getting remote list of directory ' +
                            remoteCurrentDirectory);
                        logger.error(err);

                        // Drop the number of directories and check for exit conditions
                        me.numberOfDirectoriesToProcess--;
                        checkForExit(err);
                    } else {
                        logger.debug('There are ' + fileList.length + ' files in the remote dir');
                        // Now process the list of files
                        for (var i = 0; i < fileList.length; i++) {
                            // Quick check to make sure something is there
                            if (fileList[i]) {
                                // Now check to see if it is a file and if so, process it that way
                                if (fileList[i].type === '-') {
                                    syncFile(localCurrentDirectory,
                                        remoteCurrentDirectory, fileList[i]);
                                } else if (fileList[i].type === 'd') {
                                    // This is a directory, so we need to drill down
                                    drillDown(path.join(localCurrentDirectory, fileList[i].name),
                                        path.join(remoteCurrentDirectory, fileList[i].name));
                                } else {
                                    logger.warn('Could not understand type of file ' + fileList[i].name);
                                }
                            }
                        }
                        // Drop the number of directories to process
                        logger.debug('Done looping over remote file list');
                        me.numberOfDirectoriesToProcess--;
                        checkForExit(null);
                    }
                });
            } catch (error) {
                logger.error('Error caught when getting remote list of directory ' +
                    remoteCurrentDirectory);
                logger.error(error);

                // Drop the number of directories and check for exit conditions
                me.numberOfDirectoriesToProcess--;
                checkForExit(error);
            }
        }

        // This function takes in all the information about a file that needs to be
        // synchronized and does so if it is necessary
        function syncFile(localDirectory, remoteDirectory, remoteFile) {

            logger.debug('Checking remote File =' + remoteFile.name + '(' + remoteFile.date + ':' +
                remoteFile.date.getTime() + ')->Directory:' + localDirectory);

            // This is a file, need to sync it (if necessary) so bump the counter
            me.numberOfFilesToProcess++;
            logger.debug('Raised file counter to ' + me.numberOfFilesToProcess);

            // First let's build the path to the local file
            var localFilePath = path.join(localDirectory, remoteFile.name);
            var remoteFilePath = path.join(remoteDirectory, remoteFile.name);

            // Check to see if it exists
            var syncFileFlag = false;
            try {
                if (!fs.existsSync(localFilePath)) {
                    syncFileFlag = true;
                    logger.debug('Local file ' + localFilePath + ' does not exist, will sync');
                } else {
                    // Grab the file statistics
                    var stat = fs.statSync(localFilePath);

                    // Check to see if the remote time is newer or file size is larger
                    logger.trace('Comparing times of remote (' + remoteFile.date.getTime() +
                        ') to local ' + stat.mtime.getTime());
                    logger.trace('Comparing sizes of remote (' + remoteFile.size +
                        ') to local ' + stat.size);
                    if (remoteFile.date.getTime() > stat.mtime.getTime()) {  // for 'ftp' library
                        syncFileFlag = true;
                        logger.debug('Local file ' + localFilePath + ' older than remote, will download');
                    } else if (parseInt(remoteFile.size) > stat.size) {
                        syncFileFlag = true;
                        logger.debug('Local file ' + localFilePath + ' smaller than remote, will download');
                    }
                }
            } catch (error) {
                logger.error('Error caught trying to check to see if local files are needed');
                logger.error(error);

                // Drop the number of files to process, clear the sync flag, and check for exit
                syncFileFlag = false;
            }

            // If the file needs to be synchronized
            if (syncFileFlag) {
                try {
                    // Grab the remote file and store it locally (in overwrite mode)
                    // TODO could I do this in an append mode?
                    me.ftpClient.get(remoteFilePath, function (err, data) {

                            // Check to see if an error was returned
                            if (err) {
                                logger.error('Error returned trying to get remote file: ' +
                                    remoteFilePath + ' will ignore though');
                                logger.error(err);

                                // Drop the number of files to process and check for exit
                                //this.numberOfFilesToProcess--;
                                //logger.debug('Dropped file counter to ' + this.numberOfFilesToProcess);
                                //checkForExit(err);
                            } else {
                                // Add handler to clean up once the file has finished downloading
                                data.once('close', function (hadError) {
                                    // Check the boolean to see if there was any error
                                    if (hadError) {
                                        // Just log it
                                        logger.error('It appears there was an error downloading file ' +
                                            remoteFilePath + ' that was returned with the close event');
                                    }

                                    // Set the local date equal to remote date
                                    fs.utimes(localFilePath, remoteFile.date.getTime() / 1000,
                                        remoteFile.date.getTime() / 1000, function (err) {
                                            if (err) {
                                                // Write to log
                                                logger.error('Error on updating file date-time on local file ' +
                                                    localFilePath);
                                                logger.error(err);
                                            }

                                            // Push the log file onto the files updated array
                                            me.filesUpdated.push(localFilePath);

                                            // Drop the number of files to process and check for exit
                                            logger.debug('Finished processing remote file ' + remoteFilePath);
                                            me.numberOfFilesToProcess--;
                                            logger.debug('Dropped file counter to ' + me.numberOfFilesToProcess);
                                            checkForExit(err);
                                        });

                                    // Now if the file is a TIFF image, for browser support we need to create
                                    // a version that is a JPG.
                                    if (localFilePath.indexOf('.tif') !== -1) {
                                        logger.debug('The downloaded file was a tif, let\'s create a JPEG version');
                                        var jpgFilePath = localFilePath.replace(path.sep + 'data' + path.sep + 'raw' +
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
                                        im.convert([localFilePath, jpgFilePath]);
                                    }
                                });

                                // Write read stream to file write stream
                                data.pipe(fs.createWriteStream(localFilePath));
                            }
                        }
                    );
                } catch (error) {
                    logger.error('Error caught trying to get remote file:');
                    logger.error(error);

                    // Drop the number of files to process and check for exit
                    me.numberOfFilesToProcess--;
                    logger.debug('Dropped file counter to ' + me.numberOfFilesToProcess);
                    checkForExit(error);
                }
            } else {
                logger.debug('File ' + remoteFilePath + ' did not need syncing')
                me.numberOfFilesToProcess--;
                logger.debug('Dropped file counter to ' + me.numberOfFilesToProcess);
                checkForExit(null);
            }
        }


        // This method looks at the number of directories and files that need to be processed and if
        // there are none left, it is the exit condition so we close up shop and bail out
        function checkForExit(error) {
            logger.debug('Exit? #D=' + me.numberOfDirectoriesToProcess +
                ', #F=' + me.numberOfFilesToProcess);

            // Close the FTP connection if there are no more files or directories to process
            if (me.numberOfDirectoriesToProcess <= 0 &&
                me.numberOfFilesToProcess <= 0) {
                logger.debug('All directories and files synchronized.');

                // Emit events for all files updated
                logger.debug('Will emit ' + me.filesUpdated.length + ' update events');
                me.filesUpdated.forEach(function (logFile) {
                    // Send notification that local file was updated
                    me.emit('ftp_file_updated', {
                        deployment: me.deploymentBeingSyncd,
                        file: logFile
                    });
                });

                // Close the ftp client
                try {
                    logger.debug('Closing FTP client')
                    if (me.ftpClient)
                        me.ftpClient.end();
                } catch (error) {
                    logger.error('Error trying to close FTP client for deployment ' +
                        me.deploymentBeingSyncd.name);
                    logger.error(error);
                }

                // Call the callback that is linked to the deployment
                if (me.deploymentCallback)
                    me.deploymentCallback(error);

                // Clear the counters
                me.clearInstanceVariables();
                logger.debug('Cleared instance variables');

                // Recursively call the array processing
                me.syncDeploymentFromArray();
            }
        }

    }
}

// Inherit event emitter functionality
util.inherits(FTPSync, eventEmitter);

// Export the factory method
exports.createFTPSync = function (opts) {
    return new FTPSync(opts);
}