'use strict';

/*
 This is the controller who is responsible for the selection pane on the left side of the application
 */
espApp.controller('SelectionController',
    function SelectionController($scope, $http, $log, espAppCoordinator, deploymentData) {

        // --------------------------------------------------------------------------------
        // Scope data for binding
        // --------------------------------------------------------------------------------
        // The names of all the deployments available
        $scope.deploymentNames = [];

        // Call the event to populate the deployment Names
        deploymentData.getAllDeploymentNames(function (deploymentNames) {
            $scope.deploymentNames = deploymentNames;
        });

        // The name of the currently selected deployment
        $scope.selectedDeploymentName = "Select Deployment";

        // The deployments that have the name that is currently selected
        $scope.selectedDeployments = [];

        // These are the objects that are available for selection
        $scope.selectionObjects = {

        };

        // --------------------------------------------------------------------------------
        // Methods made available on the scope
        // --------------------------------------------------------------------------------

        // This function takes in an index and then does all the work to find which
        // deployment matches the index and then sets it as the selected deployment
        $scope.selectDeployment = function (index) {
            // Grab the name from the list
            $scope.selectedDeploymentName = $scope.deploymentNames[index];

            // Now call the method on the data service to get all the deployments
            // that have that name
            deploymentData.getDeploymentsByName($scope.deploymentNames[index], function (deployments) {
                $scope.selectedDeployments = deployments;
            });
        }

        // The function to handle the selection of any object available in the controller
        $scope.selectObject = function (event) {
            // The object to be broadcast
            var messageObject = {
                objkey: event.target.value
            }

            // Grab the deployment that was selected
            for (var i = 0; i < $scope.selectedDeployments.length; i++) {
                if ($scope.selectedDeployments[i]._id === event.target.value.split('-')[1]) {
                    messageObject['deployment'] = $scope.selectedDeployments[i];
                }
            }

            // Check to see if the user selected or deselected the checkbox
            if (event.target.checked) {
                // Since it is selected, broadcast that message
                espAppCoordinator.broadcastMessage('objectSelected', messageObject);
            } else {
                // Broadcast a de-selection
                $log.log("Broadcasting de-selection");
                espAppCoordinator.broadcastMessage('objectDeselected', messageObject);
            }
        }
    }
);