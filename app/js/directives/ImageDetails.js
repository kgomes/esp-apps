'use strict';

espApp.directive('imageDetails', function () {
    return {
        restrict: 'E',
        replace: true,
        templateUrl: '/templates/directives/ImageDetails.html',
        controller: 'ImageDetailsController'
    };
});

espApp.controller("ImageDetailsController", function ImageDetailsController($scope, $log, deploymentData) {
    // Grab a reference to me
    var me = this;

    // Clear the images
    $scope.images = {};

    // The image object that is selected
    $scope.selectedImage = null;

    // The name of the image that is currently selected
    $scope.selectedImageName = "No image selected";

    // Grab the deployment ID from the parent Tab
    $scope.deploymentID = $scope.$parent.tab.deploymentID;

    // A flag to indicate if WebGL is supported or not (defaults to false)
    var webGLSupported = false;

    // Grab the placeholder span
    var placeholder = document.getElementById('selected-image-canvas');

    // Create the glfx canvas (WebGL)
    var imageCanvas = null;

    // The image element in case canvas is not supported
    var imageElement = null;

    // This is the texture associated with the selected image (if WebGL available)
    var texture = null;

    // Variables that will point to two sliders if they are available
    var brightnessSlider = null;
    var contrastSlider = null;

    // Make sure we got the placeholder span tag first
    if (placeholder) {
        try {
            imageCanvas = fx.canvas();
            imageCanvas.style.width = '100%';
            imageCanvas.replace(placeholder);
            webGLSupported = true;

            // Create sliders
            brightnessSlider = angular.element('#selected-image-brightness-slider');
            contrastSlider = angular.element('#selected-image-contrast-slider');

        } catch (e) {
            $log.log("Could not create HTML 5 canvas!!!");
            // Hide the sliders
            document.getElementById('image-details-adjust-box-sliders').style.display = 'none';
            imageElement = document.createElement("img");
            imageElement.setAttribute('id', '')
            placeholder.appendChild(imageElement);
        }
    }

    // The functions to handle brightness and contrast changes
    var handleImageChanges = function (event, ui) {
        if (imageCanvas && texture) {
            imageCanvas.draw(texture)
                .brightnessContrast(brightnessSlider.slider("value"),
                contrastSlider.slider("value")).update();
        }
    };

    // Create sliders out of the two divs for brightness and contrast
    if (webGLSupported) {

        // Make the sliders draggable on the iPad
        brightnessSlider.slider().draggable();
        contrastSlider.slider().draggable();

        if ($(window).width() < 768) {
            brightnessSlider.slider({
                orientation: 'horizontal',
                max: 1,
                min: -1,
                step: 0.01,
                change: handleImageChanges,
                slide: handleImageChanges
            });
            contrastSlider.slider({
                orientation: 'horizontal',
                max: 1,
                min: -1,
                step: 0.01,
                change: handleImageChanges,
                slide: handleImageChanges
            });

        } else {
            brightnessSlider.slider({
                orientation: 'vertical',
                max: 1,
                min: -1,
                step: 0.01,
                change: handleImageChanges,
                slide: handleImageChanges
            });
            contrastSlider.slider({
                orientation: 'vertical',
                max: 1,
                min: -1,
                step: 0.01,
                change: handleImageChanges,
                slide: handleImageChanges
            });
        }
    }
    // The function to handle the row selection
    $scope.handleClick = function (image) {

        // Set the selected image to the one with that timestamp
        //$scope.selectedImage = $scope.images[timestamp];
        $scope.selectedImage = image;

        // Set the name of the image
        $scope.selectedImageName = $scope.selectedImage.imageFilename;

        // Check to see if the image has been downloaded
        if ($scope.selectedImage.downloaded) {
            setImageByUrl($scope.selectedImage.imageUrl);
        } else {
            // Assign it the URL of an image indicated it has not been downloaded
            setImageByUrl('/img/not_available.jpg');
        }
    };

    // Call the method to get the images from the server
    deploymentData.getDeploymentImages($scope.deploymentID, function (images) {
        if (images) {
            $scope.images = images;
        }
    });

    // This function configures the canvas using the image at the given URL
    var setImageByUrl = function (url) {

        // So something different based on if WebGL was supported or not
        if (webGLSupported) {
            // Set the sliders back to zero
            brightnessSlider.slider("value", 0);
            contrastSlider.slider("value", 0);

            // Create a new image object
            var img = new Image;

            // Create the function that gets called when the after the image is
            // loaded from the URL
            img.onload = function () {
                texture = imageCanvas.texture(img);
                imageCanvas.draw(texture).update();
            };

            // Set the source URL which will fire the loading of the image
            img.src = url;
        } else {
            imageElement.setAttribute('src', url);
        }
    }

    // Create the event handler to watch for window size changes so we can make sure
    // the sliders are in the proper orientation
    $(window).resize(function () {
        // Check to see if we have move to small form factor (<768px)
        if (webGLSupported) {
            if ($(window).width() < 768 && brightnessSlider.slider("option", "orientation") === 'vertical') {
                brightnessSlider.slider({orientation: 'horizontal'});
                contrastSlider.slider({orientation: 'horizontal'});
            } else if ($(window).width() >= 768 && brightnessSlider.slider("option", "orientation") === 'horizontal') {
                brightnessSlider.slider({orientation: 'vertical'});
                contrastSlider.slider({orientation: 'vertical'});
            }
        }
    });
});