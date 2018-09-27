# Core Service

This directory contains the source to build a docker container that provides services from the ESP core code base.  The ESP core code is kept in a private GitHub repository located here:

https://github.com/MBARI-ESP/ESP2Gscript

Because this project is private, you need to have access to that GitHub repo in order to use this docker service.  Once you have access to the project, you can continue with these instructions. When you are ready to move forward, identify a location on your hard drive where you will store all the data that lives outside the container.  For these instructions, we will call this ESP_APPS_BASEDIR_HOST.  Once you have this location, open a terminal and navigate to the ESP_APPS_BASEDIR_HOST directory and then run:
```
git clone https://github.com/MBARI-ESP/ESP2Gscript.git
```
This will create a ESP2GScript directory which we will mount as a volume into the docker container.  This is done so that you can keep the ESP core codebase up to date by running a git pull from the repo outside the container which will make the updated files available inside the container.  You can also create a couple of directories to store logs and other data from the container services.  Create these directories:

```
ESP_APPS_BASEDIR_HOST/logs/core-service
ESP_APPS_BASEDIR_HOST/data/core-service/uploads
```
Once this is done, in the terminal, cd back to the base directory which contains these instructions and the Dockerfile.  Then build the docker image using the following command:

```
docker build --build-arg ESP_NAME=mack --build-arg ESP_MODE=real --build-arg ESP_PORT=7777 -t centos-7-esp-core .
```

Note that 'mack', 'real', and 7777 are just some defaults I have given in this case and you do not have to use those.  The main service provided by this docker image will be a web service that will allow users to submit their ESP log files for parsing.  During submission, these values will most likely be overridden anyway, but if you want to connect to the running container and use the ESP command line tools, these are the defaults used in that environment. Note that this build takes a REALLY long time as it's building several components needed to run the patched ruby version that is used by the ESP.

Once the build is complete, you can run the docker container using:

```
docker run \
  -v ESP_APPS_BASEDIR_HOST/logs/core-service:/var/log/httpd \
  -v ESP_APPS_BASEDIR_HOST/data/core-service/uploads:/data/uploads \
  -v ESP_APPS_BASEDIR_HOST/ESP2Gscript:/home/esp/ESP2Gscript \
  -p 8080:80 centos-7-esp-core
```

Note for the above to work, ESP_APPS_BASEDIR_HOST needs to be a fully qualified system path. Once the service is running, you can parse a log file over HTTP.  Here is an example call using curl

```
curl -X POST -F 'espname=jake' -F 'esptype=shallow' -F 'espmode=real' -F 'logfile=@/path/to/logfile.log' http://localhost:8080/cgi-bin/log-parse.cgi
```

or you can visit the web page at:

http://localhost:8080

and use the form to submit a file for parsing. Note this should just be for small log files, otherwise, it bogs the browser down.

Kevin Gomes
7/25/2018
