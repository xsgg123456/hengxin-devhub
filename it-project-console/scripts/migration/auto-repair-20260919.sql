-- 生产历史数据自动修复（2026-09-19）
--
-- 只处理已通过规则判定、无需业务猜测的记录：
-- 1. 已完成项目的整体进度补为 100%；
-- 2. 项目名称回写到关联需求；
-- 3. 没有任何时间证据且已有有效替代记录的旧阶段占位行标记为 legacy-placeholder；
-- 4. 已完成项目的旧风险通知标记为 SKIPPED，避免继续投递。
--
-- 事务、幂等、范围保护：重复执行不会重复修改，目标数量超出已知范围会回滚。

BEGIN;

SELECT pg_advisory_xact_lock(hashtextextended('itpc:auto-repair:20260919', 0));
-- 与通知投递共用同一把锁，避免把已受理、等待钉钉回执的通知当成旧通知处理。
SELECT pg_advisory_xact_lock(hashtextextended(current_schema() || ':notification-flush', 0));

CREATE TEMP TABLE repair_progress_targets ON COMMIT DROP AS
SELECT p.id, p.code, p.overall_progress, p.version
FROM projects p
WHERE p.code = 'XM-2026-0035'
  AND p.status = 'COMPLETED'
  AND p.simple_status = 'completed'
  AND p.acceptance_status = 'accepted'
  AND p.actual_completed_at IS NOT NULL
  AND p.overall_progress < 100
FOR UPDATE OF p;

CREATE TEMP TABLE repair_demand_targets ON COMMIT DROP AS
SELECT d.id AS demand_id, d.code AS demand_code, d.name AS demand_name,
       d.version AS demand_version, p.id AS project_id, p.code AS project_code,
       p.name AS project_name, p.version AS project_version
FROM projects p
JOIN demands d ON d.id = p.demand_id
WHERE p.code = 'XM-2026-0019'
  AND d.code = 'XQ-2026-0003'
  AND d.name IS DISTINCT FROM p.name
FOR UPDATE OF p, d;

CREATE TEMP TABLE repair_stage_targets ON COMMIT DROP AS
SELECT h.id, p.code AS project_code, h.stage, h.status
FROM stage_histories h
JOIN projects p ON p.id = h.project_id
WHERE p.code IN (
    'XM-2026-0001', 'XM-2026-0002', 'XM-2026-0004',
    'XM-2026-0008', 'XM-2026-0013', 'XM-2026-0018'
  )
  AND h.status = 'current'
  AND h.entered_at IS NULL
  AND h.completed_at IS NULL
  AND h.interrupted_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM stage_histories h2
    WHERE h2.project_id = h.project_id
      AND (h2.entered_at IS NOT NULL OR h2.completed_at IS NOT NULL OR h2.interrupted_at IS NOT NULL)
  )
FOR UPDATE OF h, p;

CREATE TEMP TABLE repair_notification_targets ON COMMIT DROP AS
SELECT o.id, o.project_id, o.event_type, o.status, o.payload
FROM notification_outbox o
JOIN projects p ON p.id = o.project_id
LEFT JOIN notification_logs l ON l.outbox_id = o.id
WHERE p.code = 'XM-2026-0035'
  AND p.status = 'COMPLETED'
  AND o.event_type = 'PROJECT_RISKS_CHANGED'
  AND o.status = 'PENDING'
  AND l.id IS NULL
FOR UPDATE OF o, p;

DO $$
BEGIN
  IF (SELECT count(*) FROM repair_progress_targets) > 1 THEN
    RAISE EXCEPTION '自动修复范围异常：完成进度候选超过 1 条';
  END IF;
  IF (SELECT count(*) FROM repair_demand_targets) > 1 THEN
    RAISE EXCEPTION '自动修复范围异常：需求名称候选超过 1 条';
  END IF;
  IF (SELECT count(*) FROM repair_stage_targets) > 6 THEN
    RAISE EXCEPTION '自动修复范围异常：阶段占位候选超过 6 条';
  END IF;
  IF (SELECT count(*) FROM repair_notification_targets) > 4 THEN
    RAISE EXCEPTION '自动修复范围异常：旧风险通知候选超过 4 条';
  END IF;
