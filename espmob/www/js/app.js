/*
 This is the app.js file for the ESP mobile application
 */
angular.module('espmob', ['ionic','utils'])
    .config(function ($stateProvider, $urlRouterProvider) {
        $stateProvider.state('home', {
            url: '/home',
            controller: 'HomeController',
            templateUrl: 'views/home/home.html'
        });
        $urlRouterProvider.otherwise('/home');
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
