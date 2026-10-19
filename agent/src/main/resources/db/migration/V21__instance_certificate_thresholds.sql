alter table certificate_targets
    add constraint certificate_targets_project_id_target_unique
    unique(project_id, certificate_target_id);

-- 인증서 하나를 한 인스턴스의 SSL 임계치에 연결
create table instance_certificate_thresholds (
    project_id varchar(64) not null
    ,instance_id varchar(64) not null
    ,certificate_target_id bigint not null unique
    ,primary key(project_id, instance_id)
    ,foreign key(project_id, instance_id)
        references instances(project_id, instance_id) on delete cascade
    ,foreign key(project_id, certificate_target_id)
        references certificate_targets(project_id, certificate_target_id) on delete cascade
);

create trigger audit_instance_certificate_thresholds
    after insert or update or delete on instance_certificate_thresholds
    for each row execute function hermes_audit_configuration(
        'project_id', 'instance_id', 'certificate_target_id'
    );
