angular.module('espmob')
    .controller('MapController', function ($scope, $http, $ionicLoading, $localstorage) {

        // Grab the users last center (in 3857 projection) and zoom
        var lastViewCenterX = $localstorage.get('last-view-center-x');
        var lastViewCenterY = $localstorage.get('last-view-center-y');
        var lastViewCenter;
        if (lastViewCenterX && lastViewCenterY){
            lastViewCenter = [Number(lastViewCenterX),Number(lastViewCenterY)];
        }
        var lastViewZoom = $localstorage.get('last-view-zoom');

        // Create a vector source and layer
        var vectorSource = new ol.source.Vector();
        var vectorLayer = new ol.layer.Vector({
            source: vectorSource
        });

        // Create the attribution for the map
        var attribution = new ol.Attribution({
            html: 'Tiles &copy; <a href="http://services.arcgisonline.com/ArcGIS/' +
            'rest/services/World_Topo_Map/MapServer">ArcGIS</a>'
        });

        // Now create the esri layer
        var esriLayer = new ol.layer.Tile({
            source: new ol.source.XYZ({
                attributions: [attribution],
                url: 'http://services.arcgisonline.com/ArcGIS/rest/services/Ocean_Basemap/MapServer/tile/{z}/{y}/{x}'
            })
        });

        // Create the map and view
        var map = new ol.Map({
            target: 'map',
            controls: [],
            layers: [
                esriLayer, vectorLayer
            ],
            view: new ol.View({
                center: lastViewCenter || ol.proj.transform([-122.1, 36.79], 'EPSG:4326', 'EPSG:3857'),
                zoom: lastViewZoom || 9
            })
        });

        // Create the feature overlay
        var featuresOverlay = new ol.FeatureOverlay({
            map: map,
            features: []
        });

        // Now grab the current deployments
        $http.get('http://services.mbari.org/espweb/deployments?openOnly=true').success(function (openDeployments) {
            // If the deployment has a latitude and longitude, put a marker on the map
            for (var i = 0; i < openDeployments.length; i++) {
                // Check to see if the latitude and longitude are defined for the open deployment
                if (openDeployments[i].latitude && openDeployments[i].longitude) {
                    // Create the coordinate of the ESP
                    var coordinate = ol.proj.fromLonLat([openDeployments[i].longitude, openDeployments[i].latitude], 'EPSG:3857');

                    // Create the point geometry from the coordinate
                    var point = new ol.geom.Point(coordinate);

                    // Create the style
                    var espStyle = new ol.style.Style({
                        image: new ol.style.Circle({
                            radius: 6,
                            fill: new ol.style.Fill({
                                color: '#FF0000'
                            }),
                            stroke: new ol.style.Stroke({
                                color: '#000',
                                width: 1
                            })
                        }),
                        text: new ol.style.Text({
                            text: openDeployments[i].esp.name,
                            font: '15px ArialNarrow',
                            fill: new ol.style.Fill({color: '#000'}),
                            offsetX: 22,
                            offsetY: -10
                        })
                    });

                    // Create the new feature
                    var espFeature = new ol.Feature({
                        geometry: point,
                        name: openDeployments[i].name
                    });

                    // Set the style
                    espFeature.setStyle(espStyle);

                    // Grab the vector source and add the feature
                    vectorSource.addFeature(espFeature);
                }
            }
        }).error(function (error) {
            console.log("Error:",error);
        });

        // Functions for event handling
        function onMoveEnd(evt) {
            $localstorage.set('last-view-center-x', map.getView().getCenter()[0]);
            $localstorage.set('last-view-center-y', map.getView().getCenter()[1]);
            $localstorage.set('last-view-zoom', map.getView().getZoom());
        }

        // Functions for UI event handling
        $scope.onDeploymentListTap = function () {
            console.log("Deployment selected");
        };

        // Register event handlers
        map.on('moveend', onMoveEnd);

    });