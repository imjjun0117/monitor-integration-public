CREATE TABLE app_roles (
    role_id varchar(20) PRIMARY KEY,
    name varchar(60) NOT NULL,
    description varchar(500) NOT NULL DEFAULT '',
    base_role varchar(20) NOT NULL CHECK (base_role IN ('ADMIN','OPERATOR','VIEWER')),
    enabled boolean NOT NULL DEFAULT true,
    builtin boolean NOT NULL DEFAULT false,
    CHECK (base_role <> 'ADMIN' OR (role_id = 'ADMIN' AND builtin AND enabled)),
    CHECK (NOT builtin OR role_id = base_role)
);

INSERT INTO app_roles(role_id,name,base_role,builtin) VALUES
    ('ADMIN','관리자','ADMIN',true),
    ('OPERATOR','운영자','OPERATOR',true),
    ('VIEWER','조회자','VIEWER',true);

ALTER TABLE app_users DROP CONSTRAINT app_users_role_check;
ALTER TABLE app_users ADD CONSTRAINT app_users_role_fkey FOREIGN KEY(role) REFERENCES app_roles(role_id);
ALTER TABLE role_menu_permissions DROP CONSTRAINT role_menu_permissions_role_check;
ALTER TABLE role_menu_permissions ADD CONSTRAINT role_permissions_role_fkey
    FOREIGN KEY(role) REFERENCES app_roles(role_id) ON DELETE CASCADE;

-- 역할 등록·수정·삭제 이력 기록. 인증 정보는 저장하지 않음
CREATE FUNCTION audit_role_configuration() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    actor_name text := nullif(current_setting('hermes.actor',true),'');
    before_row jsonb;
    after_row jsonb;
BEGIN
    IF TG_OP <> 'INSERT' THEN before_row := to_jsonb(OLD); END IF;
    IF TG_OP <> 'DELETE' THEN after_row := to_jsonb(NEW); END IF;
    IF actor_name IS NOT NULL AND before_row IS DISTINCT FROM after_row THEN
        INSERT INTO audit_log(actor,action,entity_type,target_id,before_values,after_values)
        VALUES(actor_name,TG_OP,TG_TABLE_NAME,coalesce(NEW.role_id,OLD.role_id),before_row,after_row);
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;
CREATE TRIGGER audit_roles AFTER INSERT OR UPDATE OR DELETE ON app_roles
    FOR EACH ROW EXECUTE FUNCTION audit_role_configuration();
