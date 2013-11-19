'use strict';

espApp.directive('protocolDetails', function () {
    return {
        restrict: 'E',
        replace: true,
        templateUrl: '/templates/directives/ProtocolDetails.html',
        controller: 'ProtocolDetailsController'
    };
});

espApp.controller("ProtocolDetailsController", function ProtocolDetailsController($scope, $log, deploymentData) {
    // Clear the protocol runs
    $scope.protocolRuns = {};

    // Grab the deployment ID from the parent Tab
    var deploymentID = $scope.$parent.tab.deploymentID;

    $log.log("Going to create protocol run table from deployment with ID " + deploymentID);

    deploymentData.getProtocolRuns(deploymentID, function (protocolRuns) {
        $log.log("Protocol runs returned:", protocolRuns);
        if (protocolRuns) {
            $scope.protocolRuns = protocolRuns;
        }
    })
});