END $$;

-- 1) 已完成项目的整体进度。
UPDATE projects p
SET overall_progress = 100,
    version = p.version + 1,
    updated_at = now()
FROM repair_progress_targets t
WHERE p.id = t.id
  AND p.version = t.version
  AND p.overall_progress < 100
  AND p.status = 'COMPLETED'
  AND p.simple_status = 'completed'
  AND p.acceptance_status = 'accepted'
  AND p.actual_completed_at IS NOT NULL;

INSERT INTO audit_logs (id, action, entity_type, entity_id, payload, created_at, updated_at)
SELECT 'auto-repair-20260919-progress-' || t.code,
       'production_auto_repair', 'project', t.id,
       jsonb_build_object(
         'batch', '20260919-auto-repair',
         'field', 'overall_progress',
         'before', t.overall_progress,
         'after', 100,
         'reason', '项目已验收完成，完成项目整体进度必须为100%'
       ), now(), now()
FROM repair_progress_targets t
ON CONFLICT (id) DO NOTHING;

-- 2) 项目名称是关联需求当前展示名称的来源；保留原始改名过程在审计日志中。
UPDATE demands d
SET name = t.project_name,
    version = d.version + 1,
    updated_at = now()
FROM repair_demand_targets t
WHERE d.id = t.demand_id
  AND d.version = t.demand_version
  AND d.name IS DISTINCT FROM t.project_name;

INSERT INTO audit_logs (id, action, entity_type, entity_id, payload, created_at, updated_at)
SELECT 'auto-repair-20260919-demand-name-' || t.demand_code,
       'production_auto_repair', 'demand', t.demand_id,
       jsonb_build_object(
         'batch', '20260919-auto-repair',
         'field', 'name',
         'before', t.demand_name,
         'after', t.project_name,
         'projectId', t.project_id,
         'projectCode', t.project_code,
         'reason', '关联项目名称已更新，需求当前名称按项目名称同步'
       ), now(), now()
FROM repair_demand_targets t
ON CONFLICT (id) DO NOTHING;

-- 3) 旧系统遗留的无时间证据 current 占位行。保留记录，只移出当前状态机。
UPDATE stage_histories h
SET status = 'legacy-placeholder',
    updated_at = now()
FROM repair_stage_targets t
WHERE h.id = t.id
  AND h.status = t.status
  AND h.status = 'current'
  AND h.entered_at IS NULL
  AND h.completed_at IS NULL
  AND h.interrupted_at IS NULL;

INSERT INTO audit_logs (id, action, entity_type, entity_id, payload, created_at, updated_at)
SELECT 'auto-repair-20260919-stage-' || t.id,
       'production_auto_repair', 'stage_history', t.id,
       jsonb_build_object(
         'batch', '20260919-auto-repair',
         'before', t.status,
         'after', 'legacy-placeholder',
         'projectCode', t.project_code,
         'stage', t.stage,
         'reason', '无开始、完成或中断时间，且已有有效阶段记录，属于旧占位行'
       ), now(), now()
FROM repair_stage_targets t
ON CONFLICT (id) DO NOTHING;

-- 4) 已完成项目的旧风险通知：按现有通知服务的终态语义记录为 SKIPPED。
INSERT INTO notification_logs (id, outbox_id, state, channel, safe_error, created_at, updated_at)
SELECT md5('auto-repair-20260919:notification:' || t.id),
       t.id, 'SKIPPED', 'work',
       '项目已完成，当前风险已清空，历史风险通知不再发送', now(), now()
FROM repair_notification_targets t
ON CONFLICT (outbox_id) DO NOTHING;

UPDATE notification_outbox o
SET status = 'FAILED',
    available_at = now(),
    updated_at = now()
FROM repair_notification_targets t
WHERE o.id = t.id
  AND o.status = 'PENDING'
  AND NOT EXISTS (SELECT 1 FROM notification_logs l WHERE l.outbox_id = o.id);

