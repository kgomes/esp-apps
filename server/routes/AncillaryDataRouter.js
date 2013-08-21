// Any dependencies
var url = require('url');

// Configure logging
var log4js = require('log4js');
log4js.loadAppender('file');
log4js.addAppender(log4js.appenders.file('./logs/AncillaryDataRouter.log'), 'AncillaryDataRouter');

// Grab the logger
var logger = log4js.getLogger('AncillaryDataRouter');

// The constructor function
function AncillaryDataRouter(dataAccess, opts) {
    // If the options specify a logger level, set it
    if (opts.loggerLevel) {
        logger.setLevel(opts.loggerLevel);
    }
    logger.debug('Creating AncillaryDataRouter');

    // Grab a handle to this instance for scoping
    var me = this;

    // Grab the DataAccess
    this.dataAccess = dataAccess;

    // *******************************************************************
    // This is the method to handle a request for ancillary data
    // *******************************************************************
    this.getAncillaryData = function (req, res) {
        logger.debug('getAncillaryData called');

        // Grab the URL params
        var url_parts = url.parse(req.url, true);
        var query = url_parts.query;

        // Look for 'sourceid', 'starttime', 'endtime'
        var sourceId = query.sourceid;
        var startTime = query.starttime;
        var endTime = query.endtime;
        var format = query.format;
        logger.debug(sourceId + ',' + startTime + ',' + endTime + ',' + format);

        // Set the response to JSON
        res.contentType('application/json');

        // Make sure we have a source ID that is a number
        var sourceIDInt = null;
        if (sourceId) {
            try {
                sourceIDInt = parseInt(sourceId);
                logger.debug('Source ID int = ' + sourceIDInt);
            } catch (error) {
                logger.warn('Could not convert sourceid ' + sourceId + ' to integer');
            }
        }

        // TODO validate the timestamps
        if (sourceIDInt) {
            logger.debug('Going to the DB');
            me.dataAccess.getAncillaryData(sourceIDInt, startTime, endTime, format, function (err, data) {
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
exports.createAncillaryDataRouter = function (dataAccess, opts) {
    // Create the new AncillaryDataRouter
    return new AncillaryDataRouter(dataAccess, opts);
}