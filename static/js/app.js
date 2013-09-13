// Define the ESP Application Module
var espAppModule = angular.module('espApp', []);

// *********************************************** //
// ********* Shared Service Definitions ********** //
// *********************************************** //

// Create the shared service to coordinate events and state across controllers
espAppModule.factory('espSharedService', function ($rootScope, $http) {

    // This is the name of the currently selected deployment
    var selectedDeploymentName = null;

    // These are the deployments with the selected name
    var selectedDeployments = null;

    // These are the objects that are currently selected for display on the graph
    var objectsOnDisplay = {};

    // Create the shared object
    var espSharedService = {};

    // The method to return the currently selected deployment
    espSharedService.getSelectedDeploymentName = function () {
        return selectedDeploymentName;
    }

    // This is the method that can be used to select the deployment the user is interested in
    espSharedService.setSelectedDeploymentName = function (deploymentName) {
        selectedDeploymentName = deploymentName;
        $rootScope.$broadcast("deploymentSelected");
    }

    // This is a method to get the selected deployments
    espSharedService.getSelectedDeployments = function () {
        return selectedDeployments;
    }

    // This is the method to set the selected deployments
    espSharedService.setSelectedDeployments = function (deployments) {
        //console.log("Setting deployments");
        selectedDeployments = deployments;
    }

    // This method adds an object for display
    espSharedService.addObjectToDisplay = function (objkey) {
        // Check to see if the key is in the list of display items
        if (!(objkey in objectsOnDisplay)) {

            // Add it
            objectsOnDisplay[objkey] = null;

            // Broadcast that it was added
            $rootScope.$broadcast('added-object-to-display', objkey);
        }
    }

    // This method removes an object from the list to display on the graph
    espSharedService.removeObjectFromDisplay = function (objkey) {
        // Check to see if the key is in the list of display items
        if (objkey in objectsOnDisplay) {

            // Remove the key
            delete objectsOnDisplay[objkey];

            // Broadcast that it was added
            $rootScope.$broadcast('removed-object-from-display', objkey);
        }
    }

    // Return the service from the factory
    return espSharedService;
});

// *********************************************** //
// *********** Controller Definitions ************ //
// *********************************************** //

// The controller for the header
function HeaderController($scope, $http, espSharedService) {
    // Set the default selected deployment name to "Select Deployment"
    $scope.selectedDeploymentName = "Select Deployment";

    // Grab the names of the deployment and set to the items in the header
    $http.get('/deployments/names').success(function (data, status, headers, config) {
        $scope.deploymentNames = data;
    });

    // This is the event handler for the user selecting a deployment name
    $scope.selectDeployment = function (index) {
        espSharedService.setSelectedDeploymentName($scope.deploymentNames[index]);
        $scope.selectedDeploymentName = $scope.deploymentNames[index];
    }
}

// The controller for the graph
function SelectionController($scope, $http, espSharedService) {
    // This is the function that gets run when the user selects a deployment.  It
    // queries for the list of deployments with that name and assigns them to the
    // list of deployments associated with this scope
    $scope.$on("deploymentSelected", function () {

        // Need to grab the list of deployments by name
        $http.get('/deployments?name=' +
                encodeURIComponent(espSharedService.getSelectedDeploymentName())).success(function (data, status, headers, config) {
                $scope.deployments = data;
                espSharedService.setSelectedDeployments(data);
            });
    });

    // The function to handle the selection of any check box
    $scope.selectObjectForDisplay = function (event) {
        //console.log(event);
        // Check to see if the user selected or deselected the checkbox
        if (event.target.checked) {
            // Add it to the list of things to display
            //console.log("SELECTED " + event.target.value);
            espSharedService.addObjectToDisplay(event.target.value);
        } else {
            //console.log("DESELECTED " + event.target.value);
            espSharedService.removeObjectFromDisplay(event.target.value);
        }
    }
}

