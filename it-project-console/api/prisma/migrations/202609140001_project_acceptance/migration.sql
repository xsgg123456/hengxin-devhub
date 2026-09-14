ALTER TYPE demand_status ADD VALUE IF NOT EXISTS 'AWAITING_ENGINEER';
ALTER TABLE projects ADD COLUMN approved_launch_date DATE;
CREATE TABLE project_proposals (
 id TEXT PRIMARY KEY, request_id TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
 name TEXT NOT NULL, department TEXT NOT NULL, demand_id TEXT UNIQUE REFERENCES demands(id) ON DELETE CASCADE,
 priority TEXT NOT NULL, primary_owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 collaborator_ids TEXT[] NOT NULL DEFAULT '{}', approved_launch_date DATE NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','returned','confirmed')),
 review_reason TEXT NOT NULL DEFAULT '', created_by TEXT NOT NULL,
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ(3) NOT NULL,
 project_id TEXT UNIQUE REFERENCES projects(id) ON DELETE CASCADE
);
CREATE INDEX project_proposals_primary_owner_id_status_idx ON project_proposals(primary_owner_id,status);
