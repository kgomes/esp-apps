/*
 This file lists the various filters that are used throughout the ESP web application
 */

/**
 * This filter takes in an object that has sortable keys and then reverses the
 * order of those keys
 */
espApp.filter('convertTSItemsToArray', function () {
    return function (items, order) {

        // Now create the array to return
        var arrayToReturn = [];

        if (items) {
            // Grab the timestamps
            var originalTimestamps = Object.keys(items);

            // Check the order requested
            if (order && order === 'desc') {
                originalTimestamps.reverse();
            }

            // Loop over timestamps and build the array of object to return
            for (var i = 0; i < originalTimestamps.length; i++) {
                // Grab the item
                var itemToPush = items[originalTimestamps[i]];

                // Add the timestamp
                itemToPush.timestamp = originalTimestamps[i];

                // Add to the array
                arrayToReturn.push(itemToPush);
            }
        }

        // Return the array
        return arrayToReturn;
    }
});

/**
 * This filter removes any characters that cannot be used as an ID on an HTML element and replaces
 * it with an underscore
 */
espApp.filter('htmlIDConverter', function () {

    // The filter that will be returned
    var htmlIDConverter = function (input) {
        // Make sure there is an input
        if (input) {
            // Replace any characters not valid as part of an ID with underscore
            return input.replace(/[^A-Za-z-_0-9.]/g, "_")
        } else {
            return input;
        }
    };

    return htmlIDConverter;
});

espApp.filter('detailCellContents', function () {
    // This is the filter to return
    var detailCellFilter = function (input) {

        // The incoming input will be the contents of the cell which can
        // be primitives or objects.  If they are primitives, they are just
        // rendered as is.  If objects, we can apply custom rendering
        if (input) {
            // Check for objects first
            if (typeof input === 'object') {
                // Now look for the 'imageUrl' attribute
                if (input.imageUrl) {
                    // Since it is an image URL, look to see if is on disk
                    if (input.downloaded) {
                        return '<a href="javascript:void(0)">' + input.imageFilename + '</a>';
                    } else {
                        return input.imageFilename;
                    }
                } else if (input.fileUrl) {
                    // Since the input has a file URL, make it a link
                    if (input.isOnDisk) {
                        return '<a href="javascript:void(0)">' + input.filename + '</a>';
                    } else {
                        return input.filename;
                    }
                } else {
                    // Not an image object
                    return null;
                }
            } else {
                // Not an object, so just return it
                return input;
            }
        } else {
            // There was nothing there, return nothing
            return input;
        }
    };

    // Now return the filter
    return detailCellFilter;
});