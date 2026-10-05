ALTER TABLE instances
  ADD COLUMN IF NOT EXISTS last_polled_at timestamptz;

CREATE INDEX IF NOT EXISTS instances_poll_due
  ON instances(last_polled_at)
  WHERE enabled;
