ALTER TABLE app_users DROP CONSTRAINT app_users_role_check;
ALTER TABLE app_users ADD CONSTRAINT app_users_role_check CHECK (role IN ('ADMIN','OPERATOR','VIEWER'));
ALTER TABLE app_users ADD COLUMN security_version bigint NOT NULL DEFAULT 0;

CREATE TABLE user_project_access (
    username varchar(80) NOT NULL REFERENCES app_users(username) ON DELETE CASCADE,
    project_id varchar(64) NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    PRIMARY KEY(username,project_id)
);

CREATE TABLE audit_log (
    audit_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    occurred_at timestamptz NOT NULL DEFAULT now(),
    actor varchar(80) NOT NULL,
    action varchar(20) NOT NULL,
    entity_type varchar(40) NOT NULL,
    project_id varchar(64),
    target_id varchar(500) NOT NULL,
    outcome varchar(20) NOT NULL DEFAULT 'SUCCESS',
    before_values jsonb,
    after_values jsonb
);
CREATE INDEX audit_log_time ON audit_log(occurred_at DESC,audit_id DESC);
CREATE INDEX audit_log_project_time ON audit_log(project_id,occurred_at DESC);

-- Persist only selected configuration columns; runtime collection never creates audit rows.
CREATE FUNCTION hermes_audit_configuration() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    actor_name text := nullif(current_setting('hermes.actor',true),'');
    old_row jsonb;
    new_row jsonb;
    before_row jsonb;
    after_row jsonb;
    fields text[] := TG_ARGV;
    target_row jsonb;
    target_name text;
BEGIN
    IF actor_name IS NULL THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
    END IF;
    IF TG_OP <> 'INSERT' THEN old_row := to_jsonb(OLD); END IF;
    IF TG_OP <> 'DELETE' THEN new_row := to_jsonb(NEW); END IF;
    SELECT jsonb_object_agg(key,value) INTO before_row FROM jsonb_each(old_row) WHERE key=ANY(fields);
    SELECT jsonb_object_agg(key,value) INTO after_row FROM jsonb_each(new_row) WHERE key=ANY(fields);
    IF TG_TABLE_NAME='app_users' AND TG_OP='UPDATE' AND old_row->'password_hash' IS DISTINCT FROM new_row->'password_hash' THEN
        before_row := before_row || '{"password_changed":false}'::jsonb;
        after_row := after_row || '{"password_changed":true}'::jsonb;
    END IF;
    IF TG_TABLE_NAME='instances' AND TG_OP='UPDATE' AND old_row->'token_ciphertext' IS DISTINCT FROM new_row->'token_ciphertext' THEN
        before_row := before_row || '{"token_changed":false}'::jsonb;
        after_row := after_row || '{"token_changed":true}'::jsonb;
    END IF;
    IF TG_TABLE_NAME='check_definitions' AND TG_OP='UPDATE' AND old_row->'service_profile_json' IS DISTINCT FROM new_row->'service_profile_json' THEN
        before_row := before_row || '{"service_profile_changed":false}'::jsonb;
        after_row := after_row || '{"service_profile_changed":true}'::jsonb;
    END IF;
    IF TG_OP='UPDATE' AND before_row IS NOT DISTINCT FROM after_row THEN RETURN NEW; END IF;
    target_row := coalesce(new_row,old_row);
    target_name := concat_ws('/',target_row->>'project_id',target_row->>'instance_id',
        target_row->>'check_id',target_row->>'certificate_target_id',target_row->>'username',
        target_row->>'scope',target_row->>'metric_key');
    INSERT INTO audit_log(actor,action,entity_type,project_id,target_id,before_values,after_values)
        VALUES(actor_name,TG_OP,TG_TABLE_NAME,target_row->>'project_id',target_name,before_row,after_row);
    IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

CREATE TRIGGER audit_projects AFTER INSERT OR UPDATE OR DELETE ON projects FOR EACH ROW
    EXECUTE FUNCTION hermes_audit_configuration('project_id','display_name','enabled');
CREATE TRIGGER audit_instances AFTER INSERT OR UPDATE OR DELETE ON instances FOR EACH ROW
    EXECUTE FUNCTION hermes_audit_configuration('project_id','instance_id','display_name','environment','agent_base_url','api_checks_enabled','poll_interval_seconds','enabled');
CREATE TRIGGER audit_checks AFTER INSERT OR UPDATE OR DELETE ON check_definitions FOR EACH ROW
    EXECUTE FUNCTION hermes_audit_configuration('project_id','instance_id','check_id','name','category','direction','enabled','monitoring_enabled','automatic_enabled','check_interval_seconds');
CREATE TRIGGER audit_thresholds AFTER INSERT OR UPDATE OR DELETE ON thresholds FOR EACH ROW
    EXECUTE FUNCTION hermes_audit_configuration('scope','project_id','instance_id','metric_key','warning_value','critical_value');
CREATE TRIGGER audit_certificates AFTER INSERT OR UPDATE OR DELETE ON certificate_targets FOR EACH ROW
    EXECUTE FUNCTION hermes_audit_configuration('certificate_target_id','project_id','hostname','port','sni_hostname','enabled','check_interval_minutes');
CREATE TRIGGER audit_users AFTER INSERT OR UPDATE OR DELETE ON app_users FOR EACH ROW
    EXECUTE FUNCTION hermes_audit_configuration('username','role','enabled');
CREATE TRIGGER audit_project_access AFTER INSERT OR UPDATE OR DELETE ON user_project_access FOR EACH ROW
    EXECUTE FUNCTION hermes_audit_configuration('username','project_id');
