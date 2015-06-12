/*
 This is the app.js file for the ESP mobile application
 */
angular.module('espmob', ['ionic', 'utils'])
    .config(function ($stateProvider, $urlRouterProvider) {

        // Add the app (parent) state
        $stateProvider.state('app', {
            url: '/app',
            abstract: true,
            controller: 'AppController',
            templateUrl: 'views/menu.html'
        });

        // Add the chart view state
        $stateProvider.state('app.chart', {
            url: '/chart',
            views: {
                'menuContent': {
                    templateUrl: 'views/chart/chart.html',
                    controller: 'ChartController'
                }
            }
        });

        // Add the mission selection state
        $stateProvider.state('app.select', {
            url: '/select',
            views: {
                'menuContent': {
                    templateUrl: 'views/select/select.html',
                    controller: 'SelectController'
                }
            }
        });

        // Add the details selection state
        $stateProvider.state('app.select-details', {
            url: '/select/:id',
            views: {
                'menuContent': {
                    templateUrl: 'views/select/select-details.html'
//                    controller: 'SelectDetailsController'
                }
            }
        });

        // Add the map view state
        $stateProvider.state('app.map', {
            url: '/map',
            views: {
                'menuContent': {
                    templateUrl: 'views/map/map.html',
                    controller: 'MapController'
                }
            }
        });

        // Add the default route
        $urlRouterProvider.otherwise('/app/chart');
    })

    // Add the application controller
    .controller('AppController', function ($scope, $ionicSideMenuDelegate) {

        console.log("AppController started ...");
        // Turn off swipe to open side menu
        console.log($ionicSideMenuDelegate.canDragContent());
        $ionicSideMenuDelegate.canDragContent(false);

        console.log($ionicSideMenuDelegate.canDragContent());
    })

    .run(function ($ionicPlatform) {
        $ionicPlatform.ready(function () {
            // Hide the accessory bar by default (remove this to show the accessory bar above the keyboard
            // for form inputs)
            if (window.cordova && window.cordova.plugins.Keyboard) {
                cordova.plugins.Keyboard.hideKeyboardAccessoryBar(true);
            }
            if (window.StatusBar) {
                StatusBar.styleDefault();
            }
        });
    })
