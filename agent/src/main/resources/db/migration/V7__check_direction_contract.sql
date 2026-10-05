ALTER TABLE check_definitions
  ADD CONSTRAINT check_definitions_category_direction
  CHECK (
    (category = 'INTERNAL' AND direction IS NULL)
    OR
    (category = 'API'
      AND direction IS NOT NULL
      AND direction IN ('INTERNAL', 'EXTERNAL'))
  ) NOT VALID;

ALTER TABLE check_definitions
  VALIDATE CONSTRAINT check_definitions_category_direction;
