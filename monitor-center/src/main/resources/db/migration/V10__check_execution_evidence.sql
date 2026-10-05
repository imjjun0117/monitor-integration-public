-- Keep bounded request/response evidence only for the latest execution, not every history row.
ALTER TABLE check_results_latest ADD COLUMN evidence_json jsonb;
