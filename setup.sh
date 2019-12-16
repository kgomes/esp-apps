#!/bin/bash
# This file sets up the
# Read the environment variables from the .env file
export $(grep -v '^#' .env | xargs)

# Create the appropriate directory structure for applications and services
echo "Starting setup of the ESP repository structure in directory ${ESP_APPS_BASEDIR_HOST}"

# Create the appropriate directories
echo "Creating CouchDB directories..."
if [ ! -d ${ESP_APPS_BASEDIR_HOST}/couchdb ]; then
    echo "Creating ${ESP_APPS_BASEDIR_HOST}/couchdb"
    mkdir ${ESP_APPS_BASEDIR_HOST}/couchdb
else
    echo "${ESP_APPS_BASEDIR_HOST}/couchdb already exists"
fi
if [ ! -d ${ESP_APPS_BASEDIR_HOST}/couchdb/etc ]; then
    echo "Creating ${ESP_APPS_BASEDIR_HOST}/couchdb/etc"
    mkdir ${ESP_APPS_BASEDIR_HOST}/couchdb/etc
else
    echo "${ESP_APPS_BASEDIR_HOST}/couchdb/etc already exists"
fi
if [ ! -d ${ESP_APPS_BASEDIR_HOST}/couchdb/etc/default.d ]; then
    echo "Creating ${ESP_APPS_BASEDIR_HOST}/couchdb/etc/default.d"
    mkdir ${ESP_APPS_BASEDIR_HOST}/couchdb/etc/default.d
else
    echo "${ESP_APPS_BASEDIR_HOST}/couchdb/etc/default.d already exists"
fi
if [ ! -d ${ESP_APPS_BASEDIR_HOST}/couchdb/etc/local.d ]; then
    echo "Creating ${ESP_APPS_BASEDIR_HOST}/couchdb/etc/local.d"
    mkdir ${ESP_APPS_BASEDIR_HOST}/couchdb/etc/local.d
else
    echo "${ESP_APPS_BASEDIR_HOST}/couchdb/etc/local.d already exists"
fi
if [ ! -d ${ESP_APPS_BASEDIR_HOST}/couchdb/var ]; then
    echo "Creating ${ESP_APPS_BASEDIR_HOST}/couchdb/var"
    mkdir ${ESP_APPS_BASEDIR_HOST}/couchdb/var
else
    echo "${ESP_APPS_BASEDIR_HOST}/couchdb/var already exists"
fi
if [ ! -d ${ESP_APPS_BASEDIR_HOST}/couchdb/var/lib ]; then
    echo "Creating ${ESP_APPS_BASEDIR_HOST}/couchdb/var/lib"
    mkdir ${ESP_APPS_BASEDIR_HOST}/couchdb/var/lib
else
    echo "${ESP_APPS_BASEDIR_HOST}/couchdb/var/lib already exists"
fi
if [ ! -d ${ESP_APPS_BASEDIR_HOST}/couchdb/var/log ]; then
    echo "Creating ${ESP_APPS_BASEDIR_HOST}/couchdb/var/log"
    mkdir ${ESP_APPS_BASEDIR_HOST}/couchdb/var/log
else
    echo "${ESP_APPS_BASEDIR_HOST}/couchdb/var/log already exists"
fi
if [ ! -d ${ESP_APPS_BASEDIR_HOST}/couchdb/var/run ]; then
    echo "Creating ${ESP_APPS_BASEDIR_HOST}/couchdb/var/run"
    mkdir ${ESP_APPS_BASEDIR_HOST}/couchdb/var/run
else
    echo "${ESP_APPS_BASEDIR_HOST}/couchdb/var/run already exists"
fi
# Copy CouchDB configuration files to their deployment location
if [ ! -f ${ESP_APPS_BASEDIR_HOST}/couchdb/etc/default.ini ]; then
    echo "Copying CouchDB default.ini file to the data repository..."
    cp ./services/couchdb/default.ini ${ESP_APPS_BASEDIR_HOST}/couchdb/etc/default.ini
else
    echo "CouchDB default.ini already in repository, not copying over"
fi
if [ ! -f ${ESP_APPS_BASEDIR_HOST}/couchdb/etc/local.ini ]; then
    echo "Copying CouchDB local.ini file to the data repository..."
    cp ./services/couchdb/local.ini ${ESP_APPS_BASEDIR_HOST}/couchdb/etc/local.ini
else
    echo "CouchDB local.ini already in repository, not copying over"
fi

echo "Creating the PostgreSQL directories"
if [ ! -d ${ESP_APPS_BASEDIR_HOST}/postgresql ]; then
    echo "Creating ${ESP_APPS_BASEDIR_HOST}/postgresql"
    mkdir ${ESP_APPS_BASEDIR_HOST}/postgresql
else
    echo "${ESP_APPS_BASEDIR_HOST}/postgresql already exists"
fi
if [ ! -d ${ESP_APPS_BASEDIR_HOST}/postgresql/data ]; then
    echo "Creating ${ESP_APPS_BASEDIR_HOST}/postgresql/data"
    mkdir ${ESP_APPS_BASEDIR_HOST}/postgresql/data
else
    echo "${ESP_APPS_BASEDIR_HOST}/postgresql/data already exists"
