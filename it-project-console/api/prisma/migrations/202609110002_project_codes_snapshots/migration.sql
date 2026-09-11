BEGIN;
LOCK TABLE projects IN ACCESS EXCLUSIVE MODE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS code TEXT;
CREATE TABLE IF NOT EXISTS project_code_counters (
  year INTEGER PRIMARY KEY,
  last_value BIGINT NOT NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Persist the counter independently of projects: deleting a project never releases its number.
WITH numbered AS (
  SELECT id, EXTRACT(YEAR FROM created_at AT TIME ZONE 'Asia/Shanghai')::INTEGER AS year,
    ROW_NUMBER() OVER (PARTITION BY EXTRACT(YEAR FROM created_at AT TIME ZONE 'Asia/Shanghai') ORDER BY created_at, id) AS number
  FROM projects
)
UPDATE projects p SET code = 'XM-' || n.year || '-' || LPAD(n.number::TEXT, GREATEST(4, LENGTH(n.number::TEXT)), '0')
FROM numbered n WHERE p.id = n.id AND p.code IS NULL;
INSERT INTO project_code_counters (year, last_value)
SELECT split_part(code, '-', 2)::INTEGER, MAX(split_part(code, '-', 3)::BIGINT)
FROM projects GROUP BY split_part(code, '-', 2)::INTEGER
ON CONFLICT (year) DO UPDATE SET last_value = GREATEST(project_code_counters.last_value, EXCLUDED.last_value);
ALTER TABLE projects ALTER COLUMN code SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS projects_code_key ON projects(code);

CREATE OR REPLACE FUNCTION assign_project_code() RETURNS TRIGGER AS $$
DECLARE project_year INTEGER; next_number BIGINT;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.code IS DISTINCT FROM OLD.code THEN RAISE EXCEPTION 'Project code is immutable'; END IF;
    RETURN NEW;
  END IF;
  project_year := EXTRACT(YEAR FROM NEW.created_at AT TIME ZONE 'Asia/Shanghai')::INTEGER;
  INSERT INTO project_code_counters (year, last_value) VALUES (project_year, 1)
  ON CONFLICT (year) DO UPDATE SET last_value = project_code_counters.last_value + 1, updated_at = CURRENT_TIMESTAMP
  RETURNING last_value INTO next_number;
  NEW.code := 'XM-' || project_year || '-' || LPAD(next_number::TEXT, GREATEST(4, LENGTH(next_number::TEXT)), '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS projects_assign_code ON projects;
CREATE TRIGGER projects_assign_code BEFORE INSERT OR UPDATE OF code ON projects
FOR EACH ROW EXECUTE FUNCTION assign_project_code();

ALTER TABLE stage_histories ADD COLUMN IF NOT EXISTS planned_start_date DATE;
ALTER TABLE stage_histories ADD COLUMN IF NOT EXISTS planned_end_date DATE;
-- Current plans are not reliable evidence of the plan at a past completion.
-- Leave legacy snapshots NULL; only new observed completions freeze their current plan.
COMMIT;
