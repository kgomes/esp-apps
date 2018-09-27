module.exports = {
    deployments: {
        all: {
            map: function (doc) {
                if (doc.resource === 'Deployment') {
                    // A condensed deployment for performance
                    var deployment = {
                        // Assign the ID
                        _id: doc._id,

                        // Assign the revision
                        _rev: doc._rev,

                        // Grab the name of the deployment
                        name: doc.name,

                        // Grab the descripton
                        description: doc.description,

                        // Grab the dates
                        startDate: doc.startDate,
                        endDate: doc.endDate,

                        // Grab the ESP information
                        esp: doc.esp,

                        // Grab the location
                        latitude: doc.latitude,
                        longitude: doc.longitude,
                        depth: doc.depth,

                        // The last line parsed in the file
                        lastLineParsedFromLogFile: doc.lastLineParsedFromLogFile,

                        // Add the list of ancillary data
                        ancillaryData: doc.ancillaryData,

                        // Start with clear flags for other data
                        errorsExist: false,
                        numberOfErrors: 0,
                        protocolRunsExist: false,
                        numberOfProtocolRuns: 0,
                        samplesExist: false,
                        numberOfSamples: 0,
                        imagesExist: false,
                        numberOfImages: 0,
                        pcrsExist: false,
                        numberOfPcrs: 0

                    };

                    // Now add flags to indicate if there are errors and how many
                    if (doc.errors) {
                        // Count the number of errors
                        var numErrors = 0;
                        for (var property in doc.errors) {
                            if (doc.errors.hasOwnProperty(property)) {
                                numErrors++;
                            }
                        }
                        if (numErrors > 0) {
                            deployment['errorsExist'] = true;
                            deployment['numberOfErrors'] = numErrors;
                        }
                    }

                    // Now add flags to indicate if there are samples and how many
                    if (doc.samples) {
                        // Count the number of samples
                        var numSamples = 0;
                        for (var property in doc.samples) {
                            if (doc.samples.hasOwnProperty(property)) {
                                numSamples++;
                            }
                        }
                        if (numSamples > 0) {
                            deployment['samplesExist'] = true;
                            deployment['numberOfSamples'] = numSamples;
                        }
                    }

                    // Now add flags to indicate if there are protocolRuns and how many
                    if (doc.protocolRuns) {
                        // Count the number of ProtocolRuns
                        var numProtocolRuns = 0;
                        for (var property in doc.protocolRuns) {
                            if (doc.protocolRuns.hasOwnProperty(property)) {
                                numProtocolRuns++;
                            }
                        }
                        if (numProtocolRuns > 0) {
                            deployment['protocolRunsExist'] = true;
                            deployment['numberOfProtocolRuns'] = numProtocolRuns;
                        }
                    }

                    // Now add flags to indicate if there are images and how many
                    if (doc.images) {
                        // Count the number of images
                        var numImages = 0;
                        for (var property in doc.images) {
                            if (doc.images.hasOwnProperty(property)) {
                                numImages++;
                            }
                        }
                        if (numImages > 0) {
                            deployment['imagesExist'] = true;
                            deployment['numberOfImages'] = numImages;
                        }
                    }

                    // Now add flags to indicate if there are pcrs and how many
                    if (doc.pcrs) {
                        // Count the number of PCRs
                        var numPcrs = 0;
                        for (var property in doc.pcrs) {
                            if (doc.pcrs.hasOwnProperty(property)) {
                                numPcrs++;
                            }
                        }
                        if (numPcrs > 0) {
                            deployment['pcrsExist'] = true;
                            deployment['numberOfPcrs'] = numPcrs;
                        }
                    }

                    // Now return the condensed deployment with it's ID
                    emit(doc._id, deployment);
                }
            }
        },
        allDeployments: {
            map: function(doc) {
                if (doc.resource === 'Deployment') {
                    emit(doc._id,doc);
                }
            }
        },
        byName: {
            map: function(doc) {
                if (doc.resource === 'Deployment') {
                    // A condensed deployment for performance
                    var deployment = {
                        // Assign the ID
                        _id: doc._id,

                        // Assign the revision
                        _rev: doc._rev,

                        // Grab the name of the deployment
                        name: doc.name,

                        // Grab the descripton
                        description: doc.description,

                        // Grab the dates
                        startDate: doc.startDate,
                        endDate: doc.endDate,

                        // Grab the ESP information
                        esp: doc.esp,

                        // Grab the location
                        latitude: doc.latitude,
                        longitude: doc.longitude,
                        depth: doc.depth,

                        // The last line parsed in the file
                        lastLineParsedFromLogFile: doc.lastLineParsedFromLogFile,

                        // Add the list of ancillary data
                        ancillaryData: doc.ancillaryData,

                        // Start with clear flags for other data
                        errorsExist: false,
                        numberOfErrors: 0,
                        protocolRunsExist: false,
                        numberOfProtocolRuns: 0,
                        samplesExist: false,
                        numberOfSamples: 0,
                        imagesExist: false,
                        numberOfImages: 0,
                        pcrsExist: false,
                        numberOfPcrs: 0

                    };
                    // Now add flags to indicate if there are errors and how many
                    if (doc.errors) {
                        // Count the number of errors
                        var numErrors = 0;
                        for (var property in doc.errors) {
                            if (doc.errors.hasOwnProperty(property)){
                                numErrors++;
                            }
                        }
                        if (numErrors > 0) {
                            deployment['errorsExist'] = true;
                            deployment['numberOfErrors'] = numErrors;
                        }
                    }

                    // Now add flags to indicate if there are samples and how many
                    if (doc.samples) {
                        // Count the number of samples
                        var numSamples = 0;
                        for (var property in doc.samples) {
                            if (doc.samples.hasOwnProperty(property)) {
                                numSamples++;
                            }
                        }
                        if (numSamples > 0) {
                            deployment['samplesExist'] = true;
                            deployment['numberOfSamples'] = numSamples;
                        }
                    }

                    // Now add flags to indicate if there are protocolRuns and how many
                    if (doc.protocolRuns) {
                        // Count the number of ProtocolRuns
                        var numProtocolRuns = 0;
                        for (var property in doc.protocolRuns) {
                            if (doc.protocolRuns.hasOwnProperty(property)) {
                                numProtocolRuns++;
                            }
                        }
                        if (numProtocolRuns > 0) {
                            deployment['protocolRunsExist'] = true;
                            deployment['numberOfProtocolRuns'] = numProtocolRuns;
                        }
                    }

                    // Now add flags to indicate if there are images and how many
                    if (doc.images) {
                        // Count the number of images
                        var numImages = 0;
                        for (var property in doc.images) {
                            if (doc.images.hasOwnProperty(property)) {
                                numImages++;
                            }
                        }
                        if (numImages > 0) {
                            deployment['imagesExist'] = true;
                            deployment['numberOfImages'] = numImages;
                        }
                    }

                    // Now add flags to indicate if there are pcrs and how many
                    if (doc.pcrs) {
                        // Count the number of PCRs
                        var numPcrs = 0;
                        for (var property in doc.pcrs) {
                            if (doc.pcrs.hasOwnProperty(property)) {
                                numPcrs++;
                            }
                        }
                        if (numPcrs > 0) {
                            deployment['pcrsExist'] = true;
                            deployment['numberOfPcrs'] = numPcrs;
                        }
                    }

                    // Now return the condensed deployment with it's ID
                    emit(doc.name,deployment);
                }
            }
        },
        errors: {
            map: function(doc) {
                // Make sure document is a deployment first
                if (doc.resource === 'Deployment') {

                    // Create an object to hold the sorted errors
                    var sortedErrors = {};

                    // Create an array that can be used to sort
                    var timestamps = [];

                    // Check for errors first
                    if (doc.errors) {

                        // Now add the timestamps to the array for sorting
                        for (ts in doc.errors) {
                            timestamps.push(ts);
                        }

                        // Now sort
                        timestamps.sort();
                    }

                    // Now build a new object with sorted timestamps
                    for (var i = 0; i < timestamps.length; i++) {
                        sortedErrors[timestamps[i]] = doc.errors[timestamps[i]];
                    }

                    // Emit sorted errors
                    emit(doc._id,sortedErrors);
                }
            }
        },
        images: {
            map: function(doc) {
                // Make sure the document is a deployment first
                if (doc.resource === 'Deployment') {

                    // Create an object to hold sorted images
                    var sortedImages = {};

                    // Create an array that can be used to sort
                    var timestamps = [];

                    // Check for images first
                    if (doc.images) {

                        // Add the timestamps to the array for sorting
                        for (ts in doc.images) {
                            timestamps.push(ts);
                        }

                        // Now sort
                        timestamps.sort();
                    }

                    // Now build a new object with sorted timestamps
                    for (var i = 0; i < timestamps.length; i++) {
                        sortedImages[timestamps[i]] = doc.images[timestamps[i]];
                    }

                    // Now emit the sorted images
                    emit(doc._id,sortedImages);
                }
            }
        },
        names: {
            map: function(doc) {
                if (doc.resource && doc.resource === 'Deployment') {
                    emit(doc.name,null);
                }
            },
            reduce: function(keys, values) {
                return true;
            }
        },
        open: {
            map: function(doc) {
                if (doc.resource && doc.resource === 'Deployment' && !doc.endDate) {
                    // A condensed deployment for performance
                    var deployment = {
                        // Assign the ID
                        _id: doc._id,

                        // Assign the revision
                        _rev: doc._rev,

                        // Grab the name of the deployment
                        name: doc.name,

                        // Grab the descripton
                        description: doc.description,

                        // Grab the dates
                        startDate: doc.startDate,
                        endDate: doc.endDate,

                        // Grab the property to see if Slack should be notified of events
                        notifySlack: doc.notifySlack,

                        // Grab the channel name if specified
                        slackChannel: doc.slackChannel,

                        // Grab the ESP information
                        esp: doc.esp,

                        // Grab the location
                        latitude: doc.latitude,
                        longitude: doc.longitude,
                        depth: doc.depth,

                        // The last line parsed in the file
                        lastLineParsedFromLogFile: doc.lastLineParsedFromLogFile,

                        // Add the list of ancillary data
                        ancillaryData: doc.ancillaryData,

                        // Start with clear flags for other data
                        errorsExist: false,
                        numberOfErrors: 0,
                        protocolRunsExist: false,
                        numberOfProtocolRuns: 0,
                        samplesExist: false,
                        numberOfSamples: 0,
                        imagesExist: false,
                        numberOfImages: 0,
                        pcrsExist: false,
                        numberOfPcrs: 0

                    };

                    // Now add flags to indicate if there are errors and how many
                    if (doc.errors) {
                        // Count the number of errors
                        var numErrors = 0;
                        for (var property in doc.errors) {
                            if (doc.errors.hasOwnProperty(property)){
                                numErrors++;
                            }
                        }
                        if (numErrors > 0) {
                            deployment['errorsExist'] = true;
                            deployment['numberOfErrors'] = numErrors;
                        }
                    }

                    // Now add flags to indicate if there are samples and how many
                    if (doc.samples) {
                        // Count the number of samples
                        var numSamples = 0;
                        for (var property in doc.samples) {
                            if (doc.samples.hasOwnProperty(property)) {
                                numSamples++;
                            }
                        }
                        if (numSamples > 0) {
                            deployment['samplesExist'] = true;
                            deployment['numberOfSamples'] = numSamples;
                        }
                    }

                    // Now add flags to indicate if there are protocolRuns and how many
                    if (doc.protocolRuns) {
                        // Count the number of ProtocolRuns
                        var numProtocolRuns = 0;
                        for (var property in doc.protocolRuns) {
                            if (doc.protocolRuns.hasOwnProperty(property)) {
                                numProtocolRuns++;
                            }
                        }
                        if (numProtocolRuns > 0) {
                            deployment['protocolRunsExist'] = true;
                            deployment['numberOfProtocolRuns'] = numProtocolRuns;
                        }
                    }

                    // Now add flags to indicate if there are images and how many
                    if (doc.images) {
                        // Count the number of images
                        var numImages = 0;
                        for (var property in doc.images) {
                            if (doc.images.hasOwnProperty(property)) {
                                numImages++;
                            }
                        }
                        if (numImages > 0) {
                            deployment['imagesExist'] = true;
                            deployment['numberOfImages'] = numImages;
                        }
                    }

                    // Now add flags to indicate if there are pcrs and how many
                    if (doc.pcrs) {
                        // Count the number of PCRs
                        var numPcrs = 0;
                        for (var property in doc.pcrs) {
                            if (doc.pcrs.hasOwnProperty(property)) {
                                numPcrs++;
                            }
                        }
                        if (numPcrs > 0) {
                            deployment['pcrsExist'] = true;
                            deployment['numberOfPcrs'] = numPcrs;
                        }
                    }

                    // Now return the condensed deployment with it's ID
                    emit(doc._id,deployment);
                }
            }
        },
        pcrColumnNames: {
            map: function(doc) {
                // Make sure it is a deployment first
                if (doc.resource === 'Deployment') {

                    // Now makes sure it has some PCR data
                    if (doc.pcrs) {
                        // Count the number of PCRs
                        var numPcrs = 0;
                        for (var property in doc.pcrs) {
                            if (doc.pcrs.hasOwnProperty(property)) {
                                numPcrs++;
                            }
                        }
                        if (numPcrs > 0) {
                            // Loop over the pcr data
                            for (var pcrType in doc.pcrs) {

                                // The column names
                                var columnNames = [];

                                // Now loop over the column names
                                for (var columnName in doc.pcrs[pcrType]) {

                                    // Add the name of the column
                                    columnNames.push(columnName)
                                }
                                // emit the result
                                emit([doc._id,pcrType],columnNames);
                            }
                        }
                    }
                }
            }
        },
        pcrDataRecords: {
            map: function(doc) {
                // Make sure it is a deployment first
                if (doc.resource === 'Deployment') {

                    // Now makes sure it has some PCR data
                    if (doc.pcrs) {
                        // Count the number of PCRs
                        var numPcrs = 0;
                        for (var property in doc.pcrs) {
                            if (doc.pcrs.hasOwnProperty(property)) {
                                numPcrs++;
                            }
                        }
                        if (numPcrs > 0) {
                            // Loop over the pcr data
                            for (var pcrType in doc.pcrs) {

                                // Now loop over the column names
                                for (var columnName in doc.pcrs[pcrType]) {

                                    // Now loop over the timestamps
                                    for (var epochSec in doc.pcrs[pcrType][columnName]) {

                                        // The array of data points
                                        var dataRecords = [];

                                        // Loop over the data records
                                        for (var i = 0; i < doc.pcrs[pcrType][columnName][epochSec].length; i++) {
                                            dataRecords.push(doc.pcrs[pcrType][columnName][epochSec][i]);
                                        }
                                        // emit the result
                                        emit([doc._id,pcrType,columnName,epochSec],dataRecords);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        },
        pcrEpochSeconds: {
            map: function(doc) {
                // Make sure it is a deployment first
                if (doc.resource === 'Deployment') {

                    // Now makes sure it has some PCR data
                    if (doc.pcrs) {
                        // Count the number of PCRs
                        var numPcrs = 0;
                        for (var property in doc.pcrs) {
                            if (doc.pcrs.hasOwnProperty(property)) {
                                numPcrs++;
                            }
                        }
                        if (numPcrs > 0) {
                            // Loop over the pcr data
                            for (var pcrType in doc.pcrs) {

                                // Now loop over the column names
                                for (var columnName in doc.pcrs[pcrType]) {

                                    // The array of epoch seconds
                                    var epochSecs = [];

                                    // Now loop over the timestamps
                                    for (var epochSec in doc.pcrs[pcrType][columnName]) {
                                        epochSecs.push(epochSec);
                                    }
                                    // emit the result
                                    emit([doc._id,pcrType,columnName],epochSecs);
                                }
                            }
                        }
                    }
                }
            }
        },
        pcrRunNames: {
            map: function(doc) {
                // Make sure it is a deployment first
                if (doc.resource === 'Deployment') {

                    // Now makes sure it has some PCR data
                    if (doc.pcrs) {
                        // Count the number of PCRs
                        var numPcrs = 0;
                        for (var property in doc.pcrs) {
                            if (doc.pcrs.hasOwnProperty(property)) {
                                numPcrs++;
                            }
                        }
                        if (numPcrs > 0) {
                            // Loop over the pcr data
                            for (var pcrType in doc.pcrs) {

                                // Build a new array that will contains the run names
                                var runNames = [];

                                // Now loop over the run names
                                for (var runName in doc.pcrs[pcrType]) {
                                    runNames.push(runName);
                                }

                                // emit the result
                                emit([doc._id,pcrType],runNames);
                            }
                        }
                    }
                }
            }
        },
        pcrTypes: {
            map: function(doc) {
                // Make sure it is a deployment first
                if (doc.resource === 'Deployment') {

                    // Now makes sure it has some PCR data
                    if (doc.pcrs) {
                        // Count the number of PCRs
                        var numPcrs = 0;
                        for (var property in doc.pcrs) {
                            if (doc.pcrs.hasOwnProperty(property)) {
                                numPcrs++;
                            }
                        }
                        if (numPcrs > 0) {

                            // Build a new array that will contains the pcr type names
                            var pcrTypesToReturn = [];

                            // Loop over the pcr types
                            for (var pcrType in doc.pcrs) {
                                // Add it to the array
                                pcrTypesToReturn.push(pcrType);
                            }

                            // Now emit the deployment ID and pcr data
                            emit(doc._id,pcrTypesToReturn);
                        }
                    }
                }
            }
        },
        pcrTypeFullTree: {
            map: function(doc) {
                // Make sure it is a deployment first
                if (doc.resource === 'Deployment') {

                    // Create a new document object to return
                    var fullPCRTreeWithoutData = {};

                    // Now makes sure it has some PCR data
                    if (doc.pcrs) {
                        // Count the number of PCRs
                        var numPcrs = 0;
                        for (var property in doc.pcrs) {
                            if (doc.pcrs.hasOwnProperty(property)) {
                                numPcrs++;
                            }
                        }
                        if (numPcrs > 0) {
                            // Loop over the pcr data
                            for (var pcrType in doc.pcrs) {
                                // Add PCR Type
                                fullPCRTreeWithoutData[pcrType] = {};

                                // Now loop over the column names
                                for (var columnName in doc.pcrs[pcrType]) {
                                    // Add column name
                                    fullPCRTreeWithoutData[pcrType][columnName] = {};

                                    // Now loop over the timestamps
                                    for (var epochSec in doc.pcrs[pcrType][columnName]) {

                                        // Add epoch seconds
                                        fullPCRTreeWithoutData[pcrType][columnName][epochSec] = {};
                                    }
                                }
                            }
                        }
                    }
                    // Return the new PCR Tree
                    emit(doc._id,fullPCRTreeWithoutData);
                }
            }
        },
        pcrsByTime: {
            map: function(doc) {
                // Make sure it is a deployment first
                if (doc.resource === 'Deployment') {

                    // Now makes sure it has some PCR data
                    if (doc.pcrs) {
                        // Count the number of PCRs
                        var numPcrs = 0;
                        for (var property in doc.pcrs) {
                            if (doc.pcrs.hasOwnProperty(property)) {
                                numPcrs++;
                            }
                        }
                        if (numPcrs > 0) {

                            // Create an object to hold timestamps and their
                            // associated pcrTypes and pcrRunNames
                            var pcrsByTime = {};

                            // Loop over the pcr types
                            for (var pcrType in doc.pcrs) {
                                // Now loop over the prc columnNames
                                for (var columnName in doc.pcrs[pcrType]) {
                                    // Now loop over the timestamps
                                    for (var timestamp in doc.pcrs[pcrType][columnName]) {
                                        // See if the timestamp is already there
                                        if (!pcrsByTime[timestamp]) {
                                            pcrsByTime[timestamp] = {};
                                        }

                                        // Now check to see if the PCRType has been added
                                        if (!pcrsByTime[timestamp][pcrType]) {
                                            pcrsByTime[timestamp][pcrType] = [];
                                        }

                                        // Add the column name to the object
                                        pcrsByTime[timestamp][pcrType].push(columnName);
                                    }
                                }
                            }

                            // Now I need to sort them by time, so create an object
                            // that will hold the sorted set
                            var sortedPcrsByTime = {};

                            // An array of timestamp that can be sorted
                            var timestampsToSort = [];

                            // Loop over the timestamps
                            for (var timestampToAdd in pcrsByTime) {
                                // Add the timestamp
                                timestampsToSort.push(timestampToAdd);
                            }

                            // Now sort them
                            timestampsToSort.sort();

                            // Now loop over the sorted array and build the sorted
                            // list of PCR runs
                            for (var i = 0; i < timestampsToSort.length; i++) {
                                sortedPcrsByTime[timestampsToSort[i]] = pcrsByTime[timestampsToSort[i]];
                            }

                            // Now emit the deployment ID and pcr data
                            emit(doc._id,sortedPcrsByTime);
                        }
                    }
                }
            }
        },
        protocolRuns: {
            map: function(doc) {
                // Make sure the document is a deployment first
                if (doc.resource === 'Deployment') {

                    // Create an object to hold sorted errors
                    var sortedProtocolRuns = {};

                    // Create an array of timestamps that can be used to sort
                    var timestamps = [];

                    // Check for protocolRuns first
                    if (doc.protocolRuns) {

                        // Add all the timestamps
                        for (ts in doc.protocolRuns) {
                            timestamps.push(ts);
                        }

                        // Now sort
                        timestamps.sort();
                    }

                    // Now build a new object with sorted timestamps
                    for (var i = 0; i < timestamps.length; i++) {
                        sortedProtocolRuns[timestamps[i]] = doc.protocolRuns[timestamps[i]];
                    }

                    // Emit the sorted protocol runs
                    emit(doc._id,sortedProtocolRuns);
                }
            }
        },
        samples: {
            map: function(doc) {
                // Make sure the document is a deployment first
                if (doc.resource === 'Deployment') {

                    // Create an object to hold sorted samples
                    var sortedSamples = {};

                    // Create an array of timestamps that can be used to sort
                    var timestamps = [];

                    // Check for samples
                    if (doc.samples) {

                        // Add all the timestamps
                        for (ts in doc.samples) {
                            timestamps.push(ts);
                        }

                        // Now sort
                        timestamps.sort();
                    }

                    // Now build a new object with the sorted timestamps
                    for (var i = 0; i < timestamps.length; i++) {
                        sortedSamples[timestamps[i]] = doc.samples[timestamps[i]];
                    }

                    // Emit the sorted samples
                    emit(doc._id,sortedSamples);
                }
            }
        }
    },
    esps: {
        all: {
            map: function(doc) {
                if (doc.resource && doc.resource === 'Deployment' && doc.esp) {
                    emit(doc.esp, null);
                }
            },
            reduce: function(keys, values) {
                return true;
            }
        },
        allNames: {
            map: function(doc) {
                if (doc.resource && doc.resource === 'Deployment' && doc.esp && doc.esp.name) {
                    emit(doc.esp.name,null);
                }
            },
            reduce: function(keys, values) {
                return true;
            }
        },
        inDeployment: {
            map: function(doc) {
                if (doc.resource === 'Deployment') {
                    emit(doc.name, doc.esp);
                }
            }
        },
        inDeploymentNames: {
            map: function(doc) {
                emit(doc.name, doc.esp.name);
            }
        }
    },
    users: {
        allUsers: {
            map: function(doc) {
                if (doc.resource && doc.resource === 'User') {
                    emit(doc._id, doc);
                }
            }
        },
        userByLoginTypeAndLoginID: {
            map: function(doc) {
                if (doc.resource && doc.resource === 'User') {
                    emit({
                        'loginType': doc.loginType,
                        'loginID': doc.loginID
                    }, doc);
                }
            }
        }
    }
};