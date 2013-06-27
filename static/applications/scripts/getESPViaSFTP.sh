#!/bin/bash

sftp -in << END_SCRIPT
open bufflehead.shore.mbari.org
user anonymous kgomes
cd ESP/station/ESPmars/esp
binary
lcd /Users/kgomes/Documents/Web/esp/instances/Moe/deployments/2013_MARS/data/raw
mget *
quit
END_SCRIPT
