#!/bin/bash
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE USER $ESP_APPS_PG_USERNAME WITH PASSWORD '$ESP_APPS_PG_PASSWORD';
    CREATE DATABASE esp_ancillary;
    GRANT ALL PRIVILEGES ON DATABASE esp_ancillary TO $ESP_APPS_PG_USERNAME;
    \connect esp_ancillary;

    SET statement_timeout = 0;
    SET lock_timeout = 0;
    SET client_encoding = 'UTF8';
    SET standard_conforming_strings = on;
    SELECT pg_catalog.set_config('search_path', '', false);
    SET check_function_bodies = false;
    SET client_min_messages = warning;

    CREATE EXTENSION IF NOT EXISTS plpgsql WITH SCHEMA pg_catalog;

    COMMENT ON EXTENSION plpgsql IS 'PL/pgSQL procedural language';

    SET default_tablespace = '';

    SET default_with_oids = false;

    CREATE TABLE public.ancillary_data (
        id integer NOT NULL,
        ancillary_source_id_fk bigint,
        timestamp_utc timestamp with time zone,
        value double precision
    );


    ALTER TABLE public.ancillary_data OWNER TO $ESP_APPS_PG_USERNAME;

    CREATE SEQUENCE public.ancillary_data_id_seq
        START WITH 1
        INCREMENT BY 1
        NO MINVALUE
        NO MAXVALUE
        CACHE 1;


    ALTER TABLE public.ancillary_data_id_seq OWNER TO $ESP_APPS_PG_USERNAME;

    ALTER SEQUENCE public.ancillary_data_id_seq OWNED BY public.ancillary_data.id;

    CREATE TABLE public.ancillary_sources (
        id integer NOT NULL,
        deployment_id_fk character varying(50),
        esp_name character varying(50),
        instrument_type character varying(25),
        var_name character varying(25),
        var_long_name character varying(250),
        units character varying(50),
        log_units character varying(25)
    );

    ALTER TABLE public.ancillary_sources OWNER TO $ESP_APPS_PG_USERNAME;

    CREATE SEQUENCE public.ancillary_sources_id_seq
        START WITH 1
        INCREMENT BY 1
        NO MINVALUE
        NO MAXVALUE
        CACHE 1;

    ALTER TABLE public.ancillary_sources_id_seq OWNER TO $ESP_APPS_PG_USERNAME;

    ALTER SEQUENCE public.ancillary_sources_id_seq OWNED BY public.ancillary_sources.id;

    ALTER TABLE ONLY public.ancillary_data ALTER COLUMN id SET DEFAULT nextval('public.ancillary_data_id_seq'::regclass);

    ALTER TABLE ONLY public.ancillary_sources ALTER COLUMN id SET DEFAULT nextval('public.ancillary_sources_id_seq'::regclass);

    CREATE INDEX ix_timestamp_asc ON public.ancillary_data USING btree (ancillary_source_id_fk, timestamp_utc);

    REVOKE ALL ON SCHEMA public FROM PUBLIC;
    REVOKE ALL ON SCHEMA public FROM postgres;
    GRANT ALL ON SCHEMA public TO postgres;
    GRANT ALL ON SCHEMA public TO PUBLIC;
EOSQL
