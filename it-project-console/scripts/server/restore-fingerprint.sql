SET timezone TO 'UTC';
CREATE TEMP TABLE restore_fingerprint(table_name text, rows bigint, digest text);
DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename LOOP
  EXECUTE format('INSERT INTO restore_fingerprint SELECT %L, count(*), md5(coalesce(string_agg(row_to_json(t)::text, E''\n'' ORDER BY row_to_json(t)::text), '''')) FROM public.%I t',r.tablename,r.tablename);
 END LOOP;
END $$;
SELECT table_name || '|' || rows || '|' || digest FROM restore_fingerprint ORDER BY table_name;
