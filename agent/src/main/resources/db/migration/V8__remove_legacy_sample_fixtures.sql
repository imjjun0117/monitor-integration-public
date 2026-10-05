-- Compatibility cleanup for the historical V2 sample fixture migration.
-- Match every synthetic attribute before removal so operator-created rows are preserved.
DELETE FROM instances
WHERE (project_id, instance_id, display_name, environment, agent_base_url) IN (
  ('sample-a', 'local-01', '샘플 A 1', 'local', 'http://127.0.0.1:18081'),
  ('sample-a', 'local-02', '샘플 A 2', 'local', 'http://127.0.0.1:18082'),
  ('sample-b', 'local-01', '샘플 B 1', 'local', 'http://127.0.0.1:18083'),
  ('sample-b', 'local-02', '샘플 B 2', 'local', 'http://127.0.0.1:18084')
)
AND token_ciphertext = decode(repeat('00', 32), 'hex')
AND token_iv = decode(repeat('00', 12), 'hex')
AND NOT EXISTS (
  SELECT 1
  FROM instance_snapshot_latest latest
  WHERE latest.project_id = instances.project_id
    AND latest.instance_id = instances.instance_id
);

DELETE FROM projects
WHERE (project_id, display_name) IN (
  ('sample-a', '샘플 A'),
  ('sample-b', '샘플 B')
)
AND NOT EXISTS (
  SELECT 1 FROM instances WHERE instances.project_id = projects.project_id
)
AND NOT EXISTS (
  SELECT 1
  FROM certificate_targets
  WHERE certificate_targets.project_id = projects.project_id
);
