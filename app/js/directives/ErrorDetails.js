'use strict';

espApp.directive('errorDetails', function () {
    return {
        restrict: 'E',
        replace: true,
        templateUrl: '/templates/directives/ErrorDetails.html',
        controller: 'ErrorDetailsController'
    };
});

espApp.controller("ErrorDetailsController", function ErrorDetailsController($scope, $log, deploymentData) {
    // Clear the errors
    $scope.errors = {};

    // Grab the deployment ID from the parent Tab
    var deploymentID = $scope.$parent.tab.deploymentID;

    $log.log("Going to create error table from deployment with ID " + deploymentID);

    deploymentData.getErrors(deploymentID, function (errors) {
        $log.log("Errors returned:", errors);
        if (errors) {
            $scope.errors = errors;
        }
    })
});