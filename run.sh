#!/usr/bin/env bash

# Sleep to allow the other services to start
echo "Sleeping 30 seconds to allow other services to start"
sleep 30s

# Start the crond service
crond &

# Start the FTP file crawler
echo "Starting FTP crawler"
cd /opt/esp/server
node crawler.js &

# Start the web portal
echo "Staring web portal server"
node server.js