INSERT INTO audit_logs (id, action, entity_type, entity_id, payload, created_at, updated_at)
SELECT 'auto-repair-20260919-notification-' || t.id,
       'production_auto_repair', 'notification_outbox', t.id,
       jsonb_build_object(
         'batch', '20260919-auto-repair',
         'before', 'PENDING',
         'after', 'SKIPPED',
         'projectId', t.project_id,
         'eventType', t.event_type,
         'reason', '项目已完成，当前风险已清空，历史风险通知不再发送'
       ), now(), now()
FROM repair_notification_targets t
ON CONFLICT (id) DO NOTHING;

-- 更新后再次核对每个快照目标，任何并发改写或外部回执都让整个事务回滚。
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM repair_progress_targets t
    JOIN projects p ON p.id = t.id
    WHERE p.overall_progress < 100 OR p.version <> t.version + 1
  ) THEN
    RAISE EXCEPTION '自动修复并发校验失败：完成进度目标未按快照更新';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM repair_demand_targets t
    JOIN demands d ON d.id = t.demand_id
    WHERE d.name IS DISTINCT FROM t.project_name OR d.version <> t.demand_version + 1
  ) THEN
    RAISE EXCEPTION '自动修复并发校验失败：需求名称目标未按快照更新';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM repair_stage_targets t
    JOIN stage_histories h ON h.id = t.id
    WHERE h.status <> 'legacy-placeholder'
  ) THEN
    RAISE EXCEPTION '自动修复并发校验失败：阶段占位目标未按快照更新';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM repair_notification_targets t
    JOIN notification_outbox o ON o.id = t.id
    LEFT JOIN notification_logs l ON l.outbox_id = o.id
    WHERE o.status <> 'FAILED' OR l.id IS NULL OR l.state <> 'SKIPPED'
  ) THEN
    RAISE EXCEPTION '自动修复并发校验失败：通知目标存在外部回执或未完成修复';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM projects p
    WHERE p.code = 'XM-2026-0035'
      AND p.status = 'COMPLETED'
      AND p.simple_status = 'completed'
      AND p.acceptance_status = 'accepted'
      AND p.actual_completed_at IS NOT NULL
      AND p.overall_progress < 100
  ) THEN
    RAISE EXCEPTION '自动修复范围校验失败：仍有完成项目进度候选';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM projects p
    JOIN demands d ON d.id = p.demand_id
    WHERE p.code = 'XM-2026-0019'
      AND d.code = 'XQ-2026-0003'
      AND d.name IS DISTINCT FROM p.name
  ) THEN
    RAISE EXCEPTION '自动修复范围校验失败：仍有需求名称候选';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM stage_histories h
    JOIN projects p ON p.id = h.project_id
    WHERE p.code IN (
        'XM-2026-0001', 'XM-2026-0002', 'XM-2026-0004',
        'XM-2026-0008', 'XM-2026-0013', 'XM-2026-0018'
      )
      AND h.status = 'current'
      AND h.entered_at IS NULL
      AND h.completed_at IS NULL
      AND h.interrupted_at IS NULL
      AND EXISTS (
        SELECT 1
        FROM stage_histories h2
        WHERE h2.project_id = h.project_id
          AND (h2.entered_at IS NOT NULL OR h2.completed_at IS NOT NULL OR h2.interrupted_at IS NOT NULL)
      )
  ) THEN
    RAISE EXCEPTION '自动修复范围校验失败：仍有阶段占位候选';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM notification_outbox o
    JOIN projects p ON p.id = o.project_id
    LEFT JOIN notification_logs l ON l.outbox_id = o.id
    WHERE p.code = 'XM-2026-0035'
      AND p.status = 'COMPLETED'
      AND o.event_type = 'PROJECT_RISKS_CHANGED'
      AND o.status = 'PENDING'
      AND l.id IS NULL
  ) THEN
    RAISE EXCEPTION '自动修复范围校验失败：仍有未处理风险通知候选';
  END IF;
END $$;

SELECT 'progress_projects' AS repaired, count(*) AS count FROM repair_progress_targets
UNION ALL
SELECT 'demand_names', count(*) FROM repair_demand_targets
UNION ALL
SELECT 'stage_placeholders', count(*) FROM repair_stage_targets
UNION ALL
SELECT 'risk_notifications', count(*) FROM repair_notification_targets;

COMMIT;
