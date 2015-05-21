'use strict';

/*
 This is the controller to manage the main graph of the application
 */

espApp.controller('GraphPanelController',
    // The controller for the graph
    function GraphPanelController($scope, $http, $log, espAppCoordinator, deploymentData) {

        // Set it up so the charts use the user's timezone
        Highcharts.setOptions({
            global: {
                useUTC: false
            }
        });

        // This is a flag to indicate if the user has chosen to align Y Axes scales
        $scope.yAxisAlign = false;

        // This is a variable that specifies if new data series are to be lines or points
        $scope.lineWidth = 1;

        // Create the HighCharts chart
        $scope.chart = new Highcharts.StockChart({
            chart: {
                renderTo: 'graph',
                type: 'line',
                zoomType: 'x'
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
                    id: 'navigator',
                    data: [],
                    type: 'spline'
                },
                yAxis: {
                    title: {
                        text: ""
                    }
                }
            },
            title: {
                text: 'ESP Portal'
            },
            xAxis: {
                ordinal: false,
                type: 'datetime'
            },
            plotOptions: {
                series: {
                    events: {
                        click: function (e) {
                            // First thing is to make sure it is not a series with flags
                            $log.log("target clicked", e);
                            if (e.delegateTarget.options.type !== 'flags') {
                                var invertY = false;
                                if (e.delegateTarget.options.varLongName &&
                                    e.delegateTarget.options.varLongName.indexOf("Depth") >= 0 ||
                                    e.delegateTarget.options.varLongName.indexOf("depth") >= 0) {
                                    invertY = true;
                                }
                                setNavigator(e.delegateTarget.options.varName, e.delegateTarget.options.data, invertY);
                            }
                        }
                    }
                }
            }
        });

        // -------------------------------------------------------------------------
        // Event handlers
        // -------------------------------------------------------------------------

        // A method to handle events where an object was selected by the user
        $scope.$on('objectSelected', function (event, messageObject) {
                $log.log("Object was selected, graph should do something: ", messageObject);

                // Grab the object key
                var objkey = messageObject.objkey;

                // Pull apart the object key to find what we need to plot
                var objkeyParts = objkey.split("-");

                // Grab the input type
                var inputType = objkeyParts[0];
                var deploymentID = objkeyParts[1];
                var property = objkeyParts[2];

                // If the property is ancillary data, call the function to plot it
                if (property === 'ancdata') {
                    // Grab the deployment that should be on the message object
                    var deployment = messageObject.deployment;

                    // Grab the sourceID
                    var sourceID = objkeyParts[3]
                    plotAncdata(objkey, deployment, sourceID);
                } else if (property === 'errors') {
                    // Grab the deployment that should be on the message object
                    var deployment = messageObject.deployment;

                    // Now call the method to show them on the plot
                    displayErrors(objkey, deployment);
                } else if (property === "images") {
                    // Grab the deployment that should be on the message object
                    var deployment = messageObject.deployment;

                    // Now call the method to show them on the plot
                    displayImages(objkey, deployment);
                } else if (property === "protocolRuns") {
                    // Grab the deployment that should be on the message object
                    var deployment = messageObject.deployment;

                    // Now call the method to show them on the plot
                    displayProtocolRuns(objkey, deployment);
                } else if (property === "samples") {
                    // Grab the deployment that should be on the message object
                    var deployment = messageObject.deployment;

                    // Now call the method to show them on the plot
                    displaySamples(objkey, deployment);
                } else if (property === "pcrs") {
                    // Grab the deployment that should be on the message object
                    var deployment = messageObject.deployment;

                    // Now call the method to show them on the plot
                    displayPCRs(objkey, deployment);
                }
                /*

                 // The type should be the second argument
                 if (type === "anc") {
                 } else if (type === "errors") {

                 } else if (type === "images") {

                 } else if (type === "processruns") {

                 } else if (type === "samples") {

                 } else if (type === "pcrs") {

                 // Loop over all deployments to find the one we are looking for based on the key
                 // of the item the user clicked
                 for (var i = 0; i < espAppCoordinator.getSelectedDeployments().length; i++) {

                 // Check for ID match
                 if (espAppCoordinator.getSelectedDeployments()[i]._id === deploymentID &&
                 espAppCoordinator.getSelectedDeployments()[i].pcrs) {

                 // Create an array to store the PCRs
                 var flagData = [];

                 // For each PCR, add it to the array
                 Object.keys(espAppCoordinator.getSelectedDeployments()[i].pcrs).forEach(function (pcrts) {

                 flagData.push({
                 x: new Date(parseInt(pcrts)),
                 title: espAppCoordinator.getSelectedDeployments()[i].pcrs[pcrts].name,
                 text: "<b>PCR run writing to file " +
                 espAppCoordinator.getSelectedDeployments()[i].pcrs[pcrts].filename + "</b>"
                 });
                 }
                 );

                 // Now create a new series
                 var pcrSeries = {
                 type: 'flags',
                 data: flagData,
                 shape: 'squarepin',
                 width: 16
                 };

                 // Add it to the chart
                 $scope.chart.addSeries(pcrSeries, true);

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
                 */
            }
        );

        // This is the method that handles removal of objects from the graph
        $scope.$on('objectDeselected', function (event, messageObject) {
            // Grab the object key
            var objkey = messageObject.objkey;
            $log.log("Graph panel got object with key " + objkey + " deselected");
            removeSeriesByObjectKey(objkey);
        });

        // This is the function to change the style of the lines
        $scope.changePlot = function (style) {
            $log.log("changePlot requested with " + style);
            // First thing is to change the default value so new charts are created with the
            // correct styling
            if (style === 'lines') {
                $scope.lineWidth = 1;
            } else {
                $scope.lineWidth = 0;
            }
            // Now loop over the series that are already on the chart and set the
            // style to that requested
            for (var i = 0; i < $scope.chart.series.length; i++) {
                if ($scope.chart.series[i].type !== 'flags') {
                    // Set the line width based on the input
                    if (style === 'lines') {
                        $scope.chart.series[i].update({
                            lineWidth: 1
                        });
                    } else {
                        $scope.chart.series[i].update({
                            lineWidth: 0
                        });
                    }
                }
            }
        };

        // The function to align y axis scales
        $scope.alignYAxes = function () {
            // First check to see if the Y Axes are already aligned
            if ($scope.yAxisAlign) {
                // Loop over the Y Axes and null out min and maxs to allow for auto scaling
                if ($scope.chart.yAxis.length > 0) {
                    for (var i = 0; i < $scope.chart.yAxis.length; i++) {
                        if (i > 1) {
                            $scope.chart.yAxis[i].setExtremes(null, null);
                        }
                    }
                }

                // Set the flag that the Y Axes are no longer aligned
                $scope.yAxisAlign = false;
            } else {

                // Loop over all the Y Axes first
                if ($scope.chart.yAxis.length > 0) {
                    // Create variable to hold the min/max for normal axes
                    var normalAxisMin;
                    var normalAxisMax;

                    // And for any reversed Axes
                    var reversedAxisMin;
                    var reversedAxisMax;

                    // Loop over the Y Axes
                    for (var i = 0; i < $scope.chart.yAxis.length; i++) {
                        if (i > 1) {
                            // Check to see if the axis is a inverted axis or not
                            if ($scope.chart.yAxis[i].reversed) {
                                // Now compare max values
                                if (typeof(reversedAxisMax) === 'undefined' || reversedAxisMax < $scope.chart.yAxis[i].max) {
                                    // Set the max
                                    reversedAxisMax = $scope.chart.yAxis[i].max;
                                }
                                // And now min values
                                if (typeof(reversedAxisMin) === 'undefined' || reversedAxisMin > $scope.chart.yAxis[i].min) {
                                    // Set the min
                                    reversedAxisMin = $scope.chart.yAxis[i].min;
                                }
                            } else {
                                // Now compare max values
                                if (typeof(normalAxisMax) === 'undefined' || $scope.chart.yAxis[i].max > normalAxisMax) {
                                    // Set the max
                                    normalAxisMax = $scope.chart.yAxis[i].max;
                                }
                                // And now min values
                                if (typeof(normalAxisMin) === 'undefined' || $scope.chart.yAxis[i].min < normalAxisMin) {
                                    // Set the min
                                    normalAxisMin = $scope.chart.yAxis[i].min;
                                }
                            }
                        }
                    }

                    // Now loop over and set all axes to the same min/max
                    for (var i = 0; i < $scope.chart.yAxis.length; i++) {
                        if (i > 1) {
                            if ($scope.chart.yAxis[i].reversed){
                                $scope.chart.yAxis[i].setExtremes(reversedAxisMin, reversedAxisMax);
                            } else {
                                $scope.chart.yAxis[i].setExtremes(normalAxisMin, normalAxisMax);
                            }
                        }
                    }
                }

                // Set the flag that the axes are aligned
                $scope.yAxisAlign = true;
            }
        };

        // -------------------------------------------------------------------------
        // Helper functions
        // -------------------------------------------------------------------------

        // A function to set the data and label on the navigator
        var setNavigator = function (label, data, invertYAxis) {
            var navigatorSeries = $scope.chart.get('navigator');
            if (navigatorSeries) {
                navigatorSeries.setData(data);
                navigatorSeries.yAxis.setTitle({
                    text: label
                });
                // Check to see if the yAxis needs inversion
                if (invertYAxis) {
                    navigatorSeries.yAxis.reversed = true;
                } else {
                    navigatorSeries.yAxis.reversed = false;
                }
            }
        }

        // The functions to display the errors on the chart
        var displayErrors = function (objkey, deployment) {
            // Create an array to store the errors
            var flagData = [];

            // Check for errors
            if (deployment.errorsExist) {
                // Grab the error list from the server
                deploymentData.getDeploymentErrors(deployment._id, function (errorObject) {

                    // For each error, add it to the array
                    Object.keys(errorObject).forEach(function (errorts) {
                            flagData.push({
                                x: new Date(parseInt(errorts)),
                                title: "E",
                                text: '<b>' +
                                errorObject[errorts].subject + '</b><br/ >' +
                                errorObject[errorts].message
                            });
                        }
                    );

                    // Now create a new series
                    var errorSeries = {
                        id: objkey,
                        type: 'flags',
                        data: flagData,
                        shape: 'flag',
                        color: '#FF0000',
                        width: 4
                    };

                    // Add it to the chart
                    $scope.chart.addSeries(errorSeries, true);

                    // If this is the only series, run the date axis to its extremes
                    if ($scope.chart.series.length <= 2) {
                        $scope.chart.xAxis[0].setExtremes();
                    }

                });
            }

        }

        // This function displays the image information on the graph panel
        var displayImages = function (objkey, deployment) {
            // First make sure the deployment and images exist
            if (deployment && deployment.imagesExist) {

                // Grab the images object from the server
                deploymentData.getDeploymentImages(deployment._id, function (imagesObject) {

                    // Make sure there is data
                    if (imagesObject) {
                        // Create an array to store the images
                        var flagData = [];

                        // For each image, add it to the array
                        Object.keys(imagesObject).forEach(function (imagets) {

                                flagData.push({
                                    x: new Date(parseInt(imagets)),
                                    title: "I",
                                    text: "<b>" +
                                    imagesObject[imagets].imageFilename +
                                    "</b> (" +
                                    imagesObject[imagets].xPixels + "x" +
                                    imagesObject[imagets].yPixels + ", " +
                                    imagesObject[imagets].exposure + "s)"
                                });
                            }
                        );

                        // Now create a new series
                        var imageSeries = {
                            id: objkey,
                            type: 'flags',
                            data: flagData,
                            shape: 'squarepin',
                            color: '#00AA33',
                            width: 4,
                            events: {
                                click: function (event) {
                                    $log.log("Image flag clicked");
                                    $log.log(event);
                                }
                            }
                        };

                        // Add it to the chart
                        $scope.chart.addSeries(imageSeries, true);

                        // If this is the only series, set the X Axis to it's extremes
                        if ($scope.chart.series.length <= 2)
                            $scope.chart.xAxis[0].setExtremes();
                    }
                });
            }
        }

        // This function displays the protocolRun information on the graph panel
        var displayProtocolRuns = function (objkey, deployment) {
            // First make sure the deployment and protocolRuns exist
            if (deployment && deployment.protocolRunsExist) {

                // Grab the protocolRuns object from the server
                deploymentData.getProtocolRuns(deployment._id, function (protocolRunsObject) {

                        // Make sure there is data
                        if (protocolRunsObject) {
                            // Create an array to store the protocolRuns
                            var flagData = [];

                            // For each ProtocolRun, add it to the array
                            Object.keys(protocolRunsObject).forEach(function (protocolRunTS) {

                                    var bodyText = "<b>" +
                                        protocolRunsObject[protocolRunTS].name +
                                        "</b> (" +
                                        protocolRunsObject[protocolRunTS].targetVol + " ml)";
                                    if (protocolRunsObject[protocolRunTS].archive) {
                                        bodyText += " with archive of " +
                                            protocolRunsObject[protocolRunTS].archive.targetVol + " ml";
                                    }
                                    flagData.push({
                                        x: new Date(parseInt(protocolRunTS)),
                                        title: "P",
                                        text: bodyText
                                    });
                                }
                            );

                            // Now create a new series
                            var protocolRunSeries = {
                                id: objkey,
                                type: 'flags',
                                data: flagData,
                                shape: 'circlepin',
                                color: '#0011AA',
                                width: 4,
                                events: {
                                    click: function (event) {
                                        $log.log("ProtcolRun clicked");
                                        $log.log(event);
                                    }
                                }
                            };

                            // Add it to the chart
                            $scope.chart.addSeries(protocolRunSeries, true);

                            // If this is the only series, set the X Axis to it's extremes
                            if ($scope.chart.series.length <= 2)
                                $scope.chart.xAxis[0].setExtremes();
                        }
                    }
                )
                ;
            }
        }

        // This function displays the sample information on the graph panel
        var displaySamples = function (objkey, deployment) {
            // First make sure the deployment and samples exist
            if (deployment && deployment.samplesExist) {

                // Grab the samples object from the server
                deploymentData.getSamples(deployment._id, function (samplesObject) {

                        // Make sure there is data
                        if (samplesObject) {
                            // Create an array to store the samples
                            var flagData = [];

                            // Create an array for plotbands on the Xaxis
                            var plotBands = [];

                            // For each Sample, add it to the array
                            Object.keys(samplesObject).forEach(function (sampleTS) {
                                    // First push the data into the array
                                    flagData.push({
                                        x: new Date(parseInt(sampleTS)),
                                        title: "S",
                                        text: "<b>" + deployment.esp.name + "-Start sample targeting " +
                                        samplesObject[sampleTS].targetVolume + " ml</b>"
                                    });

                                    // Next, push a plot band if the sample has start and end times
                                    $log.log(samplesObject[sampleTS]);
                                    if (samplesObject[sampleTS].endts) {
                                        var startDate = new Date(parseInt(sampleTS));
                                        var endDate = new Date(samplesObject[sampleTS].endts);
                                        var sampleID = objkey + '_' + sampleTS;
                                        $log.log("Going to add plot band");
                                        $log.log("from: ", startDate);
                                        $log.log("to: ", endDate);
                                        $log.log("SampleID: ", sampleID);
                                        $scope.chart.xAxis[0].addPlotBand({
                                            id: objkey,
                                            color: '#FCFFC5',
                                            from: startDate,
                                            to: endDate
                                        });
                                    }
                                }
                            );

                            // Now create a new series
                            var sampleSeries = {
                                id: objkey,
                                type: 'flags',
                                data: flagData,
                                shape: 'squarepin',
                                color: '#FFCC00',
                                width: 4,
                                events: {
                                    click: function (event) {
                                        $log.log("Sample clicked");
                                        $log.log(event);
                                    }
                                }
                            };

                            // Add it to the chart
                            $scope.chart.addSeries(sampleSeries, true);

                            // If this is the only series, set the X Axis to it's extremes
                            if ($scope.chart.series.length <= 2)
                                $scope.chart.xAxis[0].setExtremes();
                        }
                    }
                )
                ;
            }
        }

        // The functions to display the pcr runs on the chart
        var displayPCRs = function (objkey, deployment) {
            // Create an array to store the PCRs
            var flagData = [];

            // Check for PCRs first
            if (deployment.pcrsExist) {
                // Grab the pcr list from the server
                deploymentData.getPCRsByTime(deployment._id, function (pcrsByTimeObject) {

                    // For each PCR Run, add it to the array
                    Object.keys(pcrsByTimeObject).forEach(function (pcrts) {
                            flagData.push({
                                x: new Date(parseInt(pcrts)),
                                title: "R",
                                text: '<b>PCR: ' +
                                pcrsByTimeObject[pcrts].pcrType + '</b><br/ >' +
                                pcrsByTimeObject[pcrts].pcrRunName
                            });
                        }
                    );

                    // Now create a new series
                    var pcrByTimeSeries = {
                        id: objkey,
                        type: 'flags',
                        data: flagData,
                        shape: 'flag',
                        color: '#C438D1',
                        width: 4
                    };

                    // Add it to the chart
                    $scope.chart.addSeries(pcrByTimeSeries, true);

                    // If this is the only series, run the date axis to its extremes
                    if ($scope.chart.series.length <= 2) {
                        $scope.chart.xAxis[0].setExtremes();
                    }

                });
            }

        }

        // Define a function to plot ancillary data
        var plotAncdata = function (objkey, deployment, sourceID) {

            // We need to grab some information from the deployment to graph things properly
            var objkeyLocal = objkey;
            var deploymentLocal = deployment;
            var sourceIDLocal = sourceID;
            var startDate = null;
            var endDate = null;
            var espName = null;
            var sourceName = null;
            var varName = null;
            var varLongName = null;
            var varUnits = null;

            if (objkeyLocal && deploymentLocal && sourceIDLocal) {
                startDate = deploymentLocal.startDate;
                endDate = deploymentLocal.endDate;
                espName = deploymentLocal.esp.name;

                // Loop over the ancillary sources
                for (var source in deploymentLocal.ancillaryData) {
                    // Loop over the variables keyed by units in the log file
                    for (var logUnit in deploymentLocal.ancillaryData[source]) {
                        if (deploymentLocal.ancillaryData[source][logUnit] &&
                            deploymentLocal.ancillaryData[source][logUnit].sourceID) {
                            // Convert both IDs to numbers and compare
                            if (parseInt(deploymentLocal.ancillaryData[source][logUnit].sourceID) === parseInt(sourceIDLocal)) {
                                sourceName = source;
                                varName = deploymentLocal.ancillaryData[source][logUnit].varName;
                                varLongName = deploymentLocal.ancillaryData[source][logUnit].varLongName;
                                varUnits = deploymentLocal.ancillaryData[source][logUnit].units;
                            }
                        }
                    }
                }

                // Create the series name
                var seriesName = espName + " " + sourceName + " " + varLongName + " (" + varUnits + ")";

                // Turn on a banner to tell the user we are getting their data
                $scope.chart.showLoading("Fetching data ...");

                // Call the data method
                deploymentData.getAncillaryData(sourceIDLocal, startDate, endDate, function (data) {

                    // Create a new Y axis
                    var newAxis = {
                        id: objkeyLocal,
                        title: espName + " " + varLongName + "(" + varUnits + ")"
                    };

                    // If the data is depth, invert the axis
                    if (varLongName.indexOf("Depth") >= 0 || varLongName.indexOf("depth") >= 0) {
                        newAxis.reversed = true;
                    }

                    // Add the new axis to the chart
                    $scope.chart.addAxis(newAxis);

                    // Now create a new series of data from the reply from the server
                    var newSeries = {
                        id: objkey,
                        name: seriesName,
                        tooltip: {
                            valueDecimals: 2
                        },
                        data: data,
                        lineWidth: $scope.lineWidth,
                        marker: {
                            enabled: true,
                            radius: 2
                        },
                        yAxis: objkeyLocal
                    };

                    // Now add the new series and force an update
                    $scope.chart.addSeries(newSeries, true);

                    // Now add a couple of optional attributes
                    $scope.chart.series[$scope.chart.series.length - 1].options.sourceName = sourceName;
                    $scope.chart.series[$scope.chart.series.length - 1].options.varName = varName;
                    $scope.chart.series[$scope.chart.series.length - 1].options.varLongName = varLongName;
                    $scope.chart.series[$scope.chart.series.length - 1].options.varUnits = varUnits;

                    // If this will be the first series added, use that data for the
                    // navigator too.
                    if ($scope.chart.series.length === 2) {
                        // Try to find the navigator series
                        var navigatorSeries = $scope.chart.get('navigator');
                        if (navigatorSeries) {
                            navigatorSeries.setData(data);
                            navigatorSeries.yAxis.setTitle({
                                text: varName
                            });
                        }
                    }

                    // If this is the only series, check the time width of the data and if it
                    // is more than one week, set the extremes to the last week.
                    if ($scope.chart.series.length <= 2) {
                        // Make sure there is data first
                        if (data && data.length > 0) {
                            if (data[data.length - 1][0] - data[0][0] > (1000 * 60 * 60 * 24 * 7)) {
                                $scope.chart.xAxis[0].setExtremes(data[data.length - 1][0] - (1000 * 60 * 60 * 24 * 7), data[data.length - 1][0]);
                            } else {
                                $scope.chart.xAxis[0].setExtremes();
                            }
                        }
                    }

                    // Now set the colors of the yAxis to match that of the series
                    $scope.chart.series[$scope.chart.series.length - 1].yAxis.update({
                        lineColor: $scope.chart.series[$scope.chart.series.length - 1].color,
                        labels: {
                            style: {
                                color: $scope.chart.series[$scope.chart.series.length - 1].color
                            }
                        }
                    });

                    // And now hide the loading banner
                    $scope.chart.hideLoading();
                });
            }
        }

        // A function to remove a series by it's object key
        var removeSeriesByObjectKey = function (objkey) {
            // Make sure an object key was submitted
            if (objkey) {

                $scope.chart.showLoading("Removing data from chart ...");

                // Find the series by ID
                var seriesToRemove = $scope.chart.get(objkey);
                $log.log("Series to remove: ", seriesToRemove);

                // Try to find the axis as well
                var yAxisToRemove = null;
                for (var i = 0; i < $scope.chart.yAxis.length; i++) {
                    if ($scope.chart.yAxis[i].options.id === objkey) {
                        yAxisToRemove = $scope.chart.yAxis[i];
                    }
                }
                $log.log("yAxisToRemove: ", yAxisToRemove);

                // If the series was found, remove it
                if (seriesToRemove) {
                    // Remove it
                    seriesToRemove.remove(true);
                    $log.log("Series should be gone");

                    // If this will be the last series to be removed, clear the
                    // navigator data
                    if ($scope.chart.series.length === 1) {
                        // Try to find the navigator series
                        var navigatorSeries = $scope.chart.get('navigator');
                        if (navigatorSeries) {
                            navigatorSeries.setData([]);
                            navigatorSeries.yAxis.setTitle({
                                text: ''
                            });
                        }
                    } else {
                        // Set the data to be from the next series in slot [1]
                        var navigatorSeries = $scope.chart.get('navigator');
                        if (navigatorSeries) {
                            navigatorSeries.setData($scope.chart.series[1].options.data);
                            $log.log($scope.chart.series[1]);
                            navigatorSeries.yAxis.setTitle({
                                text: $scope.chart.series[1].options.varName
                            });
                        }
                    }
                    $log.log("Navigator should be adjusted");
                }

                // Now remove the axis if it was found
                if (yAxisToRemove) {
                    yAxisToRemove.remove(true);
                    $log.log("yAxis is gone");
                }

                // Also if the object key contains 'samples' remove the plot bands
                if (objkey.indexOf('samples') >= 0) {
                    $scope.chart.xAxis[0].removePlotBand(objkey);
                }
                $log.log("Should be all done");

                // Turn off loading indicator
                $scope.chart.hideLoading();

            }
        }
    })
;