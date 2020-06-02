#!/usr/bin/env bash

# Start the FTP file crawler
echo "Starting FTP crawler"
cd /opt/esp/server
node crawler.js &

# Start the web portal
echo "Staring web portal server"
node server.js
