BEGIN;

CREATE TABLE IF NOT EXISTS completion_date_changes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  history_id TEXT NOT NULL,
  stage TEXT NOT NULL,
  old_value TEXT NOT NULL,
  new_value TEXT NOT NULL,
  reason TEXT NOT NULL,
  author_id TEXT NOT NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT completion_date_changes_project_id_fkey
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT completion_date_changes_history_id_fkey
    FOREIGN KEY (history_id) REFERENCES stage_histories(id) ON DELETE RESTRICT,
  CONSTRAINT completion_date_changes_author_id_fkey
    FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS completion_date_changes_project_id_created_at_idx
  ON completion_date_changes(project_id, created_at);

DO $$
BEGIN
  EXECUTE 'CREATE CONSTRAINT TRIGGER workspace_changed AFTER INSERT OR UPDATE OR DELETE ON completion_date_changes DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION bump_workspace_revision()';
END;
$$;

COMMIT;