// The controller for the graph
function GraphPanelController($scope, $http, espSharedService) {

    // Set it up so the charts use the user's timezone
    Highcharts.setOptions({
        global: {
            useUTC: false
        }
    });

    // This is a variable that specifies if new data series are to be lines or points
    $scope.lineWidth = 1;

    // Create the HighCharts chart
    $scope.chart = new Highcharts.StockChart({
        chart: {
            renderTo: 'graph-panel',
            type: 'line'
        },
        rangeSelector: {
            selected: 4,
            buttons: [
                {
                    type: 'minute',
                    count: 60,
                    text: '1h'
                },
                {
                    type: 'minute',
                    count: 60 * 6,
                    text: '6h'
                },
                {
                    type: 'minute',
                    count: 60 * 12,
                    text: '12h'
                },
                {
                    type: 'day',
                    count: 1,
                    text: '1d'
                },
                {
                    type: 'week',
                    count: 1,
                    text: '1w'
                },
                {
                    type: 'month',
                    count: 1,
                    text: '1m'
                }
            ]
        },
        navigator: {
            series: {
                type: 'spline'
            }
        },
        title: {
            text: 'ESP Data'
        },
        series: null
    });

    // A mehthod to handle events where an object is to be added to the graph
    $scope.$on('added-object-to-display', function (event, objkey) {
            // Now, depending on the object, get the data for the graph
            var objkeyParts = objkey.split(":");

            // Pull the parts into variables for easier use
            var deploymentID = objkeyParts[0];
            var type = objkeyParts[1];

            // The type should be the second argument
            if (type === "anc") {
                // Grab the source ID from the key
                var sourceID = objkeyParts[2];

                // We need to grab some information from the deployment to graph things properly
                var starttime = null;
                var endtime = null;
                var espName = null;
                var sourceName = null;
                var seriesName = null;
                var seriesUnits = null;

                // Loop over all deployment and look for the one with the right ID
                for (var i = 0; i < espSharedService.getSelectedDeployments().length; i++) {
                    // Check to see if the ID matches
                    if (espSharedService.getSelectedDeployments()[i]._id === deploymentID) {

                        // Grab the dates
                        starttime = espSharedService.getSelectedDeployments()[i].startdate;
                        endtime = espSharedService.getSelectedDeployments()[i].enddate;

                        // Loop over the ancillary sources
                        for (var j = 0; j < espSharedService.getSelectedDeployments()[i].anc_source_array.length; j++) {
                            if (espSharedService.getSelectedDeployments()[i].anc_source_array[j].source_id == sourceID) {
                                espName = espSharedService.getSelectedDeployments()[i].esp.name;
                                sourceName = espSharedService.getSelectedDeployments()[i].anc_source_array[j].source;
                                seriesName = espSharedService.getSelectedDeployments()[i].anc_source_array[j].var_long_name;
                                seriesUnits = espSharedService.getSelectedDeployments()[i].anc_source_array[j].units;
                            }
                        }
                    }
                }

                // Turn on a banner to tell the user we are getting their data
                $scope.chart.showLoading("Fetching data ...");

                // Grab the data via an HTTP call
                // TODO add error handler here
                $http.get('/ancdata?sourceid=' + objkeyParts[2] + '&starttime=' + starttime +
                        '&endtime=' + endtime).success(function (data, status, headers, config) {

                        // Create a new axis
                        var newaxis = {
                            id: objkey,
                            title: espName + " " + seriesName + "(" + seriesUnits + ")"
                        };

                        // If the data is depth, invert the axis
                        if (seriesName.indexOf("Depth") >= 0 || seriesName.indexOf("depth") >=0 ) {
                            newaxis.reversed = true;
                        }

                        // Add the new axis to the chart
                        $scope.chart.addAxis(newaxis);

                        // Now create a new series of data from the reply from the server
                        var newSeries = {
                            name: espName + " " + sourceName + " " + seriesName + " (" + seriesUnits + ")",
                            tooltip: {
                                valueDecimals: 2
                            },
                            data: data,
                            lineWidth: $scope.lineWidth,
                            marker: {
                                enabled: true,
                                radius: 2
                            }
                        };

                        // If a new axis was defined, set it to be the one for the new series
                        if (newaxis) newSeries.yAxis = objkey;

                        // Now add the new series and force an update
                        $scope.chart.addSeries(newSeries, true);

                        // Set a property on the options for the series so that we can remove
                        // and manipulate it later
                        $scope.chart.series[$scope.chart.series.length - 1].options.objkey = objkey;

                        // Also, set the navigator series to be this new one
                        $scope.chart.series[0].setData(data);

                        // If this is the only series, check the time width of the data and if it
                        // is more than one week, set the extremes to the last week.
                        if ($scope.chart.series.length <= 2) {
                            if (data[data.length - 1][0] - data[0][0] > (1000 * 60 * 60 * 24 * 7)) {
                                $scope.chart.xAxis[0].setExtremes(data[data.length - 1][0] - (1000 * 60 * 60 * 24 * 7), data[data.length - 1][0]);
                            }
                        }

                        // And now hide the loading banner
                        $scope.chart.hideLoading();
                    });
            } else if (type === "errors") {

                // Loop over all deployment to find the one we are looking for based on the key
                // of the item the user clicked
                for (var i = 0; i < espSharedService.getSelectedDeployments().length; i++) {

                    // Check for ID match
                    if (espSharedService.getSelectedDeployments()[i]._id === deploymentID &&
                        espSharedService.getSelectedDeployments()[i].errors) {

                        // Create an array to store the errors
                        var flagData = [];

                        // For each error, add it to the array
                        Object.keys(espSharedService.getSelectedDeployments()[i].errors).forEach(function (errorts) {

                                flagData.push({
                                    x: new Date(parseInt(errorts)),
                                    title: "E",
                                    text: espSharedService.getSelectedDeployments()[i].errors[errorts].actor + "<br/><b>" +
                                        espSharedService.getSelectedDeployments()[i].errors[errorts].subject + " < /b><br/ > " +
                                        espSharedService.getSelectedDeployments()[i].errors[errorts].message
                                });
                            }
                        );

                        // Now create a new series
                        var errorSeries = {
                            type: 'flags',
                            data: flagData,
                            shape: 'flag',
                            width: 16
                        };

                        // Add it to the chart
                        $scope.chart.addSeries(errorSeries, true);

                        // Set the object key on the series options so we can find it later
                        $scope.chart.series[$scope.chart.series.length - 1].options.objkey = objkey;

                        // Check to see if this is the only series added, if so, we have to set
                        // the navigator as well so the dates are OK
                        if ($scope.chart.series.length === 2) {
                            $scope.chart.series[0].setData(flagData);
                        }

                        // If this is the only series, set the X Axis to it's extremes
                        if ($scope.chart.series.length <= 2)
                            $scope.chart.xAxis[0].setExtremes();
                    }
                }
            } else if (type === "images") {

                // Loop over all deployment to find the one we are looking for based on the key
                // of the item the user clicked
                for (var i = 0; i < espSharedService.getSelectedDeployments().length; i++) {

                    // Check for ID match
                    if (espSharedService.getSelectedDeployments()[i]._id === deploymentID &&
                        espSharedService.getSelectedDeployments()[i].images) {

                        // Create an array to store the images
                        var flagData = [];

                        // For each image, add it to the array
                        Object.keys(espSharedService.getSelectedDeployments()[i].images).forEach(function (imagets) {

                                flagData.push({
                                    x: new Date(parseInt(imagets)),
                                    title: "I",
                                    text: "<b>" +
                                        espSharedService.getSelectedDeployments()[i].images[imagets].imageFilename +
                                        "</b> (" +
                                        espSharedService.getSelectedDeployments()[i].images[imagets].xPixels + "x" +
                                        espSharedService.getSelectedDeployments()[i].images[imagets].yPixels + ", " +
                                        espSharedService.getSelectedDeployments()[i].images[imagets].exposure + "s)"
                                });
                            }
                        );

                        // Now create a new series
                        var imageSeries = {
                            type: 'flags',
                            data: flagData,
                            shape: 'squarepin',
                            events: {
                                click: function (event) {
                                    console.log("Image flag clicked");
                                    console.log(event);
                                }
                            },
                            width: 16
                        };

                        // Add it to the chart
                        $scope.chart.addSeries(imageSeries, true);

                        // Set the object key on the series options so we can find it later
                        $scope.chart.series[$scope.chart.series.length - 1].options.objkey = objkey;

                        // Check to see if this is the only series added, if so, we have to set
                        // the navigator as well so the dates are OK
                        if ($scope.chart.series.length === 2) {
                            $scope.chart.series[0].setData(flagData);
                        }

                        // If this is the only series, set the X Axis to it's extremes
                        if ($scope.chart.series.length <= 2)
                            $scope.chart.xAxis[0].setExtremes();
                    }
                }
            } else if (type === "processruns") {

                // Loop over all deployment to find the one we are looking for based on the key
                // of the item the user clicked
                for (var i = 0; i < espSharedService.getSelectedDeployments().length; i++) {

                    // Check for ID match
                    if (espSharedService.getSelectedDeployments()[i]._id === deploymentID &&
                        espSharedService.getSelectedDeployments()[i].processRuns) {

                        // Create an array to store the processruns
                        var flagData = [];

                        // For each processrun, add it to the array
                        Object.keys(espSharedService.getSelectedDeployments()[i].processRuns).forEach(function (processrunts) {

                                // Body text
                                var bodyText = "<b>" +
                                    espSharedService.getSelectedDeployments()[i].processRuns[processrunts].name +
                                    "</b> (" +
                                    espSharedService.getSelectedDeployments()[i].processRuns[processrunts].targetVol + " ml)";
                                if (espSharedService.getSelectedDeployments()[i].processRuns[processrunts].archive) {
                                    bodyText += " with archive of " +
                                        espSharedService.getSelectedDeployments()[i].processRuns[processrunts].archive.targetVol + " ml";
                                }
                                flagData.push({
                                    x: new Date(parseInt(processrunts)),
                                    title: "P",
                                    text: bodyText
                                });
                            }
                        );

                        // Now create a new series
                        var processRunSeries = {
                            type: 'flags',
                            data: flagData,
                            shape: 'circlepin',
                            width: 16
                        };

                        // Add it to the chart
                        $scope.chart.addSeries(processRunSeries, true);

                        // Set the object key on the series options so we can find it later
                        $scope.chart.series[$scope.chart.series.length - 1].options.objkey = objkey;

                        // Check to see if this is the only series added, if so, we have to set
                        // the navigator as well so the dates are OK
                        if ($scope.chart.series.length === 2) {
                            $scope.chart.series[0].setData(flagData);
                        }

                        // If this is the only series, set the X Axis to it's extremes
                        if ($scope.chart.series.length <= 2)
                            $scope.chart.xAxis[0].setExtremes();
                    }
                }
            } else if (type === "samples") {

                // Loop over all deployment to find the one we are looking for based on the key
                // of the item the user clicked
                for (var i = 0; i < espSharedService.getSelectedDeployments().length; i++) {

                    // Check for ID match
                    if (espSharedService.getSelectedDeployments()[i]._id === deploymentID &&
                        espSharedService.getSelectedDeployments()[i].samples) {

                        // Create an array to store the samples
                        var flagData = [];

                        // For each sample, add it to the array
                        Object.keys(espSharedService.getSelectedDeployments()[i].samples).forEach(function (samplets) {

                                flagData.push({
                                    x: new Date(parseInt(samplets)),
                                    title: "S",
                                    text: "<b>Start sample targeting " +
                                        espSharedService.getSelectedDeployments()[i].samples[samplets].targetVolume + " ml</b>"
                                });
                            }
                        );

                        // Now create a new series
                        var sampleSeries = {
                            type: 'flags',
                            data: flagData,
                            shape: 'squarepin',
                            width: 16
                        };

                        // If there is ancillary data, just grab the first series and attach it
                        if ($scope.chart.series.length > 1) {
                            sampleSeries.onSeries = $scope.chart.series[1].options.id;
                        }

                        // Add it to the chart
                        $scope.chart.addSeries(sampleSeries, true);

                        // Set the object key on the series options so we can find it later
                        $scope.chart.series[$scope.chart.series.length - 1].options.objkey = objkey;

                        // Check to see if this is the only series added, if so, we have to set
                        // the navigator as well so the dates are OK
                        if ($scope.chart.series.length === 2) {
                            $scope.chart.series[0].setData(flagData);
                        }

                        // If this is the only series, set the X Axis to it's extremes
                        if ($scope.chart.series.length <= 2)
                            $scope.chart.xAxis[0].setExtremes();
                    }
                }
            }
        }
    );

    // This is the method that handles removal of objects from the graph
    $scope.$on('removed-object-from-display', function (event, objkey) {
        // Loop over the data series and look for the one with the matching objkey
        var indexToRemove = -1;
        for (var i = 0; i < $scope.chart.series.length; i++) {
            if ($scope.chart.series[i].options.objkey === objkey) {
                indexToRemove = i;
            }
        }

        // Now if an indexed was matched,
        if (indexToRemove >= 0) {
            // Remove the yAxis first
            $scope.chart.series[indexToRemove].remove(true);
        }

        // Remove the axis as well
        var indexOfAxisToRemove = -1;
        for (var j = 0; j < $scope.chart.yAxis.length; j++) {
            if ($scope.chart.yAxis[j].options.id === objkey) {
                indexOfAxisToRemove = j;
            }
        }
        if (indexOfAxisToRemove >= 0) {
            $scope.chart.yAxis[indexOfAxisToRemove].remove(true);
        }
    });

    // This is the function to change the style of the lines
    $scope.changePlot = function (style) {
        console.log("changePlot requested with " + style);
        // First thing is to change the default value so new charts are created with the
        // correct styling
        if (style === 'lines') {
            $scope.lineWidth = 1;
        } else {
            $scope.lineWidth = 0;
        }
        // Now loop over the series that are already on the chart and set the
        // style to that requested
        for (var i = 1; i < $scope.chart.series.length; i++) {
            if ($scope.chart.series[i].type !== 'flags') {
                // Set the line width based on the input
                if (style === 'lines') {
                    $scope.chart.series[i].update({
                        lineWidth:1
                    });
                } else {
                    $scope.chart.series[i].update({
                        lineWidth:0
                    });
                }
            }
        }
    }
}

