BEGIN;
LOCK TABLE projects IN ACCESS EXCLUSIVE MODE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS legacy_code TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS projects_legacy_code_key ON projects(legacy_code);
CREATE TABLE IF NOT EXISTS optimization_code_counters (
  year INTEGER PRIMARY KEY,
  last_value BIGINT NOT NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- Preserve both high-water marks, including deleted XM numbers.
INSERT INTO optimization_code_counters (year, last_value)
SELECT split_part(code, '-', 2)::INTEGER, MAX(split_part(code, '-', 3)::BIGINT)
FROM projects WHERE code LIKE 'YH-%' GROUP BY split_part(code, '-', 2)::INTEGER
ON CONFLICT (year) DO UPDATE SET last_value = GREATEST(optimization_code_counters.last_value, EXCLUDED.last_value);
DROP TRIGGER IF EXISTS projects_assign_code ON projects;
DO $$
DECLARE item RECORD; project_year INTEGER; next_number BIGINT;
BEGIN
  FOR item IN SELECT id, code FROM projects WHERE parent_project_id IS NOT NULL AND code LIKE 'XM-%' ORDER BY created_at, id LOOP
    project_year := split_part(item.code, '-', 2)::INTEGER;
    INSERT INTO optimization_code_counters (year, last_value) VALUES (project_year, 1)
    ON CONFLICT (year) DO UPDATE SET last_value = optimization_code_counters.last_value + 1, updated_at = CURRENT_TIMESTAMP
    RETURNING last_value INTO next_number;
    UPDATE projects SET legacy_code = item.code,
      code = 'YH-' || project_year || '-' || LPAD(next_number::TEXT, GREATEST(4, LENGTH(next_number::TEXT)), '0') WHERE id = item.id;
  END LOOP;
END;
$$;
-- Flush deferred workspace revision events before altering the trigger definition.
SET CONSTRAINTS ALL IMMEDIATE;
CREATE OR REPLACE FUNCTION assign_project_code() RETURNS TRIGGER AS $$
DECLARE project_year INTEGER; next_number BIGINT; prefix TEXT;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.code IS DISTINCT FROM OLD.code OR NEW.legacy_code IS DISTINCT FROM OLD.legacy_code
      OR NEW.parent_project_id IS DISTINCT FROM OLD.parent_project_id THEN
      RAISE EXCEPTION 'Project code, legacy code and type are immutable';
    END IF;
    RETURN NEW;
  END IF;
  project_year := EXTRACT(YEAR FROM NEW.created_at AT TIME ZONE 'Asia/Shanghai')::INTEGER;
  IF NEW.parent_project_id IS NULL THEN
    prefix := 'XM';
    INSERT INTO project_code_counters (year, last_value) VALUES (project_year, 1)
    ON CONFLICT (year) DO UPDATE SET last_value = project_code_counters.last_value + 1, updated_at = CURRENT_TIMESTAMP
    RETURNING last_value INTO next_number;
  ELSE
    prefix := 'YH';
    INSERT INTO optimization_code_counters (year, last_value) VALUES (project_year, 1)
    ON CONFLICT (year) DO UPDATE SET last_value = optimization_code_counters.last_value + 1, updated_at = CURRENT_TIMESTAMP
    RETURNING last_value INTO next_number;
  END IF;
  NEW.code := prefix || '-' || project_year || '-' || LPAD(next_number::TEXT, GREATEST(4, LENGTH(next_number::TEXT)), '0');
  NEW.legacy_code := NULL;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER projects_assign_code BEFORE INSERT OR UPDATE OF code, legacy_code, parent_project_id ON projects
FOR EACH ROW EXECUTE FUNCTION assign_project_code();
COMMIT;
