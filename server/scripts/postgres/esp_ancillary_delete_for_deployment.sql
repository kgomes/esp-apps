-- Delete the data points themselves first
delete from ancillary_data where ancillary_source_id_fk in (select id from ancillary_sources where deployment_id_fk = 'xxxxxxxxxxxxxx');

-- Now delete the sources
delete from ancillary_sources where deployment_id_fk = 'xxxxxxxxxxxxxx';