# ESP Applications

This project contains a web application for inspecting 2G ESP deployments. For development purposes, there is a Docker compose file in this source directory that will help you bring up all the dependent services on your local machine so that you can develop and test locally.  When development is finished, you can build a Docker image and push it to DockerHub.

## Development Setup

These instructions assume you have cloned the Git repository for this project into a folder on your local machine. Before doing anything. To get going, do the following steps:

1. Install Docker on your local machine.
1. Install NodeJS on your local machine.
1. Install [Imagemagick](https://imagemagick.org/script/download.php#macosx) on your local machine.
1. If you want to test the functionality that posts messages to a Slack channel, you will need to create a Slack App and an Incoming Web Hook which will end up giving you a URL that you will need to set in the environment variables. For more information, see [the Slack documentation](https://api.slack.com/messaging/webhooks#getting-started)
1. Find or create a directory on your host machine where all the data, logs, etc. will be stored by your docker images. For these instructions, we will use ```/host/path/data/directory``` as an example.
1. You need to next define all the environment variables that will be used by the various components and services. Copy the env.template file to a file named .env and open in your favorite editor.
1. You can use the comments in the .env file to help you fill out the different variables, but the key variables are:
    1. ESP_APPS_BASEDIR_HOST (this is ```/host/path/data/directory``` in this example)
    1. ESP_APPS_BASEDIR (if running locally, this is the same as ESP_APPS_BASEDIR_HOST, which is ```/host/path/data/directory``` in this example)
    1. ESP_APPS_COUCHDB_USERNAME (whatever you choose)
    1. ESP_APPS_COUCHDB_PASSWORD (whatever you choose)
    1. ESP_APPS_PG_USERNAME (whatever you choose)
    1. ESP_APPS_PG_PASSWORD (whatever you choose)
    1. ESP_APPS_EVENT_HANDLER_SLACK_WEBHOOK_URL (if you want to test Slack integration)
1. One particular service (esp-core), needs a local installation of the 2G ESP codebase.  At the time of this writing, that codebase is a private GitHub repository so you will need to request access to that codebase. Reach out to the [MBARI ESP Team](https://www.mbari.org/technology/emerging-current-tools/instruments/environmental-sample-processor-esp/) for more information.  Once you have access, run ```git clone https://github.com/MBARI-ESP/ESP2Gscript.git``` inside the directory chosen in the first step in these instructions. You should then end up with a directory like ```/host/path/data/directory/ESP2Gscript```.
1. Now you need to run a script which creates needed directories and copies in configuration files for the different services.  This file is a the root of this project and is called 'setup.sh'.  You might have to add execute permissions to the script by running ```chmod +x setup.sh``` and then run the script itself by running ```./setup.sh```.  This shell script copies the configuration files from the services/couchdb and services/postgresql directories and puts them in subdirectories of you local host data directory that was defined in step one. These files are then mounted into the Docker containers for the CouchDB and PostgreSQL services respectively. This means if you want to change the way those services run after running this shell script, you can edit the configuration files in your data directory or you can edit them in the services directory here, remove them from the data directory and re-run the setup script.  The setup script also makes a copy of the server/config.js.template file and creates a copy named server/config.js.  This is a configuration file that is run when the ESP web portal is started and contains configuration properties that are read and then over-ridden by any environment variables you define when running the server.  Lastly, the script will run ```npm install``` in both the server and app directories to install node modules for both.
1. Once the setup script finishes, you can start up the dependent services by running ```docker-compose up```.  The first time you run this, it will take some time as it needs to build the esp-core image and that is a large build process.
1. Once the services are all up and running, you can now run the ESP web portal locally.  The easiest way to do this is to open a terminal window and, first, set all the environment variables by running: ```export $(grep -v '^#' .env | xargs)``` and this will read the environment variables from the .env file and set them in your local shell. You can then run the web portal by changing into the server directory and running ```node server.js```.
1. Once the above steps are complete, you should be able to see 3 different web pages from the various services:
    1. [The CouchDB Web Portal](http://localhost:5984/_utils)
    1. [The ESP Core Log Parser](http://localhost:8080)
    1. [The ESP Web Portal](http://localhost:8081)
1. The web portal will not have any data loaded yet, so you first have to create an ESP 'deployment' by adding a JSON document to the CouchDB esp database.  First gather the information about where a past ESP deployment files are begin hosted (on an FTP server).  You should gather the following information:
    1. FTP site URL (will be 'ftpHost' property)
    1. FTP site port (will be 'ftpPort' property, often this is 21)
    1. FTP site username (will be 'ftpUsername' property) (use 'anonymous' for anonymous FTP sites)
    1. FTP site password (will be 'ftpPassword' property) (use your email for anonymous FTP sites)
    1. Directory to base of ESP deployment files on the FTP server (will be 'ftpWorkingDir' property)
1. Once you've gathered up the FTP site information, go to the CouchDB web portal (link above) and click on 'login' in the lower right corner.  Use the username and password you defined in your environment variables to log into CouchDB portal.
1. Now click on the 'esp' database link
1. Now click on 'New Document'.  This will generate a new document with one property, which is the ID of the document.  
1. Click on the 'Source' tab to change to the source view.
1. Double click on the document and it should open it in an editor.  Add a comma after the ID and then the other information in the following format (Note the Slack property should be true only if you have create and configured a Slack web hook, otherwise make it false.  If you are using Slack, the channel name should be an existing Slack channel that you want to publish message to.):

    ```json
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
            "logFile": "esp/real.log",
            "mode": "real",
            "name": "ESPName"
        }
    }
    ```

1. Click on the green check mark next to the document, then on Save Document. You have now created a new ESP deployment that will be parsed to populate the information from the deployment.
1. Open a new terminal window and set the environment variables again by running ```export $(grep -v '^#' .env | xargs)```.
1. Finally, start the log parser by changing into the server directory and running ```node crawler.js```
