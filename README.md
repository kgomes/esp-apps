# ESP Applications

This project contains services and applications that provide support for ESP deployments.  You can set up and run each of these applications individually or you can use the docker-compose.yml file provided in this top level directory.
 
## Manual Setup
This really isn't recommended, but is here in case you have legacy systems of external data stores you want to use and don't need the Docker configuration.  These instructions assume you have a PostgreSQL server and a CouchDB server already running and configured properly.  The CouchDB server can be a clean install as the application server will connect and create the necessary views and database.  For the PostgreSQL server, you need to already have a database set up with the proper tables.  If you are manually configuring the PostgreSQL database, have a look at the init-esp-db.sh script in the postgresql directory for SQL that you can run to set up the database.  The init-esp-db.sh script is meant to be used by the Docker install, but you can use it to get an idea of how to configure the database.  Once the PostgreSQL and CouchDB servers are up and running:

1. Copy the server/config.js.template file to server/config.js.
1. There are two ways you can configure the web portal application manually. You can edit the config.js script directly, or you can set environment variables to override the settings in the config.js file.  If you are interested in using the environment variables, see the env.template file for descriptions of the variables.   The env.template file is used in the Docker instructions, but you can look at the environment variable descriptions for information on what variables can be used to manually configure your instance of the web application portal.
1. Either way, you need to specify the variables for:
    1. The directory where FTP files from the ESP will be stored locally. By default, it will use a 'data' directory that is relative to the 'server' working directory.  You can override that default in one of two ways:
        1. config.js: dataDir
        1. Environment: ESP_APPS_BASEDIR
    1. The directory where log files will be written.  By default, the portal will write log files to the 'data/logs/server' local directory.  You can override that by specifying it in one of two ways:
        1. config.js: logDir
        1. Environment: ESP_APPS_LOG_DIRECTORY
    1. The temp directory that will be used by the portal to store log files that it is parsing.  Nothing should be saved there that matters.  By default, it will use the 'data/tmp' local directory, but it can be changed in one of two ways:
        1. config.js: logParserOptions.tempDir
        1. Environment: ESP_APPS_TEMP_DIR
    1. The base path of the URL where the application can be found.  This defaults to 'http://localhost', but you can change it in one of two ways:
        1. config.js: appServerOptions.hostBaseUrl and eventHandlerOptions.hostBaseUrl
        1. Environment: ESP_APPS_HOST_BASE_URL
    1. The port which the application will listen to for client requests.  It defaults to 8081 but can be changed in one of two ways:
        1. config.js: appServerOptions.port
        1. Environment: ESP_APPS_PORT
    1. CouchDB connection parameters:
        1. config.js
            1. dataStoreOptions.couchHost
            1. dataStoreOptions.couchPort
            1. dataStoreOptions.couchSSL
            1. dataStoreOptions.couchUsername
            1. dataStoreOptions.couchPassword
            1. dataStoreOptions.couchDatabase
        1. Environment:
            1. ESP_APPS_COUCH_HOST
            1. ESP_APPS_COUCH_PORT
            1. ESP_APPS_COUCH_SSL
            1. ESP_APPS_COUCHDB_USERNAME
            1. ESP_APPS_COUCHDB_PASSWORD
            1. ESP_APPS_COUCH_DATABASE
    1. PostgreSQL connection parameters
        1. config.js:
            1. dataStoreOptions.pgHost
            1. dataStoreOptions.pgPort
            1. dataStoreOptions.pgUsername
            1. dataStoreOptions.pgPassword
            1. dataStoreOptions.pgDatabase
        1. Environment:
            1. ESP_APPS_PG_HOST
            1. ESP_APPS_PG_PORT
            1. ESP_APPS_PG_USERNAME
            1. ESP_APPS_PG_PASSWORD
            1. ESP_APPS_PG_DATABASE
    1. The URL of the Slack Webhook that will be used to push events to various slack channels.  It is empty by default and must be overridden if you will be pushing notifications.  It can be specified in one of two ways:
        1. config.js: eventHandlerOptions.slackWebHookURL
        1. Environment: ESP_APPS_EVENT_HANDLER_SLACK_WEBHOOK_URL
        
Once all this is configured, you can start the web portal using 'node server.js' and the FTP file crawler by running 'node crawler.js'.

## Docker Setup
To run the ESP Portal using Docker, do the following:

1. Create a directory on the host system where all the application related files will live outside the various containers that make up this orchestrated set of applications.  For these instructions we will call it ESP_APPS_BASEDIR_HOST.
1. Copy the env.template file to a file named .env
1. Edit the .env file and assign the variable ESP_APPS_BASEDIR_HOST to the absolute path on the host to the directory you created in the first step.
1. From a command line, if need be, add executable permissions to the setup.sh file.
1. Execute setup.sh from the command line.  This will create the appropriate directory structure and copy the necessary files into it for these applications and services.
1. Get checkout permission on the ESP2Gscript project
1. From the terminal window at the top level of the ESP_APPS_BASEDIR_HOST, clone the ESP2Gscript using git.  This should create a directory at ESP_APPS_BASEDIR_HOST/ESP2Gscript
1. Edit any variables to configure the application to run the way you want it to.  This can be done in two ways: edit the server/config.js file or edit the variables in the .env file.  The .env variables will override those defined in the config.js file, so that is usually the best place to define them.
1. Now from the command line, run 'docker-compose up' and after a minute or so, the application should be visible at http://localhost:8080.

One thing I need to fix is the have a web form in the portal that allows you to create ESP deployments, right now you have to do that directly in the CouchDB web interface (ick!).  To do this, go to the [CouchDB web interface](http://localhost:5984/_utils) and login as the user defined in the .env file.  Then you can create a new document in the esp database that is of the form:

```json
{
   "resource": "Deployment",
   "name": "Test Deployment",
   "startDate": "2018-08-16T00:00:00PST",
   "description": "A Test Deployment for my testing",
   "notifySlack": true,
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
