'use strict';

espApp.directive('sampleDetails', function () {
    return {
        restrict: 'E',
        replace: true,
        templateUrl: '/templates/directives/SampleDetails.html',
        controller: 'SampleDetailsController'
    };
});

espApp.controller("SampleDetailsController", function SampleDetailsController($scope, $log, deploymentData){
    // Grab the deployment ID from the parent Tab
    var deploymentID = $scope.$parent.tab.deploymentID;

    //$log.log("Going to create sample table from deployment with ID " + deploymentID);

    deploymentData.getSamples(deploymentID, function(samples) {
        $scope.samples = samples;
    })
});