ALTER TABLE certificate_targets
  ADD COLUMN target_version bigint NOT NULL DEFAULT 0;

ALTER TABLE instances
  ADD CONSTRAINT instances_poll_interval_safe
  CHECK (poll_interval_seconds <= 715827882) NOT VALID;
