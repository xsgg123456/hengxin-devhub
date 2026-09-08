import { PROJECT_STAGES, type PrototypeSnapshot } from '@/domain/prototype'
import { DEMO_USERS } from '@/mocks/auth-context'

type Row = Record<string, unknown>
const record = (v: unknown): v is Row => Boolean(v) && typeof v === 'object' && !Array.isArray(v)
const strings = (row: Row, keys: string[]) => keys.every((key) => typeof row[key] === 'string')
const list = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'string')
const timestamp = (v: unknown) => typeof v === 'string' && Number.isFinite(Date.parse(v))
const date = (v: unknown) =>
  typeof v === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  timestamp(v) &&
  new Date(v).toISOString().slice(0, 10) === v
const percent = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100
const status = (v: unknown) =>
  ['not-started', 'in-progress', 'nearly-done', 'completed', 'blocked'].includes(String(v))
const stage = (v: unknown) => PROJECT_STAGES.some((s) => s === v)
function rows(value: unknown, id = true): value is Row[] {
  return (
    Array.isArray(value) &&
    value.every((v) => record(v) && (!id || typeof v.id === 'string')) &&
    (!id || new Set(value.map((v) => v.id)).size === value.length)
  )
}
function attachment(v: unknown): boolean {
  if (v === null) return true
  if (
    !record(v) ||
    !strings(v, ['name', 'status']) ||
    !['ready', 'uploading', 'failed'].includes(String(v.status))
  )
    return false
  if (v.kind === 'file')
    return (
      typeof v.size === 'number' &&
      v.size > 0 &&
      (v.mime === undefined || typeof v.mime === 'string')
    )
  if (v.kind !== 'link' || typeof v.url !== 'string') return false
  try {
    const url = new URL(v.url)
    return url.protocol === 'https:' && !url.username && !url.password
  } catch {
    return false
  }
}

// Validate after migration, before any page can consume corrupted nested values.
export function isPrototypeSnapshot(value: unknown): value is PrototypeSnapshot {
  if (!record(value) || !record(value.database)) return false
  const db = value.database
  if (
    value.schemaVersion !== 2 ||
    db.schemaVersion !== 2 ||
    !Number.isInteger(value.revision) ||
    Number(value.revision) < 0 ||
    !timestamp(value.updatedAt)
  )
    return false
  if (
    !['normal', 'empty', 'loading', 'network-error', 'save-error', 'forbidden'].includes(
      String(value.scenario)
    )
  )
    return false
  if (
    !rows(db.users) ||
    db.users.length !== DEMO_USERS.length ||
    !db.users.every(
      (u) =>
        strings(u, ['name', 'department']) &&
        DEMO_USERS.some((d) => d.id === u.id) &&
        ['manager', 'engineer', 'business'].includes(String(u.role))
    )
  )
    return false
  const userIds = new Set(db.users.map((u) => u.id))
  if (!userIds.has(value.activeUserId) || !db.users.some((u) => u.role === 'manager')) return false
  if (
    !rows(db.demands) ||
    !rows(db.projects) ||
    !rows(db.progressUpdates) ||
    !rows(db.scheduleChanges) ||
    !rows(db.stageHistories, false) ||
    !rows(db.lifecycleEvents)
  )
    return false
  const projectIds = new Set(db.projects.map((p) => p.id)),
    demandIds = new Set(db.demands.map((d) => d.id))
  if (
    !db.demands.every(
      (d) =>
        strings(d, [
          'requestId',
          'name',
          'description',
          'department',
          'reviewReason',
          'expectedLaunchDate',
          'submittedAt'
        ]) &&
        ['draft', 'pending', 'returned', 'rejected', 'established', 'withdrawn'].includes(
          String(d.status)
        ) &&
        userIds.has(d.submitterId) &&
        (d.expectedLaunchDate === '' || date(d.expectedLaunchDate)) &&
        (d.submittedAt === '' || timestamp(d.submittedAt)) &&
        attachment(d.prd) &&
        attachment(d.prototype)
    )
  )
    return false
  if (
    !db.projects.every(
      (p) =>
        strings(p, ['requestId', 'name', 'department', 'blocker']) &&
        userIds.has(p.primaryOwnerId) &&
        list(p.collaboratorIds) &&
        p.collaboratorIds.every((id) => userIds.has(id) && id !== p.primaryOwnerId) &&
        new Set(p.collaboratorIds).size === p.collaboratorIds.length &&
        list(p.risks) &&
        stage(p.stage) &&
        status(p.simpleStatus) &&
        percent(p.overallProgress) &&
        ['active', 'completed', 'cancelled'].includes(String(p.status)) &&
        typeof p.archived === 'boolean' &&
        ['P0', 'P1', 'P2'].includes(String(p.priority)) &&
        ['direct', 'demand'].includes(String(p.source)) &&
        (p.demandId === null || demandIds.has(p.demandId)) &&
        [
          'stageExpectedDate',
          'originalLaunchDate',
          'expectedLaunchDate',
          'originalDeliveryDate',
          'expectedDeliveryDate'
        ].every((f) => date(p[f])) &&
        ['createdAt', 'updatedAt', 'lastOverallUpdatedAt'].every((f) => timestamp(p[f]))
    )
  )
    return false
  if (
    !db.progressUpdates.every(
      (u) =>
        projectIds.has(u.projectId) &&
        userIds.has(u.authorId) &&
        ['overall', 'personal'].includes(String(u.kind)) &&
        stage(u.stage) &&
        status(u.status) &&
        strings(u, ['summary', 'blocker']) &&
        timestamp(u.createdAt) &&
        (u.overallProgress === undefined || percent(u.overallProgress))
    )
  )
    return false
  if (
    !db.stageHistories.every(
      (h) =>
        projectIds.has(h.projectId) &&
        stage(h.stage) &&
        (h.startedAt === '' || timestamp(h.startedAt)) &&
        (h.completedAt === null || h.completedAt === '' || timestamp(h.completedAt)) &&
        (h.interruptedAt === undefined || timestamp(h.interruptedAt))
    )
  )
    return false
  if (
    !db.scheduleChanges.every(
      (c) =>
        projectIds.has(c.projectId) &&
        userIds.has(c.authorId) &&
        ['stageExpectedDate', 'expectedLaunchDate', 'expectedDeliveryDate'].includes(
          String(c.field)
        ) &&
        date(c.oldValue) &&
        date(c.newValue) &&
        strings(c, ['reason', 'description']) &&
        timestamp(c.createdAt)
    )
  )
    return false
  return db.lifecycleEvents.every(
    (e) =>
      ['project', 'demand', 'user'].includes(String(e.entityType)) &&
      strings(e, ['entityId', 'reason']) &&
      [
        'complete',
        'cancel',
        'archive',
        'reopen',
        'delete',
        'withdraw',
        'correct',
        'grant',
        'revoke'
      ].includes(String(e.action)) &&
      userIds.has(e.authorId) &&
      timestamp(e.createdAt) &&
      record(e.before) &&
      record(e.after) &&
      [...Object.values(e.before), ...Object.values(e.after)].every((v) =>
        ['string', 'number', 'boolean'].includes(typeof v)
      )
  )
}
