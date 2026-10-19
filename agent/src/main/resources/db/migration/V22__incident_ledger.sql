-- 진행 중 장애를 항목별 한 건으로 유지하고 조치 이력을 별도 보관
create table incidents (
    incident_id bigint generated always as identity primary key
    ,project_id varchar(64) not null references projects(project_id) on delete cascade
    ,instance_id varchar(64)
    ,source_key text not null
    ,kind varchar(20) not null
    ,metric_key varchar(40)
    ,subject_id varchar(64)
    ,subject_name varchar(500)
    ,severity varchar(10) not null check (severity in ('WARN', 'DOWN'))
    ,state varchar(30) not null default 'OPEN'
        check (state in ('OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RECOVERED', 'MONITORING_STOPPED'))
    ,opened_at timestamptz not null default now()
    ,last_detected_at timestamptz not null default now()
    ,closed_at timestamptz
    ,assignee varchar(80)
    ,version bigint not null default 0
    ,first_observation jsonb not null
    ,latest_observation jsonb not null
    ,foreign key(project_id, instance_id) references instances(project_id, instance_id) on delete cascade
    ,check ((closed_at is null) = (state in ('OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS')))
);
create unique index incidents_one_active
    on incidents(project_id, source_key) where closed_at is null;
create index incidents_project_time on incidents(project_id, opened_at desc, incident_id desc);

create table incident_events (
    event_id bigint generated always as identity primary key
    ,incident_id bigint not null references incidents(incident_id) on delete cascade
    ,occurred_at timestamptz not null default now()
    ,actor varchar(80) not null
    ,event_type varchar(30) not null
    ,note varchar(2000)
    ,assignee varchar(80)
);
create index incident_events_lookup on incident_events(incident_id, event_id desc);

insert into app_menus(menu_id, label, route, sort_order)
values ('incidents', '장애 관리', '/incidents', 15);

-- 기존 프로젝트 접근·변경 권한을 초기 장애 메뉴 권한으로 적용
insert into role_menu_permissions(role, menu_id, can_read, can_write)
select
    role
    ,'incidents'
    ,can_read
    ,can_write
from role_menu_permissions
where menu_id = 'projects';
