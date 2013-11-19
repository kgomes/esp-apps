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

            // First let's see if they specified errors
//            if (type === "errors") {
//                // Create a new details table entry
//                var errorTable = {};
//
//                // Set the object key
//                errorTable.objkey = objkey;
//
//                // If this is the first table, make it active
//                if ($scope.detailTables.length === 0) {
//                    errorTable.active = "active";
//                }
//
//                // Create an array for the table data
//                errorTable.headers = ["Date", "Actor", "Subject", "Message"];
//                errorTable.rows = [];
//
//                // Loop over the deployments to find the right one so we can create a table from the errors
//                for (var i = 0; i < espAppCoordinator.getSelectedDeployments().length; i++) {
//
//                    // Check for ID match
//                    if (espAppCoordinator.getSelectedDeployments()[i]._id === deploymentID &&
//                        espAppCoordinator.getSelectedDeployments()[i].errors) {
//
//                        // Set the tab title
//                        errorTable.title = espAppCoordinator.getSelectedDeployments()[i].esp.name + " Errors";
//
//                        // For each error, add it to the array
//                        Object.keys(espAppCoordinator.getSelectedDeployments()[i].errors).forEach(function (errorts) {
//                                // Create a date
//                                var tempDate = new Date(parseInt(errorts));
//                                errorTable.rows.push([tempDate.format("mm/dd/yy HH:MM:ss"),
//                                    espAppCoordinator.getSelectedDeployments()[i].errors[errorts].actor,
//                                    espAppCoordinator.getSelectedDeployments()[i].errors[errorts].subject,
//                                    espAppCoordinator.getSelectedDeployments()[i].errors[errorts].message
//                                ]);
//                            }
//                        );
//                    }
//                }
//                // Push it on the table
//                $scope.detailTables.push(errorTable);
//            } else if (type === "images") {
//                // Create a new details table entry
//                var imageTable = {};
//
//                // Set the object key
//                imageTable.objkey = objkey;
//
//                // If this is the first table, make it active
//                if ($scope.detailTables.length === 0) {
//                    imageTable.active = "active";
//                }
//
//                // Create an array for the table data
//                imageTable.headers = ["Date", "File (click for image)", "Exposure", "Resolution"];
//                imageTable.rows = [];
//                imageTable.imageUrls = [];
//                imageTable.onDiskFlag = [];
//
//                // Loop over the deployments to find the right one so we can create a table from the images
//                for (var i = 0; i < espAppCoordinator.getSelectedDeployments().length; i++) {
//
//                    // Check for ID match
//                    if (espAppCoordinator.getSelectedDeployments()[i]._id === deploymentID &&
//                        espAppCoordinator.getSelectedDeployments()[i].images) {
//
//                        // Set the tab title
//                        imageTable.title = espAppCoordinator.getSelectedDeployments()[i].esp.name + " Images";
//
//                        // For each image, add it to the array
//                        Object.keys(espAppCoordinator.getSelectedDeployments()[i].images).forEach(function (imagests) {
//                                var tempDate = new Date(parseInt(imagests));
//                                imageTable.rows.push([tempDate.format("mm/dd/yy HH:MM:ss"),
//                                    espAppCoordinator.getSelectedDeployments()[i].images[imagests],
//                                    espAppCoordinator.getSelectedDeployments()[i].images[imagests].exposure,
//                                    espAppCoordinator.getSelectedDeployments()[i].images[imagests].xPixels + "x" +
//                                        espAppCoordinator.getSelectedDeployments()[i].images[imagests].yPixels
//                                ]);
//                                imageTable.imageUrls.push(espAppCoordinator.getSelectedDeployments()[i].images[imagests].imageUrl);
//                                imageTable.onDiskFlag.push(espAppCoordinator.getSelectedDeployments()[i].images[imagests].downloaded);
//                            }
//                        );
//                    }
//                }
//                // Push it on the table
//                $scope.detailTables.push(imageTable);
//            } else if (type === "processruns") {
//                // Create a new details table entry
//                var processRunTable = {};
//
//                // Set the object key
//                processRunTable.objkey = objkey;
//
//                // If this is the first table, make it active
//                if ($scope.detailTables.length === 0) {
//                    processRunTable.active = "active";
//                }
//
//                // Create an array for the table data
//                processRunTable.headers = ["Date", "Name", "Target Vol (ml)", "Archive?", "Archive Vol (ml)"];
//                processRunTable.rows = [];
//
//                // Loop over the deployments to find the right one so we can create a table from the processruns
//                for (var i = 0; i < espAppCoordinator.getSelectedDeployments().length; i++) {
//
//                    // Check for ID match
//                    if (espAppCoordinator.getSelectedDeployments()[i]._id === deploymentID &&
//                        espAppCoordinator.getSelectedDeployments()[i].processRuns) {
//
//                        // Set the tab title
//                        processRunTable.title = espAppCoordinator.getSelectedDeployments()[i].esp.name + " Protocol Runs";
//
//                        // For each process run, add it to the array
//                        Object.keys(espAppCoordinator.getSelectedDeployments()[i].processRuns).forEach(function (prts) {
//                                var tempDate = new Date(parseInt(prts));
//                                // Push the date
//                                var rowArray = [tempDate.format("mm/dd/yy HH:MM:ss")];
//                                // Check for name
//                                if (espAppCoordinator.getSelectedDeployments()[i].processRuns[prts].name) {
//                                    rowArray.push(espAppCoordinator.getSelectedDeployments()[i].processRuns[prts].name);
//                                } else {
//                                    rowArray.push("Unknown");
//                                }
//
//                                // Now the target volume
//                                if (espAppCoordinator.getSelectedDeployments()[i].processRuns[prts].targetVol) {
//                                    rowArray.push(espAppCoordinator.getSelectedDeployments()[i].processRuns[prts].targetVol);
//                                } else {
//                                    rowArray.push("Unknown");
//                                }
//
//                                // Whether or not an archive was associated with it
//                                if (espAppCoordinator.getSelectedDeployments()[i].processRuns[prts].archive) {
//                                    rowArray.push(true);
//                                    if (espAppCoordinator.getSelectedDeployments()[i].processRuns[prts].archive.targetVol) {
//                                        rowArray.push(espAppCoordinator.getSelectedDeployments()[i].processRuns[prts].archive.targetVol);
//                                    } else {
//                                        rowArray.push(null);
//                                    }
//                                } else {
//                                    rowArray.push(false);
//                                    rowArray.push(null);
//                                }
//
//                                processRunTable.rows.push(rowArray);
//                            }
//                        );
//                    }
//                }
//                // Push it on the table
//                $scope.detailTables.push(processRunTable);
//            } else if (type === "samples") {
//                // Create a new details table entry
//                var samplesTable = {};
//
//                // Set the object key
//                samplesTable.objkey = objkey;
//
//                // If this is the first table, make it active
//                if ($scope.detailTables.length === 0) {
//                    samplesTable.active = "active";
//                }
//
//                // Create an array for the table data
//                samplesTable.headers = ["Start Date", "End Date", "DWSM ?", "Target Vol (ml)", "Actual Vol (ml)", "Diff (ml)"];
//                samplesTable.rows = [];
//
//                // Loop over the deployments to find the right one so we can create a table from the samples
//                for (var i = 0; i < espAppCoordinator.getSelectedDeployments().length; i++) {
//
//                    // Check for ID match
//                    if (espAppCoordinator.getSelectedDeployments()[i]._id === deploymentID &&
//                        espAppCoordinator.getSelectedDeployments()[i].samples) {
//
//                        // Set the tab title
//                        samplesTable.title = espAppCoordinator.getSelectedDeployments()[i].esp.name + " Samples";
//
//                        // For each sample, add it to the array
//                        Object.keys(espAppCoordinator.getSelectedDeployments()[i].samples).forEach(function (samplets) {
//                                var tempDate = new Date(parseInt(samplets));
//                                // The row array that will be pushed
//                                var rowArray = [tempDate.format("mm/dd/yy HH:MM:ss")];
//
//                                // Check for end date
//                                if (espAppCoordinator.getSelectedDeployments()[i].samples[samplets].endts) {
//                                    var tempEndDate = new Date(parseInt(espAppCoordinator.getSelectedDeployments()[i].samples[samplets].endts));
//                                    rowArray.push(tempEndDate.format("mm/dd/yy HH:MM:ss"));
//                                } else {
//                                    rowArray.push(null);
//                                }
//
//                                // Check to see if it is a DWSM sample
//                                if (espAppCoordinator.getSelectedDeployments()[i].samples[samplets].dwsm) {
//                                    rowArray.push(true);
//                                } else {
//                                    rowArray.push(false);
//                                }
//
//                                // Now check for target vol
//                                if (espAppCoordinator.getSelectedDeployments()[i].samples[samplets].targetVolume) {
//                                    rowArray.push(espAppCoordinator.getSelectedDeployments()[i].samples[samplets].targetVolume);
//                                } else {
//                                    rowArray.push(null);
//                                }
//
//                                // Now actual volume
//                                if (espAppCoordinator.getSelectedDeployments()[i].samples[samplets].actualVolume) {
//                                    rowArray.push(espAppCoordinator.getSelectedDeployments()[i].samples[samplets].actualVolume);
//                                } else {
//                                    rowArray.push(null);
//                                }
//
//                                // Now the difference between actual and target
//                                if (espAppCoordinator.getSelectedDeployments()[i].samples[samplets].targetVolume &&
//                                    espAppCoordinator.getSelectedDeployments()[i].samples[samplets].actualVolume) {
//                                    rowArray.push(espAppCoordinator.getSelectedDeployments()[i].samples[samplets].targetVolume -
//                                        espAppCoordinator.getSelectedDeployments()[i].samples[samplets].actualVolume);
//                                } else {
//                                    rowArray.push(null);
//                                }
//                                samplesTable.rows.push(rowArray);
//                            }
//                        );
//                    }
//                }
//                // Push it on the table
//                $scope.detailTables.push(samplesTable);
//            } else if (type === "pcrs") {
//                // Create a new details table entry
//                var pcrTable = {};
//
//                // Set the object key
//                pcrTable.objkey = objkey;
//
//                // If this is the first table, make it active
//                if ($scope.detailTables.length === 0) {
//                    pcrTable.active = "active";
//                }
//
//                // Create an array for the table data
//                pcrTable.headers = ["Date", "PCR Name", "PCR File (click to view)"];
//                pcrTable.rows = [];
//                pcrTable.fileUrls = [];
//                pcrTable.onDiskFlag = [];
//
//                // Loop over the deployments to find the right one so we can create a table from the images
//                for (var i = 0; i < espAppCoordinator.getSelectedDeployments().length; i++) {
//
//                    // Check for ID match
//                    if (espAppCoordinator.getSelectedDeployments()[i]._id === deploymentID &&
//                        espAppCoordinator.getSelectedDeployments()[i].pcrs) {
//
//                        // Set the tab title
//                        pcrTable.title = espAppCoordinator.getSelectedDeployments()[i].esp.name + " PCR Runs";
//
//                        // For each PCR, add it to the array
//                        Object.keys(espAppCoordinator.getSelectedDeployments()[i].pcrs).forEach(function (pcrts) {
//                                var tempDate = new Date(parseInt(pcrts));
//                                pcrTable.rows.push([tempDate.format("mm/dd/yy HH:MM:ss"),
//                                    espAppCoordinator.getSelectedDeployments()[i].pcrs[pcrts].name,
//                                    espAppCoordinator.getSelectedDeployments()[i].pcrs[pcrts]
//                                ]);
//                                pcrTable.fileUrls.push(espAppCoordinator.getSelectedDeployments()[i].pcrs[pcrts].fileUrl);
//                                pcrTable.onDiskFlag.push(espAppCoordinator.getSelectedDeployments()[i].pcrs[pcrts].isOnDisk);
//                            }
//                        );
//                    }
//                }
//                // Push it on the table
//                $scope.detailTables.push(pcrTable);
//            }
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