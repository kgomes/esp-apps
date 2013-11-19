'use strict';

/*
 This is a service that provides functions available on the rootscope
 */
espApp.factory('espAppCoordinator', function ($rootScope, $log) {

    // Return the service object
    return {
        // This is a method that allows callers to broadcast messages
        broadcastMessage: function (messageName, messageObject) {
            // Broadcast that it was added
            $rootScope.$broadcast(messageName, messageObject);
        }
    }
});