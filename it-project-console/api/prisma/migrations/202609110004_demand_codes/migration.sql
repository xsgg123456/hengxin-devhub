BEGIN;
LOCK TABLE demands IN ACCESS EXCLUSIVE MODE;
ALTER TABLE demands ADD COLUMN IF NOT EXISTS code TEXT;
CREATE TABLE IF NOT EXISTS demand_code_counters (
  year INTEGER PRIMARY KEY,
  last_value BIGINT NOT NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Persist the counter independently of demands: deleting a demand never releases its number.
WITH numbered AS (
  SELECT id, EXTRACT(YEAR FROM created_at AT TIME ZONE 'Asia/Shanghai')::INTEGER AS year,
    ROW_NUMBER() OVER (PARTITION BY EXTRACT(YEAR FROM created_at AT TIME ZONE 'Asia/Shanghai') ORDER BY created_at, id) AS number
  FROM demands
)
UPDATE demands p SET code = 'XQ-' || n.year || '-' || LPAD(n.number::TEXT, GREATEST(4, LENGTH(n.number::TEXT)), '0')
FROM numbered n WHERE p.id = n.id AND p.code IS NULL;
INSERT INTO demand_code_counters (year, last_value)
SELECT split_part(code, '-', 2)::INTEGER, MAX(split_part(code, '-', 3)::BIGINT)
FROM demands GROUP BY split_part(code, '-', 2)::INTEGER
ON CONFLICT (year) DO UPDATE SET last_value = GREATEST(demand_code_counters.last_value, EXCLUDED.last_value);
ALTER TABLE demands ALTER COLUMN code SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS demands_code_key ON demands(code);

CREATE OR REPLACE FUNCTION assign_demand_code() RETURNS TRIGGER AS $$
DECLARE demand_year INTEGER; next_number BIGINT;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.code IS DISTINCT FROM OLD.code THEN RAISE EXCEPTION 'Demand code is immutable'; END IF;
    RETURN NEW;
  END IF;
  demand_year := EXTRACT(YEAR FROM NEW.created_at AT TIME ZONE 'Asia/Shanghai')::INTEGER;
  INSERT INTO demand_code_counters (year, last_value) VALUES (demand_year, 1)
  ON CONFLICT (year) DO UPDATE SET last_value = demand_code_counters.last_value + 1, updated_at = CURRENT_TIMESTAMP
  RETURNING last_value INTO next_number;
  NEW.code := 'XQ-' || demand_year || '-' || LPAD(next_number::TEXT, GREATEST(4, LENGTH(next_number::TEXT)), '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS demands_assign_code ON demands;
CREATE TRIGGER demands_assign_code BEFORE INSERT OR UPDATE OF code ON demands
FOR EACH ROW EXECUTE FUNCTION assign_demand_code();

COMMIT;
