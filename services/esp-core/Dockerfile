# This is a Docker build file that will construct an image from CentOS 7 as the
# base and will then build and install everything it needs to run an ESP core.
# It also builds a Node JS service that will provide a HTTP accessible service
# that can be called to run dumplog on log files.
#
# Please see the README that is along side this Dockerfile for instructions
# -----------------
# Kevin Gomes
# 7/25/2018

# Start with the CentOS 7 base image
FROM centos:7

# Get the command line arguments from the build command
ARG ESP_NAME
ARG ESP_MODE
ARG ESP_PORT

# Start the image build by creating a layer with GCC 4.6 installed and the MBARI
# patched ruby installed as well. Start by installing all the necessary packages
# that are not part of the base CentOS 7 image. The following section all runs
# as the root user
RUN yum upgrade -y && \
    yum update -y

RUN yum install -y \
    gcc \
    git \
    which \
    autoconf \
    byacc \
    make \
    httpd \
    && cd \
# Now create a directory where we can build the MBARI patched ruby.
    && mkdir esp \
    && cd esp \
# Grab the source code from GitHub
    && git clone https://github.com/brentr/matzruby.git ruby-1.8.7-mbari \
    && cd ruby-1.8.7-mbari \
# Check out the correct branch
    && git checkout esp

COPY ./espconfig /root/esp/ruby-1.8.7-mbari/espconfig
RUN chmod -v +x /root/esp/ruby-1.8.7-mbari/espconfig
COPY ./espinstall /root/esp/ruby-1.8.7-mbari/espinstall
RUN chmod -v +x /root/esp/ruby-1.8.7-mbari/espinstall

RUN cd \
    && cd esp/ruby-1.8.7-mbari \
    && export PATH=$PATH:. \
    && espconfig \
    && espinstall \
    && groupadd esp \
    && useradd -g esp -m -s /bin/bash esp \
# Create a log directory and give the new user account ownership.  The ESP process will write to this directory.
    && mkdir /var/log/esp \
    && chown esp:esp /var/log/esp

# Copy in the application and configuration files
COPY ./src/html/index.html /var/www/html/index.html
COPY ./src/cgi-bin/log-parse.cgi /var/www/cgi-bin/log-parse.cgi
COPY ./src/conf/httpd.conf /etc/httpd/conf/httpd.conf
COPY ./src/conf.d/esp.conf /etc/httpd/conf.d/esp.conf

# Set proper owner and permissions on the CGI script
RUN chown esp /var/www/cgi-bin/log-parse.cgi \
    && chmod u+x /var/www/cgi-bin/log-parse.cgi

# Now switch over to the newly created user account and run the rest of the install
USER esp
RUN cd \
# Write all the proper environment variables to the .bashrc file so that when the user logs in, everything will be ready to go
    && echo "export USER=esp" >> .bashrc \
    && echo "export ESPhome=/home/esp/ESP2Gscript" >> .bashrc \
    && echo "export ESPname=$ESP_NAME" >> .bashrc \
    && echo "export ESPmode=$ESP_MODE" >> .bashrc \
    && echo "export ESPport=$ESP_PORT" >> .bashrc \
    && echo "export ESPpath=.:/home/esp/ESP2Gscript/mission:/home/esp/ESP2Gscript/protocol" >> .bashrc \
    && echo "export ESPconfigPath=/home/esp/ESP2Gscript/type/shallow:/home/esp/ESP2Gscript/type/shallow/$ESP_NAME"  >> .bashrc\
    && echo "export PATH=$PATH:/home/esp/ESP2Gscript/bin:/opt/mbari/bin"  >> .bashrc \
    && echo "export RUBYLIB="${RUBYLIB:+$RUBYLIB:}/home/esp/ESP2Gscript/lib:/home/esp/ESP2Gscript/utils:/home/esp/ESP2Gscript/protocol"" >> .bashrc

# Add the script to start the service
USER root
ADD run-httpd.sh /run-httpd.sh
RUN chmod -v +x /run-httpd.sh

# Add links to timezones needed for log parsing
RUN ln -s /usr/share/zoneinfo/PST8PDT /usr/share/zoneinfo/PST \
    && ln -s /usr/share/zoneinfo/PST8PDT /usr/share/zoneinfo/PDT \
    && ln -s /usr/share/zoneinfo/EST5EDT /usr/share/zoneinfo/EDT \
    && ln -s /usr/share/zoneinfo/MST7MDT /usr/share/zoneinfo/MDT \
    && ln -s /usr/share/zoneinfo/CST6CDT /usr/share/zoneinfo/CDT \
    && ln -s /usr/share/zoneinfo/CST6CDT /usr/share/zoneinfo/CST

# And set the command
CMD ["/run-httpd.sh"]
EXPOSE 80
