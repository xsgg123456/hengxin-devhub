ALTER TABLE projects ADD COLUMN IF NOT EXISTS stage_plans JSONB NOT NULL DEFAULT '[]';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS actual_completed_at TIMESTAMPTZ(3);

-- Preserve explicit completion evidence, excluding episodes superseded by a reopen.
-- No plans, missing actual dates, or archive choices are inferred from updated_at.
WITH evidence AS (
  SELECT entity_id AS project_id, created_at AS at, 'lifecycle' AS source
  FROM lifecycle_events WHERE entity_type = 'project' AND action = 'complete'
  UNION ALL
  SELECT project_id, completed_at AS at, 'stage' AS source FROM stage_histories
  WHERE stage = '验收交付' AND completed_at IS NOT NULL
), completed AS (
  -- Acceptance completion is authoritative. Old explicit project completion is fallback only.
  SELECT e.project_id, COALESCE(MAX(e.at) FILTER (WHERE e.source = 'stage'), MAX(e.at)) AS at FROM evidence e
  WHERE NOT EXISTS (
    SELECT 1 FROM lifecycle_events reopened
    WHERE reopened.entity_type = 'project' AND reopened.entity_id = e.project_id
      AND reopened.action = 'reopen' AND reopened.created_at > e.at
  )
  GROUP BY e.project_id
)
UPDATE projects p SET actual_completed_at = completed.at, status = 'COMPLETED'
FROM completed
WHERE p.id = completed.project_id AND p.actual_completed_at IS NULL
  AND (p.status = 'COMPLETED' OR (p.status = 'ACTIVE' AND p.stage = '验收交付' AND p.simple_status = 'completed'));
