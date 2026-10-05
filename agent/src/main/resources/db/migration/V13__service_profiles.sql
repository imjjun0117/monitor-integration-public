-- Operator-owned display configuration is preserved during agent discovery.
ALTER TABLE check_definitions ADD COLUMN service_profile_json jsonb,
  ADD CONSTRAINT service_profile_object CHECK
    (service_profile_json IS NULL OR jsonb_typeof(service_profile_json) IN ('object','null'));
