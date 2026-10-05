-- Agent discovery and the operator's usage preference have separate lifecycles.
ALTER TABLE check_definitions
  ADD COLUMN monitoring_enabled boolean NOT NULL DEFAULT true;
