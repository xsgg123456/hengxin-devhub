ALTER TABLE projects ADD COLUMN IF NOT EXISTS blocker TEXT NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS risks JSONB NOT NULL DEFAULT '[]', ADD COLUMN IF NOT EXISTS risk_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE projects ALTER COLUMN overall_progress TYPE DOUBLE PRECISION;
ALTER TABLE stage_histories ADD COLUMN IF NOT EXISTS interrupted_at TIMESTAMPTZ(3);
DROP INDEX IF EXISTS stage_histories_project_id_stage_key;
CREATE INDEX IF NOT EXISTS stage_histories_project_id_stage_idx ON stage_histories(project_id, stage);
CREATE TABLE IF NOT EXISTS progress_updates (id TEXT PRIMARY KEY,
project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE ON UPDATE CASCADE, author_id TEXT NOT NULL,
kind TEXT NOT NULL, stage TEXT NOT NULL, status TEXT NOT NULL, summary TEXT NOT NULL, blocker TEXT NOT NULL DEFAULT '', overall_progress DOUBLE PRECISION,
created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ(3) NOT NULL);
CREATE INDEX IF NOT EXISTS progress_updates_project_id_created_at_idx ON progress_updates (project_id, created_at);
CREATE TABLE IF NOT EXISTS schedule_changes (id TEXT PRIMARY KEY,
project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE ON UPDATE CASCADE, author_id TEXT NOT NULL,
field TEXT NOT NULL, old_value TEXT NOT NULL, new_value TEXT NOT NULL, reason TEXT NOT NULL, description TEXT NOT NULL,
created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ(3) NOT NULL);
CREATE INDEX IF NOT EXISTS schedule_changes_project_id_created_at_idx ON schedule_changes (project_id, created_at);
CREATE TABLE IF NOT EXISTS lifecycle_events (id TEXT PRIMARY KEY,
entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, author_id TEXT NOT NULL,
action TEXT NOT NULL, reason TEXT NOT NULL DEFAULT '', before JSONB NOT NULL, after JSONB NOT NULL,
created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ(3) NOT NULL);
CREATE INDEX IF NOT EXISTS lifecycle_events_entity_type_entity_id_created_at_idx ON lifecycle_events (entity_type, entity_id, created_at);
CREATE TABLE IF NOT EXISTS risk_snapshots (id TEXT PRIMARY KEY,
project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE ON UPDATE CASCADE, version INTEGER NOT NULL, risks JSONB NOT NULL,
created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ(3) NOT NULL);
CREATE INDEX IF NOT EXISTS risk_snapshots_project_id_created_at_idx ON risk_snapshots (project_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS risk_snapshots_project_id_version_key ON risk_snapshots(project_id, version);
