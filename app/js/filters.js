/*
 This file lists the various filters that are used throughout the ESP web application
 */
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