/*
This is the ESP Mission selection controller
 */
angular.module('espmob')
    .controller('SelectController', function ($scope, $http, $ionicLoading, $state) {
        console.log("Selection controller started");

        // Put up the loading sheet
        $ionicLoading.show();

        // Create a default base URL for getting data from the server
//        var serverBaseURL = 'http://localhost:8081';
        var serverBaseURL = 'http://services.mbari.org/espweb';

        // TODO kgomes - read server base URL from localstorage

        // Grab the list of deployments
        $http.get(serverBaseURL + '/deployments')
            .success(function (deployments) {
                // Create the listing of deployment names on the scope
                $scope.deploymentNames = [];

                // Now loop over them to create an array of the deployment/ESP names
                for (var i = 0; i < deployments.length; i++){
                    $scope.deploymentNames.push(deployments[i].name + ' - ' + deployments[i].esp.name);
                }
                // Now sort it
                $scope.deploymentNames.sort();

                // Hide the loading indicator
                $ionicLoading.hide();
            }).error(function (error) {
                console.log("Error", error);
                $ionicLoading.hide();
            });


        // The function to handle the tap event
        $scope.handleTap = function(index){
            console.log("Tapped " + $scope.deploymentNames[index]);
            $state.go('app.select-details', { id: 10});
        }
    });