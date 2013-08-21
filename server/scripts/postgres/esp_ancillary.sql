--
-- PostgreSQL database dump
-- This file is obtained from the DB using something like:
-- pg_dump --host localhost --port 5432 --username "postgres" --format plain --schema-only \
-- --file "/Users/kgomes/Desktop/esp_ancillary" --table "public.ancillary_data" \
-- --table "public.ancillary_sources" "esp_ancillary"
--

SET statement_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = off;
SET check_function_bodies = false;
SET client_min_messages = warning;
SET escape_string_warning = off;

SET search_path = public, pg_catalog;

SET default_tablespace = '';

SET default_with_oids = false;

--
-- Name: ancillary_data; Type: TABLE; Schema: public; Owner: espdba; Tablespace: 
--

CREATE TABLE ancillary_data (
    id integer NOT NULL,
    ancillary_source_id_fk bigint,
    timestamp_utc timestamp with time zone,
    value double precision
);


ALTER TABLE public.ancillary_data OWNER TO espdba;

--
-- Name: ancillary_data_id_seq; Type: SEQUENCE; Schema: public; Owner: espdba
--

CREATE SEQUENCE ancillary_data_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.ancillary_data_id_seq OWNER TO espdba;

--
-- Name: ancillary_data_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: espdba
--

ALTER SEQUENCE ancillary_data_id_seq OWNED BY ancillary_data.id;


--
-- Name: ancillary_sources; Type: TABLE; Schema: public; Owner: espdba; Tablespace: 
--

CREATE TABLE ancillary_sources (
    id integer NOT NULL,
    deployment_id_fk character varying(50),
    esp_name character varying(50),
    instrument_type character varying(25),
    var_name character varying(25),
    var_long_name character varying(250),
    units character varying(50),
    log_units character varying(25)
);


ALTER TABLE public.ancillary_sources OWNER TO espdba;

--
-- Name: ancillary_sources_id_seq; Type: SEQUENCE; Schema: public; Owner: espdba
--

CREATE SEQUENCE ancillary_sources_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.ancillary_sources_id_seq OWNER TO espdba;

--
-- Name: ancillary_sources_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: espdba
--

ALTER SEQUENCE ancillary_sources_id_seq OWNED BY ancillary_sources.id;


--
-- Name: id; Type: DEFAULT; Schema: public; Owner: espdba
--

ALTER TABLE ONLY ancillary_data ALTER COLUMN id SET DEFAULT nextval('ancillary_data_id_seq'::regclass);


--
-- Name: id; Type: DEFAULT; Schema: public; Owner: espdba
--

ALTER TABLE ONLY ancillary_sources ALTER COLUMN id SET DEFAULT nextval('ancillary_sources_id_seq'::regclass);


--
-- Name: ix_timestamp_asc; Type: INDEX; Schema: public; Owner: espdba; Tablespace: 
--

CREATE INDEX ix_timestamp_asc ON ancillary_data USING btree (ancillary_source_id_fk, timestamp_utc);


--
-- PostgreSQL database dump complete
--

