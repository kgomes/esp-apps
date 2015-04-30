angular.module('espmob')
    .controller('HomeController', function ($scope, $http, $ionicLoading) {

        // Create the attribution
        var attribution = new ol.Attribution({
            html: 'Tiles &copy; <a href="http://services.arcgisonline.com/ArcGIS/' +
            'rest/services/World_Topo_Map/MapServer">ArcGIS</a>'
        });

        // Create the map
        var map = new ol.Map({
            target: 'map',
            layers: [
                new ol.layer.Tile({
                    source: new ol.source.XYZ({
                        attributions: [attribution],
                        url: 'http://services.arcgisonline.com/ArcGIS/rest/services/Ocean_Basemap/MapServer/tile/{z}/{y}/{x}'
                    })
                })
            ],
            view: new ol.View({
                center: ol.proj.transform([-122.1, 36.79], 'EPSG:4326', 'EPSG:3857'),
                zoom: 9
            })
        });

        // Put up the loading sheet
        $ionicLoading.show();

        // Grab the list of deployments
        $http.get('http://services.mbari.org/espweb/deployments?namesOnly=true')
            .success(function (deployments) {
                console.log("deployments", deployments);
                $ionicLoading.hide();
            }).error(function (error) {
                console.log("Error", error);
                $ionicLoading.hide();
            });
    });