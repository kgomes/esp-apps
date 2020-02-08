/**
 * This is the class definition for a Deployment object
 * @param {} id 
 * @param {*} name 
 * @param {*} startDate 
 * @param {*} endDate 
 * @param {*} description 
 */
function Deployment(id, rev, name, startDate, endDate, description) {
    this.id = id || null;
    this.rev = rev || null;
    this.name = name || null;
    this.startDate = startDate || null;
    this.endDate = endDate || null;
    this.description = description || null;
    this.notifySlack = false;
    this.slackChannel = null;
    this.esp = null;
    this.ancillaryData = {};
    this.errors = {};
    this.protocolRuns = {};
    this.samples = {};
    this.images = {};
}

// ID getters and setters
Deployment.prototype.getID = function () {
    return this.id;
}
Deployment.prototype.setID = function (id) {
    this.id = id;
}

// Rev getters and setters
Deployment.prototype.getRev = function () {
    return this.rev;
}
Deployment.prototype.setRev = function (rev) {
    this.rev = rev;
}

// Name getters and setters
Deployment.prototype.getName = function () {
    return this.name;
}
Deployment.prototype.setName = function (name) {
    this.name = name;
}

// Start date getters and setters
Deployment.prototype.getStartDate = function () {
    return this.startDate;
}
Deployment.prototype.setStartDate = function (startDate) {
    this.startDate = startDate;
}

// End date getters and setters
Deployment.prototype.getEndDate = function () {
    return this.endDate;
}
Deployment.prototype.setEndDate = function (endDate) {
    this.endDate = endDate;
}

// Description getters and setters
Deployment.prototype.getDescription = function () {
    return this.description;
}
Deployment.prototype.setDescription = function (description) {
    this.description = description;
}

// NotifySlack flag get and set
Deployment.prototype.getNotifySlack = function () {
    return this.notifySlack;
}
Deployment.prototype.setNotifySlack = function (notifySlack) {
    this.notifySlack = notifySlack;
}

// Slack channel getter and setter
Deployment.prototype.getSlackChannel = function () {
    return this.slackChannel;
}
Deployment.prototype.setSlackChannel = function (slackChannel) {
    this.slackChannel = slackChannel;
}

// ESP getter and setter
Deployment.prototype.getESP = function () {
    return this.esp;
}
Deployment.prototype.setESP = function (esp) {
    this.esp = esp;
}

// AncillaryData getter and setter
Deployment.prototype.getAncillaryData = function () {
    return this.ancillaryData;
}
Deployment.prototype.setAncillaryData = function (ancillaryData) {
    this.ancillaryData = ancillaryData;
}

// Errors getter and setter
Deployment.prototype.getErrors = function () {
    return this.errors;
}
Deployment.prototype.setErrors = function (errors) {
    this.errors = errors;
}

// ProtocolRuns getter and setter
Deployment.prototype.getProtocolRuns = function () {
    return this.protocolRuns;
}
Deployment.prototype.setProtocolRuns = function (protocolRuns) {
    this.protocolRuns = protocolRuns;
}

// Samples getter and setter
Deployment.prototype.getSamples = function () {
    return this.samples;
}
Deployment.prototype.setSamples = function (samples) {
    this.samples = samples;
}

// Images getter and setter
Deployment.prototype.getImages = function () {
    return this.images;
}
Deployment.prototype.setImages = function (images) {
    this.images = images;
}

// This method takes in a JSON object and fills in the fields using the fields
// in the JSON object
Deployment.prototype.deserialize = function (jsonDeployment) {
    // First, let's make sure we have something coming in
    if (jsonDeployment) {
        // Try to see if there is an ID (could be 'id' or '_id')
        if (jsonDeployment['_id']) {
            this.setID(jsonDeployment['_id']);
        } else {
            if (jsonDeployment['id']) this.setID(jsonDeployment['id']);
        }

        // Now try the revision
        if (jsonDeployment['_rev']) {
            this.setRev(jsonDeployment['_rev']);
        } else {
            if (jsonDeployment['rev']) this.setRev(jsonDeployment['rev']);
        }

        // Name
        if (jsonDeployment['name']) {
            this.setName(jsonDeployment['name']);
        }

        // Description
        if (jsonDeployment['description']) {
            this.setDescription(jsonDeployment['description']);
        }

        // The start date
        if (jsonDeployment['startDate']) {
            this.setStartDate(jsonDeployment['startDate']);
        }

        // End date
        if (jsonDeployment['endDate']) {
            this.setEndDate(jsonDeployment['endDate']);
        }

        // Notify slack
        if (jsonDeployment['notifySlack']) {
            this.setNotifySlack(jsonDeployment['notifySlack']);
        }

        // Slack channel
        if (jsonDeployment['slackChannel']) {
            this.setSlackChannel(jsonDeployment['slackChannel']);
        }

        // The ESP
        if (jsonDeployment['esp']) {
            this.setESP(jsonDeployment['esp']);
        }

        // The ancillary data
        if (jsonDeployment['ancillaryData']) {
            this.setAncillaryData(jsonDeployment['ancillaryData']);
        }

        // The errors
        if (jsonDeployment['errors']) {
            this.setErrors(jsonDeployment['errors']);
        }

        // The protocol runs
        if (jsonDeployment['protocolRuns']) {
            this.setProtocolRuns(jsonDeployment['protocolRuns']);
        }

        // The Samples
        if (jsonDeployment['samples']) {
            this.setSamples(jsonDeployment['samples']);
        }

        // The images
        if (jsonDeployment['images']) {
            this.setImages(jsonDeployment['images']);
        }
    }
};

// This method serializes the Deployment to a JSON Object
Deployment.prototype.serializeToJSON = function () {
    // Create the object to return
    var jsonObjectToReturn = {};

    jsonObjectToReturn['_id'] = this.id;
    jsonObjectToReturn['_rev'] = this.rev;
    jsonObjectToReturn['resource'] = 'Deployment';
    jsonObjectToReturn['name'] = this.name;
    jsonObjectToReturn['startDate'] = this.startDate;
    jsonObjectToReturn['endDate'] = this.endDate;
    jsonObjectToReturn['description'] = this.description;
    jsonObjectToReturn['notifySlack'] = this.notifySlack;
    jsonObjectToReturn['slackChannel'] = this.slackChannel;
    jsonObjectToReturn['esp'] = this.esp;
    jsonObjectToReturn['ancillaryData'] = this.ancillaryData;
    jsonObjectToReturn['errors'] = this.errors;
    jsonObjectToReturn['protocolRuns'] = this.protocolRuns;
    jsonObjectToReturn['samples'] = this.samples;
    jsonObjectToReturn['images'] = this.images;

    // Return the object
    return jsonObjectToReturn;
}

// Create an equals method that compares ID
// TODO kgomes: probably could make this check ESP name and Deployment name too
Deployment.prototype.equals = function (otherDeployment) {
    return otherDeployment.getID() == this.getID();
}

// Set the exports
module.exports = Deployment;