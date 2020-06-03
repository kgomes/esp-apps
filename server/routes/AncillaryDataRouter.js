// Any dependencies
var url = require('url');

// Configure logging
var log4js = require('log4js');
log4js.loadAppender('file');

// Grab the logger
var logger = log4js.getLogger('AncillaryDataRouter');

// The constructor function
function AncillaryDataRouter(dataAccess, logDir, logLevel) {
    // If the options specify a logger level, set it
    if (logLevel) {
        logger.setLevel(logLevel);
    }
    logger.debug('Creating AncillaryDataRouter');

    // And point to log directory
    log4js.addAppender(log4js.appenders.file(logDir + '/AncillaryDataRouter.log'), 'AncillaryDataRouter');

    // Grab a handle to this instance for scoping
    var me = this;

    // Grab the DataAccess
    this.dataAccess = dataAccess;

    // *******************************************************************
    // This is the method to handle a request for ancillary data
    // *******************************************************************
    this.getAncillaryData = function (req, res) {
        logger.debug('getAncillaryData called');

        // Grab any params from the URL
        var sourceID = req.params.sourceID;

        // Now any filtering query params
        var startDate = req.query.startDate;
        var endDate = req.query.endDate;

        // And any formatting params
        var format = req.query.format;

        logger.debug(sourceID + ',' + startDate + ',' + endDate + ',' + format);

        // Set the response to JSON
        res.contentType('application/json');

        // Make sure we have a source ID that is a number
        var sourceIDInt = null;
        if (sourceID) {
            try {
                sourceIDInt = parseInt(sourceID);
                logger.debug('Source ID int = ' + sourceIDInt);
            } catch (error) {
                logger.warn('Could not convert sourceID ' + sourceID + ' to integer');
            }
        }

        // TODO validate the timestamps
        if (sourceIDInt) {
            logger.debug('Going to the DB');
            me.dataAccess.getAncillaryData(sourceIDInt, startDate, endDate, format, function (err, data) {
                logger.debug('data access replied');
                if (err) {
                    logger.error('Error on reply');
                    logger.error(err)
                    res.send('[]');
                } else {
                    res.send(JSON.stringify(data));
                }
            });
        } else {
            // Now send the response
            res.send('[]');
        }
    }

}

// Export the factory method
exports.createAncillaryDataRouter = function (dataAccess, logDir, logLevel) {
    // Create the new AncillaryDataRouter
    return new AncillaryDataRouter(dataAccess, logDir, logLevel);
}