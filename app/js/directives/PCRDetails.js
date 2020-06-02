'use strict';

espApp.directive('pcrDetails', function () {
    return {
        restrict: 'E',
        replace: true,
        templateUrl: 'templates/directives/PCRDetails.html',
        controller: 'PCRDetailsController'
    };
});

espApp.controller("PCRDetailsController", function PCRDetailsController($scope, $log, deploymentData) {
    // Grab a reference to me
    var me = this;

    // The scoped object that holds all the PCRs for the selected deployment
    $scope.pcrTree = {};

    // The data that is currently being plotted
    $scope.pcrData = {};

    // Grab the Deployment ID from the parent tab
    $scope.deploymentID = $scope.$parent.tab.deploymentID;

    // This is the the data that is to be used for the xAxis (temperature|cycle)
    $scope.xValuesType = 'cycle';

    // This is the chart that will be used to plot the PCR data
    $scope.chart = new Highcharts.Chart({
        chart: {
            renderTo: 'pcr-details-graph',
            zoomType: 'x'
        },
        title: {
            text: 'PCR Data'
        },
        xAxis: {
            title: {
                text: 'Cycle #'
            }
        },
        yAxis: {
            title: {
                text: 'Raw Fluorescence'
            }
        }
    });

    // The method to handle the selection of a PCR variable
    $scope.selectPCRObject = function (event) {

        // Grab the parameter that was clicked and parse off the needed properties
        var paramArray = event.target.defaultValue.split("-");
        var pcrType = paramArray[3];
        var pcrRunName = paramArray[4];
        var pcrVariableName = paramArray[5];
        var pcrStartEpochMillis = paramArray[6];
        var startDateOfPCR = new Date(0);
        startDateOfPCR.setUTCMilliseconds(pcrStartEpochMillis);

        // Create an object key from the parameters
        var objkey = pcrType + "-" + pcrRunName + "-" + pcrVariableName + "-" + pcrStartEpochMillis;

        // First thing to do is check to see if the user selected or deselected the pcr variable
        if (event.target.checked) {

            // Grab the data from the server
            deploymentData.getPCRData($scope.deploymentID, pcrType + "-" + pcrRunName, pcrVariableName, pcrStartEpochMillis, function (pcrData) {

                // If data was returned, add it to the local object for tracking of data
                if (pcrData) {
                    // Add the data to the object so it can be used to change the way it's plotted
                    $scope.pcrData[objkey] = pcrData;

                    // Now plot it
                    plotPcrData(objkey);
                }
            });
        } else {
            // Delete the series from the chart
            $scope.chart.get(objkey).remove(true);

            // Remove it from the tracked data
            delete $scope.pcrData[objkey];
        }

    };

    /**
     * This method takes in an object key and then calls the correct plot method depending on which
     * xValuesType is currently set
     * @param objkey
     */
    var plotPcrData = function (objkey) {
        // Check the current xValueType and route to the correct method
        if ($scope.xValuesType === 'cycle') {
            plotByCycle(objkey);
        } else if ($scope.xValuesType === 'temperature') {
            plotByTemperature(objkey);
        } else if ($scope.xValuesType === 'derivative') {
            plotByDerivative(objkey);
        }
    };

    /**
     * This method takes in an object key and updates the chart with a series of data associated with that
     * key.  It will use the cycle number as the xAxis.  Note that it will remove an existing series if one
     * is already on the chart
     * @param objkey
     */
    var plotByCycle = function (objkey) {
        // Make sure the object key is defined
        if (objkey) {
            // Split the key to get the information we need
            var objkeyParts = objkey.split("-");
            var pcrType = objkeyParts[0];
            var pcrRunName = objkeyParts[1];
            var pcrVariableName = objkeyParts[2];
            var pcrStartEpochMillis = objkeyParts[3];
            var startDateOfPCR = new Date(0);
            startDateOfPCR.setUTCMilliseconds(pcrStartEpochMillis);

            // First thing to do is check to see if there is an existing series
            if ($scope.chart.get(objkey))
                $scope.chart.get(objkey).remove();

            // Check to make sure the data has been loaded locally
            if ($scope.pcrData[objkey]) {

                // Create the data array to plot
                var dataToPlot = [];
                for (var i = 0; i < $scope.pcrData[objkey].length; i++) {
                    dataToPlot.push([$scope.pcrData[objkey][i][0], $scope.pcrData[objkey][i][3]]);
                }

                // Create the new series
                var newSeries = {
                    id: objkey,
                    name: pcrType + " " + pcrRunName + " " + pcrVariableName + " (" + startDateOfPCR.format("m/dd/yy") + ")",
                    tooltip: {
                        valueDecimals: 2
                    },
                    data: dataToPlot,
                    marker: {
                        enabled: true,
                        radius: 2
                    }
                };

                // Now add the new series and force an update
                $scope.chart.addSeries(newSeries, true);
            }
        }
    }

    /**
     * This method takes in an object key and updates the chart with a series of data associated with that
     * key.  It will use the temperature as the xAxis.  Note that it will remove an existing series if one
     * is already on the chart
     * @param objkey
     */
    var plotByTemperature = function (objkey) {
        // Make sure the object key is defined
        if (objkey) {
            // Split the key to get the information we need
            var objkeyParts = objkey.split("-");
            var pcrType = objkeyParts[0];
            var pcrRunName = objkeyParts[1];
            var pcrVariableName = objkeyParts[2];
            var pcrStartEpochMillis = objkeyParts[3];
            var startDateOfPCR = new Date(0);
            startDateOfPCR.setUTCMilliseconds(pcrStartEpochMillis);

            // First thing to do is check to see if there is an existing series
            if ($scope.chart.get(objkey))
                $scope.chart.get(objkey).remove();

            // Check to make sure the data has been loaded locally
            if ($scope.pcrData[objkey]) {

                // Create the data array to plot
                var dataToPlot = [];
                for (var i = 0; i < $scope.pcrData[objkey].length; i++) {
                    dataToPlot.push([$scope.pcrData[objkey][i][2], $scope.pcrData[objkey][i][3]]);
                }

                // Create the new series
                var newSeries = {
                    id: objkey,
                    name: pcrType + " " + pcrRunName + " " + pcrVariableName + " (" + startDateOfPCR.format("m/dd/yy") + ")",
                    tooltip: {
                        valueDecimals: 2
                    },
                    data: dataToPlot,
                    marker: {
                        enabled: true,
                        radius: 2
                    }
                };

                // Now add the new series and force an update
                $scope.chart.addSeries(newSeries, true);
            }
        }
    };

    /**
     * This method takes in an object key and updates the chart with a series of data associated with that
     * key.  It will use derivative of the data in the plot.  Note that it will remove an existing series if one
     * is already on the chart
     * @param objkey
     */
    var plotByDerivative = function (objkey) {
        // Make sure the object key is defined
        if (objkey) {
            // Split the key to get the information we need
            var objkeyParts = objkey.split("-");
            var pcrType = objkeyParts[0];
            var pcrRunName = objkeyParts[1];
            var pcrVariableName = objkeyParts[2];
            var pcrStartEpochMillis = objkeyParts[3];
            var startDateOfPCR = new Date(0);
            startDateOfPCR.setUTCMilliseconds(pcrStartEpochMillis);

            // First thing to do is check to see if there is an existing series
            if ($scope.chart.get(objkey))
                $scope.chart.get(objkey).remove();

            // Check to make sure the data has been loaded locally
            if ($scope.pcrData[objkey]) {

                // Create the data array to plot
                var dataToPlot = [];
                for (var i = 1; i < $scope.pcrData[objkey].length; i++) {
                    // Calculate the average temp between the last and this data point
                    var avgTemp = ($scope.pcrData[objkey][i][2] + $scope.pcrData[objkey][i - 1][2]) / 2;

                    // Calculate the change in temperature
                    var deltaTemp = $scope.pcrData[objkey][i][2] - $scope.pcrData[objkey][i - 1][2];

                    // Calculate the change in raw florescence
                    var deltaFlor = $scope.pcrData[objkey][i][3] - $scope.pcrData[objkey][i - 1][3];

                    // Now calculate the derivative
                    var derivative = -(deltaFlor / deltaTemp);

                    // And push the data for plotting
                    if (isFinite(derivative))
                        dataToPlot.push([avgTemp, derivative]);
                }

                // Create the new series
                var newSeries = {
                    id: objkey,
                    name: pcrType + " " + pcrRunName + " " + pcrVariableName + " (" + startDateOfPCR.format("m/dd/yy") + ")",
                    tooltip: {
                        valueDecimals: 2
                    },
                    data: dataToPlot,
                    marker: {
                        enabled: true,
                        radius: 2
                    }
                };

                // Now add the new series and force an update
                $scope.chart.addSeries(newSeries, true);
            }
        }
    };

    /**
     * This method changes the XAxis on the chart and then loops over the data sets and re-plots them
     * @param xValueType
     */
    $scope.changeAxes = function (xValueType) {
        // Make sure they actually want a change
        if (xValueType !== $scope.xValuesType) {
            // Set the new value
            $scope.xValuesType = xValueType;

            // Change the xAxis
            var xAxisTitle = 'Cycle #';
            if (xValueType === 'temperature') {
                xAxisTitle = 'Temperature (C)'
            } else if (xValueType === 'derivative') {
                xAxisTitle = 'Avg Temperature (C)'
            }
            $scope.chart.xAxis[0].update({
                title: {
                    text: xAxisTitle
                }
            });

            // Change the yAxis
            var yAxisTitle = 'Raw Fluorescence';
            if (xValueType === 'temperature') {
                yAxisTitle = 'Raw Fluorescence'
            } else if (xValueType === 'derivative') {
                yAxisTitle = 'dFluor/dTemp';
            }
            $scope.chart.yAxis[0].update({
                title: {
                    text: yAxisTitle
                }
            });

            // Now loop over the data keys and re-plot
            for (var objkey in $scope.pcrData) {
                plotPcrData(objkey);
            }
        }
    };

    // Now populate the pcrTree with the return of the call to get the full tree from the server
    deploymentData.getPCRFullTree($scope.deploymentID, function (pcrTree) {
        // Set the return
        if (pcrTree)
            $scope.pcrTree = pcrTree;
    });

    // Set the size of the chart
    $scope.chart.setSize(
        $("#pcr-details-graph").width(),
        $("#pcr-details-graph").height() - 20,
        false
    );

    // A method to adjust the size of the chart when the window resizes
    $(window).resize(function () {
        $scope.chart.setSize(
            $("#pcr-details-graph").width(),
            $("#pcr-details-graph").height() - 20,
            false
        );
    });


});