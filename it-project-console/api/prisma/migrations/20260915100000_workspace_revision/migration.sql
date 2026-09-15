-- Deferred triggers acquire the shared revision row only after business writes,
-- avoiding a global lock held while later statements lock business rows.
CREATE TABLE workspace_revision (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  revision uuid NOT NULL DEFAULT gen_random_uuid()
);
INSERT INTO workspace_revision (id) VALUES (1);

CREATE FUNCTION bump_workspace_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- One update per transaction, including bulk directory imports. SET LOCAL
  -- rolls back with savepoints/transactions; no sequence or wall clock is used.
  IF current_setting('itpc.workspace_revision_bumped', true) IS DISTINCT FROM 'yes' THEN
    EXECUTE format('UPDATE %I.workspace_revision SET revision = gen_random_uuid() WHERE id = 1', TG_TABLE_SCHEMA);
    PERFORM set_config('itpc.workspace_revision_bumped', 'yes', true);
  END IF;
  RETURN NULL;
END;
$$;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'users', 'departments', 'manager_grants', 'demands', 'projects',
    'project_proposals', 'project_members', 'attachments', 'stage_histories',
    'progress_updates', 'schedule_changes', 'lifecycle_events', 'risk_snapshots',
    'system_settings'
  ] LOOP
    EXECUTE format(
      'CREATE CONSTRAINT TRIGGER workspace_changed AFTER INSERT OR UPDATE OR DELETE ON %I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION bump_workspace_revision()',
      table_name
    );
  END LOOP;
END;
$$;
