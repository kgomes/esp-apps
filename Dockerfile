# This Dockerfile defines the necessary image that is needed to run the ESP web-portal

# Start with the CentOS 7 base image
FROM centos:7

# COPY in the files that are necessary for the portal to run
COPY ./server/AppServer.js \
     ./server/couch-views.js \
     ./server/crawler.js \
     ./server/DataAccess.js \
     ./server/DeploymentFileSync.js \
     ./server/DeploymentUtils.js \
     ./server/OutParser.js \
     ./server/package-lock.json \
     ./server/package.json \
     ./server/parseDeployments.js \
     ./server/server.js \
     ./server/TimeZoneLookup.js \
     /opt/esp/server/

COPY ./server/routes /opt/esp/server/routes/

COPY ./app/favicon.ico \
     ./app/index.html \
     ./app/package-lock.json \
     ./app/package.json \
     /opt/esp/app/

COPY ./app/css /opt/esp/app/css/
COPY ./app/img /opt/esp/app/img/
COPY ./app/js /opt/esp/app/js/
COPY ./app/templates /opt/esp/app/templates/

# Update the OS and then install all the necessary packages
RUN yum upgrade -y && \
    yum update -y && \
    curl --silent --location https://rpm.nodesource.com/setup_12.x | bash - && \
    yum install -y nodejs ImageMagick crontabs && \
    cd /opt/esp/server && \
    npm install && \
    cd /opt/esp/app && \
    npm install

# Add the cron job to run the deployment parser
RUN sed -i -e '/pam_loginuid.so/s/^/#/' /etc/pam.d/crond
COPY parser-cron /etc/cron.d/parser-cron
RUN chmod 0644 /etc/cron.d/parser-cron
RUN crontab /etc/cron.d/parser-cron

ADD run.sh /run.sh
RUN chmod -v +x /run.sh

# And set the command
CMD ["/run.sh"]
