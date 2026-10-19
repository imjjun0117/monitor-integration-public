alter table projects add column xlog_enabled boolean not null default false;
alter table instances add column transport_mode varchar(4) not null default 'HTTP'
    check (transport_mode in ('HTTP', 'WSS'));

create table collector_events (
    id bigint generated always as identity primary key
    ,project_id varchar(64) not null
    ,instance_id varchar(64) not null
    ,kind varchar(8) not null check (kind in ('XLOG', 'LOG'))
    ,received_at timestamptz not null default now()
    ,payload jsonb not null
    ,foreign key(project_id, instance_id) references instances(project_id, instance_id)
        on delete cascade
);
create index collector_events_lookup on collector_events(project_id, instance_id, kind, id desc);

drop trigger audit_projects on projects;
create trigger audit_projects after insert or update or delete on projects for each row
    execute function hermes_audit_configuration('project_id','display_name','enabled','xlog_enabled');
drop trigger audit_instances on instances;
create trigger audit_instances after insert or update or delete on instances for each row
    execute function hermes_audit_configuration('project_id','instance_id','display_name','environment','agent_base_url','api_checks_enabled','poll_interval_seconds','enabled','transport_mode');
