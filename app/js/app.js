/*
 This is the main application starting point.  It simply defines the ESP Application Module
 */
var espApp = angular.module('espApp', ['ui.bootstrap', 'auth0', 'angular-storage', 'angular-jwt', 'ngRoute']);

// Configuration
espApp.config(function espAppConfig($routeProvider, authProvider, $httpProvider, $locationProvider,
                                    jwtInterceptorProvider) {

    $routeProvider.when('/', {
        
    })
});
