create table instance_threshold_contacts (
    project_id varchar(64) not null
    ,instance_id varchar(64) not null
    ,recipient_emails jsonb not null default '[]'::jsonb
    ,metric_emails jsonb not null default '{}'::jsonb
    ,updated_at timestamptz not null default now()
    ,primary key(project_id, instance_id)
    ,foreign key(project_id, instance_id)
        references instances(project_id, instance_id) on delete cascade
    ,check(jsonb_typeof(recipient_emails) = 'array')
    ,check(jsonb_typeof(metric_emails) = 'object')
);

create trigger audit_instance_threshold_contacts
    after insert or update or delete on instance_threshold_contacts
    for each row execute function hermes_audit_configuration(
        'project_id', 'instance_id', 'recipient_emails', 'metric_emails'
    );
