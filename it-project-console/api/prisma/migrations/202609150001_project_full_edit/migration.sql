ALTER TABLE demands ADD COLUMN IF NOT EXISTS first_requested_on DATE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS first_requested_on DATE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS business_owner_id TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS migration_verified BOOLEAN NOT NULL DEFAULT true;

-- Only legacy explicitly marked rows enter verification. No invented business dates.
UPDATE projects SET migration_verified = false WHERE name LIKE '【迁移待核实】%';
UPDATE projects p SET business_owner_id = d.owner_id FROM demands d
WHERE p.demand_id = d.id AND p.business_owner_id IS NULL;
