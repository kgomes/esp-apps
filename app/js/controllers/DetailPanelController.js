'use strict';

/*
 This is the controller for managing the details table in the application
 */
espApp.controller('DetailPanelController',
    function DetailPanelController($scope, $http, $log, espAppCoordinator, deploymentData) {
        // This is the array of tabs that are displayed
        $scope.tabs = [];

        // This is the array of tables that are currently loaded
        $scope.detailTables = [];

        // Make sure the modal window is hidden
        $scope.modal = {
            header: ""
        };

        // Default settings for PCR plot modal
        $scope.pcrModal = {
            header: ""
        }

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
            } else if ($scope.detailTables[parentIndex] && $scope.detailTables[parentIndex].headers &&
                $scope.detailTables[parentIndex].headers[1] === 'PCR Name') {

                // OK, so the user selected a PCR file, let's plot it in a modal window

                // Some patterns to use for file parsing
                var startLinePattern = new RegExp(/(\S+), (\S+) started at, (\d+\/\d+\/\d+ \d+:\d+:\d+),(\S+)/);
                var headerLinePattern = new RegExp(/SecsSinceStart,(\S+)/);
                //var dataLinePattern = new RegExp(/)


                // Grab the data from the server
                console.log($scope.detailTables[parentIndex].rows[index][2].fileUrl);
                $http.get($scope.detailTables[parentIndex].rows[index][2].fileUrl).success(function (data, status, headers, config) {
                    // OK, I have received the data, let's build the series
                    var dataRows = data.split('\n');

                    // A placeholder for time stamps
                    var timestamp = null;

                    // Loop over the data rows to extract data into series
                    for (var i = 0; i < dataRows.length; i++) {
                        console.log("Parsing Line: " + dataRows[i]);
                        var startLineMatches = dataRows[i].match(startLinePattern);
                    }

                    // Create the HighCharts chart for the PCR data
                    $scope.chart = new Highcharts.StockChart({
                        chart: {
                            renderTo: 'pcr-graph-panel',
                            type: 'line'
                        },
                        title: {
                            text: $scope.detailTables[parentIndex].rows[index][1] + ' ' + $scope.detailTables[parentIndex].rows[index][0]
                        },
                        rangeSelector: {
                            enabled: false
                        },
                        series: null
                    });

                    // Grab the div element
                    var element = angular.element('#pcrPlotModal');

                    // And show it
                    element.modal('show');
                });

            } else {
                // Looks like there is nothing associated with the row that was clicked
                $scope.modal.header = $scope.detailTables[parentIndex].rows[index][1];
                $scope.modal.url = "/image/nothing.jpg";
            }
        }

        // This is the event handler that responds when the user selects something from
        // the check list
        $scope.$on('objectSelected', function (event, messageObject) {
            // Grab the object key coming in and split it up to find out what the user selected
            var objkeyParts = messageObject.objkey.split("-");

            // Grab the input type
            var inputType = objkeyParts[0];
            var deploymentID = objkeyParts[1];
            var property = objkeyParts[2];
            $log.log("inputType,deploymentID,property:", inputType, deploymentID, property);

            // Depending on what was selected, add the proper component to the tabbed panel
            if (property === 'protocolRuns') {
                $scope.tabs.push({
                    objkey: messageObject.objkey,
                    deploymentID: deploymentID,
                    title: messageObject.deployment.esp.name + " Procotol Runs",
                    active: true,
                    content: "/templates/directives/ProtocolDetailsInclude.html"
                });
            } else if (property === 'samples') {
                $scope.tabs.push({
                    objkey: messageObject.objkey,
                    deploymentID: deploymentID,
                    title: messageObject.deployment.esp.name + " Samples",
                    active: true,
                    content: "/templates/directives/SampleDetailsInclude.html"
                });
            } else if (property === 'images') {
                $scope.tabs.push({
                    objkey: messageObject.objkey,
                    deploymentID: deploymentID,
                    title: messageObject.deployment.esp.name + " Images",
                    active: true,
                    content: "/templates/directives/ImageDetailsInclude.html"
                });
            } else if (property === 'errors') {
                $scope.tabs.push({
                    objkey: messageObject.objkey,
                    deploymentID: deploymentID,
                    title: messageObject.deployment.esp.name +  " Errors",
                    active: true,
                    content: "/templates/directives/ErrorDetailsInclude.html"
                });
            } else if (property === 'pcrs') {
                $scope.tabs.push({
                    objkey: messageObject.objkey,
                    deploymentID: deploymentID,
                    title: messageObject.deployment.esp.name + " PCRs",
                    active: true,
                    content: "/templates/directives/PCRDetailsInclude.html"
                });
            }
        });

        // This is the method that handles the event when the user de-selected something
        $scope.$on('objectDeselected', function (event, messageObject) {
            $log.log("Event: ", event);
            // Grab the object key
            var objkey = messageObject.objkey;

            // Split it to extract information from the key
            var objkeyParts = messageObject.objkey.split("-");
            var inputType = objkeyParts[0];
            var deploymentID = objkeyParts[1];
            var property = objkeyParts[2];

            // Check to property to see if it is something we would need to react to
            if (property === "protocolRuns" ||
                property === "samples" ||
                property === "errors" ||
                property === "images" ||
                property === 'pcrs') {
                // Now remove the specified details
                removeObject(objkey);
            }
        });

        // This is a method that removes the de-selected object from the details panel
        var removeObject = function (objkey) {
            $log.log("Going to remove tab with objkey " + objkey);
            // Loop over tabs and remove the one matching the object key
            var indexToRemove = -1;
            for (var i = 0; i < $scope.tabs.length; i++) {
                if ($scope.tabs[i].objkey === objkey) {
                    indexToRemove = i;
                }
            }
            if (indexToRemove >= 0) {
                $scope.tabs.splice(indexToRemove, 1);
            }
        };
    }
);