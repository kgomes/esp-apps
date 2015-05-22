'use strict';

/**
 This is a service that provides the application access to the backend data related to deployments
 */
espApp.factory('deploymentData', function ($http, $log) {

    // Return the service object
    return {

        // This is the function to return the names of all the deployments available
        getAllDeploymentNames: function (successcb) {
            $http({method: 'GET', url: '/deployments?namesOnly=true'}).
                success(function (data, status, headers, config) {
                    successcb(data);
                }).
                error(function (data, status, headers, config) {
                    $log.warn(data, status, headers, config);
                });
        },

        // This is a method to return all deployments with a given name
        getDeploymentsByName: function (name, successcb) {
            $http({method: 'GET', url: '/deployments?name=' + name}).
                success(function (data, status, headers, config) {
                    successcb(data);
                }).error(function (data, status, headers, config) {
                    $log.warn(data, status, headers, config);
                });
        },

        // This method takes in a deployment ID and sends the errors object to the callback
        getDeploymentErrors: function (deploymentID, successcb) {
            // Construct the URL to grab the errors
            var errorsUrl = "/deployments/" + deploymentID + "/errors";
            //$log.log("errorUrl: " + errorsUrl);

            // Make the call
            $http({method: 'GET', url: errorsUrl}).
                success(function (data, status, headers, config) {
                    successcb(data);
                }).error(function (data, status, headers, config) {
                    $log.warn(data, status, headers, config);
                }
            );
        },

        // This method takes in a deployment ID and sends the images object to the callback
        getDeploymentImages: function (deploymentID, successcb) {
            // Construct the URL to grab the images
            var imagesUrl = "/deployments/" + deploymentID + "/images";
            //$log.log("imageUrl: " + imagesUrl);

            // Make the call
            $http({method: 'GET', url: imagesUrl}).
                success(function (data, status, headers, config) {
                    successcb(data);
                }).error(function (data, status, headers, config) {
                    $log.warn(data, status, headers, config);
                }
            );
        },

        // This method takes in a deployment ID and sends the protocolRuns object to the callback
        getProtocolRuns: function (deploymentID, successcb) {
            // Construct the URL to grab the protocolRuns
            var protocolRunsUrl = "/deployments/" + deploymentID + "/protocolRuns";
            //$log.log("protocolRunUrl: " + protocolRunsUrl);

            // Make the call
            $http({method: 'GET', url: protocolRunsUrl}).
                success(function (data, status, headers, config) {
                    successcb(data);
                }).error(function (data, status, headers, config) {
                    $log.warn(data, status, headers, config);
                }
            );
        },

        // This method takes in a deployment ID and sends the samples object to the callback
        getSamples: function (deploymentID, successcb) {
            // Construct the URL to grab the samples
            var samplesUrl = "/deployments/" + deploymentID + "/samples";
            //$log.log("samplesUrl: " + samplesUrl);

            // Make the call
            $http({method: 'GET', url: samplesUrl}).
                success(function (data, status, headers, config) {
                    successcb(data);
                }).error(function (data, status, headers, config) {
                    $log.warn(data, status, headers, config);
                }
            );
        },

        // This method takes in a deployment ID and sends the errors object to the callback
        getErrors: function (deploymentID, successcb) {
            // Construct the URL to grab the samples
            var errorsUrl = "/deployments/" + deploymentID + "/errors";
            //$log.log("errorsUrl: " + errorsUrl);

            // Make the call
            $http({method: 'GET', url: errorsUrl}).
                success(function (data, status, headers, config) {
                    successcb(data);
                }).error(function (data, status, headers, config) {
                    $log.warn(data, status, headers, config);
                }
            );
        },

        // This method takes in a deployment ID and sends a time-indexed list of PCRs to the callback
        getPCRsByTime: function (deploymentID, successcb) {
            // Construct the URL to grab the pcrs sorted by their timestamps
            var pcrsByTimeUrl = "/deployments/" + deploymentID + "/pcrs?byTime=true";
            //$log.log("pcrsByTimeUrl: " + pcrsByTimeUrl);

            // Make the call
            $http({method: 'GET', url: pcrsByTimeUrl}).
                success(function (data, status, headers, config) {
                    successcb(data);
                }).error(function (data, status, headers, config) {
                    $log.warn(data, status, headers, config);
                }
            );
        },

        // This method takes in a deployment ID and returns the object that is the full tree of
        // PCRs associated with that deployment (no data though)
        getPCRFullTree: function (deploymentID, successcb) {
            // Construct the URL to grab the full tree PCR listing
            var pcrsFullTreeUrl = "/deployments/" + deploymentID + "/pcrs?fullTree=true";
            //$log.log("pcrsFullTreeUrl: " + pcrsFullTreeUrl);

            // Make the call
            $http({method: 'GET', url: pcrsFullTreeUrl}).
                success(function (data, status, headers, config) {
                    successcb(data);
                }).error(function (data, status, headers, config) {
                    $log.warn(data, status, headers, config);
                }
            );
        },

        // This method takes in various parameters for PCR data and retrieves the actual data
        getPCRData: function (deploymentID, pcrType, varName, epochMillis, successcb) {
            // Construct the URL to grab the PCR data
            var pcrDataUrl = "/deployments/" + deploymentID + "/pcrs/" + encodeURIComponent(pcrType) + "/" +
                encodeURIComponent(varName) + "/" + epochMillis + "/";
            //$log.log("pcrDataUrl: " + pcrDataUrl);

            // Make the call
            $http({method: 'GET', url: pcrDataUrl}).
                success(function (data, status, headers, config) {
                    successcb(data);
                }).error(function (data, status, headers, config) {
                    $log.warn(data, status, headers, config);
                }
            );
        },

        // This is a method to get ancillary data from the server
        getAncillaryData: function (sourceID, startDate, endDate, successcb) {
            // Construct the data URL
            var dataUrl = "/ancdata/" + sourceID;

            // Add params if we have them
            if (startDate && endDate) {
                dataUrl += '?startDate=' + startDate + '&endDate=' + endDate;
            } else if (startDate) {
                dataUrl += '?startDate=' + startDate;
            } else if (endDate) {
                dataUrl += '?endDate=' + endDate;
            }
            //$log.log("dataUrl: " + dataUrl);

            $http({method: 'GET', url: dataUrl}).
                success(function (data, status, headers, config) {
                    // Send the data to the callback
                    successcb(data);
                }).error(function (data, status, headers, config) {
                    $log.warn(data, status, headers, config);
                }
            );

        }
    };
})
;