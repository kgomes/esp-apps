# ESP Applications

This project contains a web application for parsing and inspecting 2G ESP deployments. For development purposes, there is a Docker compose file in the services directory that will help you bring up all the dependent services on your local machine so that you can develop and test locally.  When development is finished, you can build a Docker image and push it to DockerHub.

## Development Setup

These instructions assume you have cloned the Git repository for this project into a folder on your local machine. In order to develop, you need to get a suite of supporting services running to support the application. There needs to be a CouchDB instance running and a PostgreSQL server running with the proper schema installed. There is a docker-compose.yml file and a env.template file to assist with getting these things running.  To get everything running:

1. Install Docker on your local machine.
1. Install NodeJS on your local machine.
1. Install [Imagemagick](https://imagemagick.org/script/download.php#macosx) on your local machine.
1. If you want to test the functionality that posts messages to a Slack channel, you will need to create a Slack App and an Incoming Web Hook which will end up giving you a URL that you will need to set in the environment variables. For more information, see [the Slack documentation](https://api.slack.com/messaging/webhooks#getting-started)
1. Find or create a directory on your host machine where all the data, logs, etc. will be stored by your docker images. For these instructions, we will use ```/host/path/data/directory``` as an example. Create the following subdirectories under that directory.
    1. ```/host/path/data/directory/couchdb/data```
    1. ```/host/path/data/directory/postgresql/data```
    1. ```/host/path/data/directory/postgresql/docker-entrypoint-initdb.d```
    1. ```/host/path/data/directory/esp-web-log-parser/logs```
    1. ```/host/path/data/directory/esp-web-log-parser/uploads```
    1. ```/host/path/data/directory/esp-portal/data```
    1. ```/host/path/data/directory/esp-portal/data/instances```
    1. ```/host/path/data/directory/esp-portal/data/tmp```
    1. ```/host/path/data/directory/esp-portal/logs```
1. Copy the ./resources/init-esp-db.sh file to the ```/host/path/data/directory/postgresql/docker-entrypoint-initdb.d``` directory
1. You need to next define all the environment variables that will be used by the various components and services. Open a command line and change into the 'services' directory. Copy the env.template file to a file named .env and open in your favorite editor.
1. You can use the comments in the .env file to help you fill out the different variables, but the key variables are:
    1. ESP_APPS_BASEDIR_HOST (this is ```/host/path/data/directory``` in this example)
    1. COUCHDB_USER (this is the username that will be the default account in CouchDB)
    1. COUCHDB_PASSWORD (this is the password for the CouchDB defalt username)
    1. POSTGRES_PASSWORD (this is the default password for the postgresql server account)
    1. ESP_APPS_PG_USERNAME (this is the username that will be used by the ESP portal to connect to the postgres DB)
    1. ESP_APPS_PG_PASSWORD (this is the password that will be used by the ESP portal to connect to the postgres DB)
1. One particular service (esp-web-log-parser), needs a local installation of the 2G ESP codebase.  At the time of this writing, that codebase is a private GitHub repository so you will need to request access to that codebase. Reach out to the [MBARI ESP Team](https://www.mbari.org/technology/emerging-current-tools/instruments/environmental-sample-processor-esp/) for more information.  Once you have access, run ```git clone https://github.com/MBARI-ESP/ESP2Gscript.git``` inside the directory chosen in the first step in these instructions. You should then end up with a directory like ```/host/path/data/directory/ESP2Gscript```.
1. You can start up the dependent services by running ```docker-compose up``` from inside the 'resources' directory.  The first time you run this, it will take some time as it needs to set up all the supportive services for the first time.
1. If you happen to notice in the log files, the CouchDB instance will complain about not have some database available.  You can clear this warning by running:

        curl -X PUT http://COUCHDB_USER:COUCHDB_PASSWORD@localhost:5984/_users
        curl -X PUT http://COUCHDB_USER:COUCHDB_PASSWORD@localhost:5984/_replicator
        curl -X PUT http://COUCHDB_USER:COUCHDB_PASSWORD@localhost:5984/_global_changes

1. Once the above steps are complete, you should be able to see 3 different web interfaces from the various services:
    1. [The CouchDB Web Portal](http://localhost:5984/_utils)
    1. [The ESP Core Log Parser](http://localhost:8080)
    1. [The ESP Image Analysis Service](http://localhost:8082/analyze)
1. Once the services are all up and running, you can now run the ESP web portal locally. The first step is to copy the server/config.js.template file to server/config.js and open in your text editor. The 'server' section of the config contains all the parameters for the web portal server. You can use the comments to help you fill out the variables.
1. You need to install node modules for both the server and the application by running the following command both in the 'server' directory and the 'app' directory: ```npm install```.
1. You can then start the ESP portal by running ```node server.js``` and that will start up the ESP Portal server which can then be found on your localhost at http://localhost:8081 (unless you have configured a different port in your config.js file)
1. The web portal will not have any data loaded yet, so you first have to create an ESP 'deployment' by adding a JSON document to the CouchDB esp database.  First gather the information about where a past ESP deployment files are begin hosted (on an FTP server).  You should gather the following information:
    1. FTP site URL (will be 'ftpHost' property)
    1. FTP site port (will be 'ftpPort' property, often this is 21)
    1. FTP site username (will be 'ftpUsername' property) (use 'anonymous' for anonymous FTP sites)
    1. FTP site password (will be 'ftpPassword' property) (use your email for anonymous FTP sites)
    1. Directory to base of ESP deployment files on the FTP server (will be 'ftpWorkingDir' property)
1. Once you've gathered up the FTP site information, go to the CouchDB web portal (link above) and click on 'login' in the lower right corner.  Use the username and password you defined in your .env file when you started up the supporting services.
1. Now click on the 'esp' database link
1. Now click on 'New Document'.  This will generate a new document with one property, which is the ID of the document.  
1. Click on the 'Source' tab to change to the source view.
1. Double click on the document and it should open it in an editor.  Add a comma after the ID and then the other information in the following format (Note the Slack property should be true only if you have create and configured a Slack web hook, otherwise make it false.  If you are using Slack, the channel name should be an existing Slack channel that you want to publish message to.):

    {
        "resource": "Deployment",
        "name": "Test Deployment",
        "startDate": "2018-08-16T00:00:00PST",
        "description": "A Test Deployment for my testing",
        "notifySlack": true,
        "slackChannel": "your-channel-name",
        "esp": {
            "ftpHost": "your.esp.ftp.host",
            "ftpPort": 21,
            "ftpUsername": "ftp_username",
            "ftpPassword": "ftp_password",
            "ftpWorkingDir": "/esp/log/base/path",
            "dataDirectory": "/var/log/esp",
            "filesToParse": [
                "/var/log/esp/real.log"
            ],
            "name": "ESPName"
        }
    }

1. Click on the Save Document. You have now created a new ESP deployment that will be parsed to populate the information from the deployment.
1. The next step is to start the FTP crawler which will syncronize all deployment files with the local ESP portal.  You do this by opening a command line in the server directory and running ```node crawler.js```.  This will then copy down any FTP files from remote ESP ftp servers to the ESP web portal.
1. Lastly, you need to run the parseDeployments.js script which will read in all the deployments from the ESP portal API and then parse any files that it can and load that data into the portal. You do this by opening a command line in the server directory and running ```node parseDeployments.js```.  The ESP data should now be available in the web portal (probably need to refresh the page).