fi
if [ ! -d ${ESP_APPS_BASEDIR_HOST}/postgresql/conf ]; then
    echo "Creating ${ESP_APPS_BASEDIR_HOST}/postgresql/conf"
    mkdir ${ESP_APPS_BASEDIR_HOST}/postgresql/conf
else
    echo "${ESP_APPS_BASEDIR_HOST}/postgresql/conf already exists"
fi
if [ ! -d ${ESP_APPS_BASEDIR_HOST}/postgresql/docker-entrypoint-initdb.d ]; then
    echo "Creating ${ESP_APPS_BASEDIR_HOST}/postgresql/docker-entrypoint-initdb.d"
    mkdir ${ESP_APPS_BASEDIR_HOST}/postgresql/docker-entrypoint-initdb.d
else
    echo "${ESP_APPS_BASEDIR_HOST}/postgresql/docker-entrypoint-initdb.d already exists"
fi
# Copy PostgreSQL configuration files
if [ ! -f ${ESP_APPS_BASEDIR_HOST}/postgresql/conf/postgresql.conf ]; then
    echo "Copying PostgreSQL configuration file to the data repostiory..."
    cp ./services/postgresql/postgresql.conf.sample ${ESP_APPS_BASEDIR_HOST}/postgresql/conf/postgresql.conf
else
    echo "PostgreSQL configuration already in repository, not copying over"
fi
if [ ! -f ${ESP_APPS_BASEDIR_HOST}/postgresql/docker-entrypoint-initdb.d/init-esp-db.sh ]; then
    echo "Copying PostgreSQL database configuration file to the data repostiory..."
    cp ./services/postgresql/init-esp-db.sh ${ESP_APPS_BASEDIR_HOST}/postgresql/docker-entrypoint-initdb.d/init-esp-db.sh
else
    echo "PostgreSQL database configuration already in repository, not copying over"
fi

echo "Creating the ESP Core services directories"
if [ ! -d ${ESP_APPS_BASEDIR_HOST}/core-service ]; then
    echo "Creating ${ESP_APPS_BASEDIR_HOST}/core-service"
    mkdir ${ESP_APPS_BASEDIR_HOST}/core-service
else
    echo "${ESP_APPS_BASEDIR_HOST}/core-service already exists"
fi
if [ ! -d ${ESP_APPS_BASEDIR_HOST}/core-service/uploads ]; then
    echo "Creating ${ESP_APPS_BASEDIR_HOST}/core-service/uploads"
    mkdir ${ESP_APPS_BASEDIR_HOST}/core-service/uploads
else
    echo "${ESP_APPS_BASEDIR_HOST}/core-service/uploads already exists"
fi
if [ ! -d ${ESP_APPS_BASEDIR_HOST}/core-service/logs ]; then
    echo "Creating ${ESP_APPS_BASEDIR_HOST}/core-service/logs"
    mkdir ${ESP_APPS_BASEDIR_HOST}/core-service/logs
else
    echo "${ESP_APPS_BASEDIR_HOST}/core-service/logs already exists"
fi

echo "Creating the data repository directories"
if [ ! -d ${ESP_APPS_BASEDIR_HOST}/data ]; then
    echo "Creating ${ESP_APPS_BASEDIR_HOST}/data"
    mkdir ${ESP_APPS_BASEDIR_HOST}/data
else
    echo "${ESP_APPS_BASEDIR_HOST}/data already exists"
fi
if [ ! -d ${ESP_APPS_BASEDIR_HOST}/data/instances ]; then
    echo "Creating ${ESP_APPS_BASEDIR_HOST}/data/instances"
    mkdir ${ESP_APPS_BASEDIR_HOST}/data/instances
else
    echo "${ESP_APPS_BASEDIR_HOST}/data/instances already exists"
fi

echo "Creating tmp directory"
if [ ! -d ${ESP_APPS_BASEDIR_HOST}/data/tmp ]; then
    echo "Creating ${ESP_APPS_BASEDIR_HOST}/data/tmp"
    mkdir ${ESP_APPS_BASEDIR_HOST}/data/tmp
else
    echo "${ESP_APPS_BASEDIR_HOST}/data/tmp already exists"
fi

echo "Creating log directories"
if [ ! -d ${ESP_APPS_BASEDIR_HOST}/logs ]; then
    echo "Creating ${ESP_APPS_BASEDIR_HOST}/logs"
    mkdir ${ESP_APPS_BASEDIR_HOST}/logs
else
    echo "${ESP_APPS_BASEDIR_HOST}/logs already exists"
fi
if [ ! -d ${ESP_APPS_BASEDIR_HOST}/logs/server ]; then
    echo "Creating ${ESP_APPS_BASEDIR_HOST}/logs/server"
    mkdir ${ESP_APPS_BASEDIR_HOST}/logs/server
else
    echo "${ESP_APPS_BASEDIR_HOST}/logs/server already exists"
fi

# Copy application server config file from template
if [ ! -f ./server/config.js ]; then
    echo "Copying server/config.js.template application server template to server/config.js"
    cp ./server/config.js.template ./server/config.js
else
    echo "Application server configuration file server/config.js already exists, not copying over"
fi

# Install the server Node modules
echo "Installing server Node Modules"
cd ./server
npm install

# Install the client Node modules
echo "Installing client app Node modules"
cd ../app
npm install