function DetailPanelController($scope, $http, espSharedService) {
    // This is the array of tables that are currently loaded
    $scope.detailTables = [];

    // Make sure the modal window is hidden
    $scope.modal = {
        header: ""
    };

    // The method to handle the selection of a details tab
    $scope.selectDetailsTab = function (index) {
        console.log("Tab " + index + " selected");
        // Need to make the correct tab active
        for (var i = 0; i < $scope.detailTables.length; i++) {
            if (i === index) {
                $scope.detailTables[i].active = "active";
            } else {
                $scope.detailTables[i].active = "";
            }
        }
    }

    // This method handles the user selecting a row in the details table
    $scope.selectDetailRow = function (parentIndex, index, row) {
        // Check to see if it is an image and if the image exists on disk
        if ($scope.detailTables[parentIndex] && $scope.detailTables[parentIndex].headers &&
            $scope.detailTables[parentIndex].headers[2] === "Exposure" &&
            $scope.detailTables[parentIndex].onDiskFlag &&
            $scope.detailTables[parentIndex].onDiskFlag[index]) {
            $scope.modal.header = $scope.detailTables[parentIndex].rows[index][1].imageFilename;
            $scope.modal.url = $scope.detailTables[parentIndex].imageUrls[index];
            // Now show the modal
            var element = angular.element('#detailModal');
            element.modal('show');
        } else {
            // Looks like there is no image associated with it so clear things and
            // do not open the modal dialog
            $scope.modal.header = $scope.detailTables[parentIndex].rows[index][1];
            $scope.modal.url = "/image/nothing.jpg";
        }
    }

    // This is the event handler that responds when the user selects something from
    // the check list
    $scope.$on('added-object-to-display', function (event, objkey) {
        // Grab the object key coming in and split it up to find out what the user selected
        var objkeyParts = objkey.split(":");
        var deploymentID = objkeyParts[0];
        var type = objkeyParts[1];

        // First let's see if they specified errors
        if (type === "errors") {
            // Create a new details table entry
            var errorTable = {};

            // Set the object key
            errorTable.objkey = objkey;

            // If this is the first table, make it active
            if ($scope.detailTables.length === 0) {
                errorTable.active = "active";
            }

            // Create an array for the table data
            errorTable.headers = ["Date", "Actor", "Subject", "Message"];
            errorTable.rows = [];

            // Loop over the deployments to find the right one so we can create a table from the errors
            for (var i = 0; i < espSharedService.getSelectedDeployments().length; i++) {

                // Check for ID match
                if (espSharedService.getSelectedDeployments()[i]._id === deploymentID &&
                    espSharedService.getSelectedDeployments()[i].errors) {

                    // Set the tab title
                    errorTable.title = espSharedService.getSelectedDeployments()[i].esp.name + " Errors";

                    // For each error, add it to the array
                    Object.keys(espSharedService.getSelectedDeployments()[i].errors).forEach(function (errorts) {
                            // Create a date
                            var tempDate = new Date(parseInt(errorts));
                            errorTable.rows.push([tempDate.format("mm/dd/yy HH:MM:ss"),
                                espSharedService.getSelectedDeployments()[i].errors[errorts].actor,
                                espSharedService.getSelectedDeployments()[i].errors[errorts].subject,
                                espSharedService.getSelectedDeployments()[i].errors[errorts].message
                            ]);
                        }
                    );
                }
            }
            // Push it on the table
            $scope.detailTables.push(errorTable);
        } else if (type === "images") {
            // Create a new details table entry
            var imageTable = {};

            // Set the object key
            imageTable.objkey = objkey;

            // If this is the first table, make it active
            if ($scope.detailTables.length === 0) {
                imageTable.active = "active";
            }

            // Create an array for the table data
            imageTable.headers = ["Date", "File (click for image)", "Exposure", "Resolution"];
            imageTable.rows = [];
            imageTable.imageUrls = [];
            imageTable.onDiskFlag = [];

            // Loop over the deployments to find the right one so we can create a table from the images
            for (var i = 0; i < espSharedService.getSelectedDeployments().length; i++) {

                // Check for ID match
                if (espSharedService.getSelectedDeployments()[i]._id === deploymentID &&
                    espSharedService.getSelectedDeployments()[i].images) {

                    // Set the tab title
                    imageTable.title = espSharedService.getSelectedDeployments()[i].esp.name + " Images";

                    // For each image, add it to the array
                    Object.keys(espSharedService.getSelectedDeployments()[i].images).forEach(function (imagests) {
                            var tempDate = new Date(parseInt(imagests));
                            imageTable.rows.push([tempDate.format("mm/dd/yy HH:MM:ss"),
                                espSharedService.getSelectedDeployments()[i].images[imagests],
                                espSharedService.getSelectedDeployments()[i].images[imagests].exposure,
                                espSharedService.getSelectedDeployments()[i].images[imagests].xPixels + "x" +
                                    espSharedService.getSelectedDeployments()[i].images[imagests].yPixels
                            ]);
                            imageTable.imageUrls.push(espSharedService.getSelectedDeployments()[i].images[imagests].imageUrl);
                            imageTable.onDiskFlag.push(espSharedService.getSelectedDeployments()[i].images[imagests].downloaded);
                        }
                    );
                }
            }
            // Push it on the table
            $scope.detailTables.push(imageTable);
        } else if (type === "processruns") {
            // Create a new details table entry
            var processRunTable = {};

            // Set the object key
            processRunTable.objkey = objkey;

            // If this is the first table, make it active
            if ($scope.detailTables.length === 0) {
                processRunTable.active = "active";
            }

            // Create an array for the table data
            processRunTable.headers = ["Date", "Name", "Target Vol (ml)", "Archive?", "Archive Vol (ml)"];
            processRunTable.rows = [];

            // Loop over the deployments to find the right one so we can create a table from the processruns
            for (var i = 0; i < espSharedService.getSelectedDeployments().length; i++) {

                // Check for ID match
                if (espSharedService.getSelectedDeployments()[i]._id === deploymentID &&
                    espSharedService.getSelectedDeployments()[i].processRuns) {

                    // Set the tab title
                    processRunTable.title = espSharedService.getSelectedDeployments()[i].esp.name + " Protocol Runs";

                    // For each process run, add it to the array
                    Object.keys(espSharedService.getSelectedDeployments()[i].processRuns).forEach(function (prts) {
                            var tempDate = new Date(parseInt(prts));
                            // Push the date
                            var rowArray = [tempDate.format("mm/dd/yy HH:MM:ss")];
                            // Check for name
                            if (espSharedService.getSelectedDeployments()[i].processRuns[prts].name) {
                                rowArray.push(espSharedService.getSelectedDeployments()[i].processRuns[prts].name);
                            } else {
                                rowArray.push("Unknown");
                            }

                            // Now the target volume
                            if (espSharedService.getSelectedDeployments()[i].processRuns[prts].targetVol) {
                                rowArray.push(espSharedService.getSelectedDeployments()[i].processRuns[prts].targetVol);
                            } else {
                                rowArray.push("Unknown");
                            }

                            // Whether or not an archive was associated with it
                            if (espSharedService.getSelectedDeployments()[i].processRuns[prts].archive) {
                                rowArray.push(true);
                                if (espSharedService.getSelectedDeployments()[i].processRuns[prts].archive.targetVol) {
                                    rowArray.push(espSharedService.getSelectedDeployments()[i].processRuns[prts].archive.targetVol);
                                } else {
                                    rowArray.push(null);
                                }
                            } else {
                                rowArray.push(false);
                                rowArray.push(null);
                            }

                            processRunTable.rows.push(rowArray);
                        }
                    );
                }
            }
            // Push it on the table
            $scope.detailTables.push(processRunTable);
        } else if (type === "samples") {
            // Create a new details table entry
            var samplesTable = {};

            // Set the object key
            samplesTable.objkey = objkey;

            // If this is the first table, make it active
            if ($scope.detailTables.length === 0) {
                samplesTable.active = "active";
            }

            // Create an array for the table data
            samplesTable.headers = ["Start Date", "End Date", "DWSM ?", "Target Vol (ml)", "Actual Vol (ml)", "Diff (ml)"];
            samplesTable.rows = [];

            // Loop over the deployments to find the right one so we can create a table from the samples
            for (var i = 0; i < espSharedService.getSelectedDeployments().length; i++) {

                // Check for ID match
                if (espSharedService.getSelectedDeployments()[i]._id === deploymentID &&
                    espSharedService.getSelectedDeployments()[i].samples) {

                    // Set the tab title
                    samplesTable.title = espSharedService.getSelectedDeployments()[i].esp.name + " Samples";

                    // For each sample, add it to the array
                    Object.keys(espSharedService.getSelectedDeployments()[i].samples).forEach(function (samplets) {
                            var tempDate = new Date(parseInt(samplets));
                            // The row array that will be pushed
                            var rowArray = [tempDate.format("mm/dd/yy HH:MM:ss")];

                            // Check for end date
                            if (espSharedService.getSelectedDeployments()[i].samples[samplets].endts) {
                                var tempEndDate = new Date(parseInt(espSharedService.getSelectedDeployments()[i].samples[samplets].endts));
                                rowArray.push(tempEndDate.format("mm/dd/yy HH:MM:ss"));
                            } else {
                                rowArray.push(null);
                            }

                            // Check to see if it is a DWSM sample
                            if (espSharedService.getSelectedDeployments()[i].samples[samplets].dwsm) {
                                rowArray.push(true);
                            } else {
                                rowArray.push(false);
                            }

                            // Now check for target vol
                            if (espSharedService.getSelectedDeployments()[i].samples[samplets].targetVolume) {
                                rowArray.push(espSharedService.getSelectedDeployments()[i].samples[samplets].targetVolume);
                            } else {
                                rowArray.push(null);
                            }

                            // Now actual volume
                            if (espSharedService.getSelectedDeployments()[i].samples[samplets].actualVolume) {
                                rowArray.push(espSharedService.getSelectedDeployments()[i].samples[samplets].actualVolume);
                            } else {
                                rowArray.push(null);
                            }

                            // Now the difference between actual and target
                            if (espSharedService.getSelectedDeployments()[i].samples[samplets].targetVolume &&
                                espSharedService.getSelectedDeployments()[i].samples[samplets].actualVolume) {
                                rowArray.push(espSharedService.getSelectedDeployments()[i].samples[samplets].targetVolume -
                                    espSharedService.getSelectedDeployments()[i].samples[samplets].actualVolume);
                            } else {
                                rowArray.push(null);
                            }
                            samplesTable.rows.push(rowArray);
                        }
                    );
                }
            }
            // Push it on the table
            $scope.detailTables.push(samplesTable);
        }
    });

    // This is the event handler that responds when the user de-selects something
    // from the checklist
    $scope.$on('removed-object-from-display', function (event, objkey) {
        // Grab the object key coming in and split it up to find out what the user selected
        var objkeyParts = objkey.split(":");
        var deploymentID = objkeyParts[0];
        var type = objkeyParts[1];

        // First let's see if they specified errors
        if (type === "processruns" || type === "samples" || type === "errors" || type === "images") {
            // Loop over details table and remove the one matching the object key
            var indexOfTableToRemove = -1;
            for (var i = 0; i < $scope.detailTables.length; i++) {
                if ($scope.detailTables[i].objkey === objkey) {
                    indexOfTableToRemove = i;
                }
            }
            if (indexOfTableToRemove >= 0) {
                $scope.detailTables.splice(indexOfTableToRemove, 1);
            }
        }
    });
}

// Inject the controllers with parameters
HeaderController.$inject = ['$scope', '$http', 'espSharedService'];
SelectionController.$inject = ['$scope', '$http', 'espSharedService'];
GraphPanelController.$inject = ['$scope', '$http', 'espSharedService'];
DetailPanelController.$inject = ['$scope', '$http', 'espSharedService'];

/* ************************************************* */
/*                 Define Filters                    */
/* ************************************************* */
espAppModule.filter('detailCellContents', function () {
    // This is the filter to return
    var detailCellFilter = function (input) {
        // The incoming in put will be the contents of the cell which can
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