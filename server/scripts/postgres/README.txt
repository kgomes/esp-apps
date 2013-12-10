This directory contains the script and information that is necessary to work with the PostgreSQL database
where the ancillary data is housed.  Please note that you need PostgreSQL 9 to work properly.

Installation:
1. In order to get started, after installing PostgreSQL, you need to change user to the 'postgres' user and run 'psql'
2. Create the database using:

CREATE DATABASE esp_ancillary;

3. Then create the appropriate user:

CREATE USER espdba WITH PASSWORD 'thepassword';

4. Then grant that user perimissions

GRANT ALL PRIVILEGES ON DATABASE esp_ancillary TO espdba;

5. Now build the table structures, etc. by running the esp_ancillary.sql script:

Also note that you will have to set up the PostgreSQL server to accept connection from the Node processes.  I did this
by editing the pg_hba.conf file to have the entries:

local   all     all                         trust
host    all     all     127.0.0.1/32        trust
host    all     all     ::1/128             ident

