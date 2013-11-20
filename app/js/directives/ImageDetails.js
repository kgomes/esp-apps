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

    $log.log("Scope:", $scope);

    // Clear the images
    $scope.images = {};

    // The image object that is selected
    $scope.selectedImage = null;

    // The name of the image that is currently selected
    $scope.selectedImageName = "No image selected";

    // Grab the deployment ID from the parent Tab
    $scope.deploymentID = $scope.$parent.tab.deploymentID;

    // Grab the placeholder span
    var placeholder = document.getElementById('selected-image-canvas');

    // Create the glfx canvas (WebGL)
    var imageCanvas = null;
    if (placeholder) {
        try {
            imageCanvas = fx.canvas();
        } catch (e) {
            $log.log("Could not create HTML 5 canvas!!!");
            placeholder.innerHTML = e;
        }
        imageCanvas.replace(placeholder);
    }

    // This is the texture associated with the selected image
    var texture = null;

    // Grab the two sliders
    var brightnessSlider = angular.element('#selected-image-brightness-slider');
    var contrastSlider = angular.element('#selected-image-contrast-slider');

    // The functions to handle brightness and contrast changes
    var handleImageChanges = function (event, ui) {
        if (imageCanvas && texture) {
            imageCanvas.draw(texture)
                .brightnessContrast(brightnessSlider.slider("value"),
                    contrastSlider.slider("value")).update();
        }
    };

    // Create sliders out of the two divs for brightness and contrast
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

    // The function to handle the row selection
    $scope.handleClick = function (timestamp) {

        // Set the selected image to the one with that timestamp
        $scope.selectedImage = $scope.images[timestamp];

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
    }
});