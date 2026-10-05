ALTER TABLE instance_metric_samples
    ADD COLUMN IF NOT EXISTS non_heap_used_bytes bigint,
    ADD COLUMN IF NOT EXISTS thread_peak_count integer;

ALTER TABLE db_pool_samples
    ADD COLUMN IF NOT EXISTS min_idle integer,
    ADD COLUMN IF NOT EXISTS max_wait_ms bigint;

CREATE INDEX IF NOT EXISTS disk_samples_lookup
    ON disk_samples(project_id, instance_id, sampled_at DESC);
CREATE INDEX IF NOT EXISTS db_pool_samples_lookup
    ON db_pool_samples(project_id, instance_id, sampled_at DESC);
CREATE INDEX IF NOT EXISTS check_result_samples_lookup
    ON check_result_samples(project_id, instance_id, checked_at DESC);
