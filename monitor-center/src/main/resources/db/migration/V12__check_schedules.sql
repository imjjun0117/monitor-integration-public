ALTER TABLE check_definitions
  ADD COLUMN automatic_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN check_interval_seconds integer,
  ADD CONSTRAINT check_interval_range CHECK
    (check_interval_seconds IS NULL OR check_interval_seconds BETWEEN 60 AND 604800);

-- Preserve the existing automatic API targets. Other instances and internal
-- checks require an explicit choice before they start making scheduled requests.
UPDATE check_definitions d SET automatic_enabled=true
WHERE d.category='API' AND d.instance_id=(
  SELECT min(i.instance_id) FROM instances i
  WHERE i.project_id=d.project_id AND i.enabled AND i.api_checks_enabled
);
