CREATE TABLE app_menus (
    menu_id varchar(32) PRIMARY KEY,
    label varchar(60) NOT NULL,
    route varchar(100) NOT NULL UNIQUE,
    sort_order integer NOT NULL CHECK (sort_order BETWEEN 0 AND 999),
    enabled boolean NOT NULL DEFAULT true
);

INSERT INTO app_menus(menu_id,label,route,sort_order) VALUES
    ('dashboard','종합 현황','/',10),
    ('projects','프로젝트','/projects',20),
    ('api','API 모니터링','/api-monitoring',30),
    ('certificates','인증서 관리','/certificates',40),
    ('settings','설정','/settings/projects',50);

CREATE TABLE role_menu_permissions (
    role varchar(20) NOT NULL CHECK (role IN ('ADMIN','OPERATOR','VIEWER')),
    menu_id varchar(32) NOT NULL REFERENCES app_menus(menu_id),
    can_read boolean NOT NULL,
    can_write boolean NOT NULL,
    PRIMARY KEY(role,menu_id),
    CHECK (NOT can_write OR can_read),
    CHECK (role <> 'VIEWER' OR NOT can_write),
    CHECK (role <> 'ADMIN' OR (can_read AND can_write))
);

INSERT INTO role_menu_permissions(role,menu_id,can_read,can_write)
    SELECT role,menu_id,true,role <> 'VIEWER'
    FROM app_menus CROSS JOIN (VALUES ('ADMIN'),('OPERATOR'),('VIEWER')) AS roles(role);

-- 메뉴 권한 변경은 역할과 메뉴 ID까지 식별하여 기록
CREATE FUNCTION audit_menu_configuration() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    actor_name text := nullif(current_setting('hermes.actor',true),'');
BEGIN
    IF actor_name IS NOT NULL AND to_jsonb(OLD) IS DISTINCT FROM to_jsonb(NEW) THEN
        INSERT INTO audit_log(actor,action,entity_type,target_id,before_values,after_values)
            VALUES(actor_name,TG_OP,TG_TABLE_NAME,
                concat_ws('/',to_jsonb(NEW)->>'role',NEW.menu_id),to_jsonb(OLD),to_jsonb(NEW));
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER audit_menus AFTER UPDATE ON app_menus FOR EACH ROW
    EXECUTE FUNCTION audit_menu_configuration();
CREATE TRIGGER audit_menu_permissions AFTER UPDATE ON role_menu_permissions FOR EACH ROW
    EXECUTE FUNCTION audit_menu_configuration();
