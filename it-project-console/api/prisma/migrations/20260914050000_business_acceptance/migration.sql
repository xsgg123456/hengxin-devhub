ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS acceptance_owner_id TEXT,
  ADD COLUMN IF NOT EXISTS acceptance_status TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS acceptance_submitted_at TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS acceptance_summary TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS acceptance_url TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS acceptance_round INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS acceptance_history JSONB NOT NULL DEFAULT '[]';
-- Existing completed projects retain historical completion without invented approval.
UPDATE projects p SET acceptance_owner_id = d.owner_id
FROM demands d JOIN users u ON u.id = d.owner_id
WHERE p.demand_id = d.id AND p.status = 'ACTIVE' AND u.active AND u.role = 'BUSINESS'
  AND p.acceptance_owner_id IS NULL AND p.acceptance_round = 0 AND p.acceptance_history = '[]'::jsonb;
