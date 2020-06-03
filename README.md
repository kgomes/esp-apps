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

## Building and running from local Docker image

If you want to build the ESP Docker image locally, you can simply run ```docker build -t mbari/esp-portal .``` and that will build a local image.  Assuming you have the supporting services running using the docker-compose in the previous sections instructions, you can run the portal and connect to those services.  First you need to change your config.js file as the hostname for the CouchDB and Postgres servers will be relative to the docker-compose network and will be 'esp-couchdb' and 'esp-posgresql' respectively.  Also, you will mount your data directory to the esp-portal image so you need to update the config.js and map the dataDir and logDir entries to point to the location inside the container where you will mount your data and log directories. Your apiBaseUrl might change as well, depending on how expose the portal server port to the host.  The easiest way is to show this by example.  Let's say I have the following data and log directories:

1. dataDir: '/my/host/data/dir'
1. logDir: '/my/host/log/dir'

And let's say I am going to mount those to the '/esp-portal/data' and '/esp-portal/logs' directories inside the portal container. Also, I am going to do a straight mapping from the portal port of 8081 inside the container to the 8081 port on the host.  The config.js changes would be:

1. In config.js under the server, crawler, and parseDeployments objects, change the dataDir to '/esp-portal/data' and the logDir to '/esp-portal/logs'.
1. Under the server->dataAccessOptions object, change the couchHost and pgHost to 'esp-couchdb' and 'esp-postgresql' respectively.

You should now be able to start up the esp-portal server, crawler and parseDeployments by running the following:

    docker run -p 8081:8081 -v /my/checkout/of/esp-apps/server/config.js:/opt/esp/server/config.js -v /my/host/data/dir:/esp-portal/data -v /my/host/log/dir:/esp-portal/logs --network="resources_default" mbari/esp-portal

Note that it will take about a minute for the ESP portal to become available as I have a pause built to give other services that may be starting at the same time to start. The FTP sync defaults to checking every minute and the parsing of the ESP files defaults to every 5 minutes so it can be several minutes before the sync and parse takes place and the web page is updated.  Also note that it's on my list to have the page updated automatically by pushing events from the server, the app will need to be refreshed to show any updates that have taken place since the last time the page was updated. I know, I'm working on it. :)

## Deploying to production

### CentOS 8

CentOS 8 is a bit different as they have moved to podman instead of Docker, so the deployment is a bit different.
