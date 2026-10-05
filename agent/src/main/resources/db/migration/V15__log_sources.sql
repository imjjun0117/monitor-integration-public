CREATE TABLE log_sources (
    log_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id varchar(64) NOT NULL,
    instance_id varchar(64) NOT NULL,
    name varchar(120) NOT NULL,
    path varchar(1000) NOT NULL,
    encoding varchar(10) NOT NULL CHECK (encoding IN ('UTF-8','MS949','EUC-KR')),
    enabled boolean NOT NULL DEFAULT false,
    poll_interval_seconds integer NOT NULL DEFAULT 10 CHECK (poll_interval_seconds BETWEEN 5 AND 1800),
    FOREIGN KEY(project_id,instance_id) REFERENCES instances(project_id,instance_id) ON DELETE CASCADE,
    UNIQUE(project_id,instance_id,path)
);
CREATE TRIGGER audit_log_sources AFTER INSERT OR UPDATE OR DELETE ON log_sources FOR EACH ROW
    EXECUTE FUNCTION hermes_audit_configuration('log_id','project_id','instance_id','name','path','encoding','enabled','poll_interval_seconds');
