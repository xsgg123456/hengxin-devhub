ALTER TABLE demands ADD COLUMN IF NOT EXISTS parent_project_id TEXT REFERENCES projects(id) ON DELETE RESTRICT;
ALTER TABLE demands ADD COLUMN IF NOT EXISTS optimization_outcome TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS parent_project_id TEXT REFERENCES projects(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS demands_parent_project_id_idx ON demands(parent_project_id);
CREATE INDEX IF NOT EXISTS projects_parent_project_id_idx ON projects(parent_project_id);
