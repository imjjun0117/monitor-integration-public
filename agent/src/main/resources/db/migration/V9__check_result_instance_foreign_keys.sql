DELETE FROM check_results_latest r
WHERE NOT EXISTS (
  SELECT 1 FROM instances i
  WHERE i.project_id = r.project_id
    AND i.instance_id = r.instance_id
);

DELETE FROM check_result_samples r
WHERE NOT EXISTS (
  SELECT 1 FROM instances i
  WHERE i.project_id = r.project_id
    AND i.instance_id = r.instance_id
);

ALTER TABLE check_results_latest
  ADD CONSTRAINT check_results_latest_instance_fk
  FOREIGN KEY (project_id, instance_id)
  REFERENCES instances(project_id, instance_id)
  ON DELETE CASCADE
  NOT VALID;

ALTER TABLE check_result_samples
  ADD CONSTRAINT check_result_samples_instance_fk
  FOREIGN KEY (project_id, instance_id)
  REFERENCES instances(project_id, instance_id)
  ON DELETE CASCADE
  NOT VALID;

ALTER TABLE check_results_latest
  VALIDATE CONSTRAINT check_results_latest_instance_fk;

ALTER TABLE check_result_samples
  VALIDATE CONSTRAINT check_result_samples_instance_fk;
