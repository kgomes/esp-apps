# This Dockerfile defines the necessary image that is needed to run the ESP web-portal

# Start with the CentOS 7 base image
FROM centos:7

ADD ./ /opt/esp

# Update the OS and then install all the necessary packages
RUN yum upgrade -y && \
    yum update -y && \
    curl --silent --location https://rpm.nodesource.com/setup_10.x | bash - && \
    yum install -y nodejs ImageMagick && \
    cd /opt/esp/server && \
    npm install && \
    cd /opt/esp/app && \
    npm install bower && \
    ./node_modules/bower/bin/bower --allow-root install && \
    npm install -g forever

ADD run.sh /run.sh
RUN chmod -v +x /run.sh

# And set the command
CMD ["/run.sh"]
