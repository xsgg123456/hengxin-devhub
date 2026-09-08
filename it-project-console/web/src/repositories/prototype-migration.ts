import { PROJECT_STAGES, type PrototypeSnapshot } from '@/domain/prototype'
import { DEMO_USERS } from '@/mocks/auth-context'
export function migratePrototypeSnapshot(value: unknown): PrototypeSnapshot {
  if (!value || typeof value !== 'object') throw new Error('快照格式无效')
  const candidate = value as Record<string, unknown>
  if (![1, 2].includes(Number(candidate.schemaVersion))) throw new Error('快照版本不支持')
  if (!candidate.database || typeof candidate.database !== 'object') throw new Error('数据库缺失')
  const database = candidate.database as Record<string, unknown>
  if (![1, 2].includes(Number(database.schemaVersion))) throw new Error('数据库版本不支持')
  for (const field of ['users', 'demands', 'projects', 'progressUpdates']) {
    if (
      !Array.isArray(database[field]) ||
      !(database[field] as unknown[]).every(
        (row) =>
          row && typeof row === 'object' && typeof (row as Record<string, unknown>).id === 'string'
      )
    )
      throw new Error('记录格式无效')
  }
  const snapshot = structuredClone(value) as PrototypeSnapshot
  // The storage key stays v1 so existing demonstrations are upgraded in place.
  const legacy = candidate.schemaVersion === 1
  snapshot.schemaVersion = 2
  snapshot.database.schemaVersion = 2
  snapshot.database.users = snapshot.database.users.map((user) => {
    const known = DEMO_USERS.find((row) => row.id === user.id)
    if (legacy && known) return structuredClone(known)
    // Early schema 2 snapshots still had project-persona display fields.
    // Normalize the obsolete shape without resetting persisted manager grants.
    return {
      id: user.id,
      name: user.name,
      department: user.department,
      role: user.role,
      roleLabel:
        user.role === 'manager' ? '管理人员' : user.role === 'engineer' ? 'IT工程师' : '业务人员'
    }
  })
  snapshot.database.lifecycleEvents ??= []
  if (legacy) {
    snapshot.database.stageHistories ??= []
    snapshot.database.scheduleChanges ??= []
    for (const demand of snapshot.database.demands) {
      demand.requestId ??= demand.id
      demand.description ??= ''
      demand.prd ??= null
      demand.prototype ??= null
      demand.reviewReason ??= ''
    }
    for (const project of snapshot.database.projects) {
      project.requestId ??= project.id
      project.source ??= project.demandId ? 'demand' : 'direct'
      project.priority ??= 'P1'
      project.overallProgress ??= 0
      project.stageExpectedDate ??= project.expectedLaunchDate
      project.originalDeliveryDate ??= project.originalLaunchDate
      project.expectedDeliveryDate ??= project.expectedLaunchDate
      project.createdAt ??= project.updatedAt
      project.lastOverallUpdatedAt ??= project.updatedAt
      project.blocker ??= ''
      if (!snapshot.database.stageHistories.some((row) => row.projectId === project.id)) {
        for (const stage of PROJECT_STAGES.slice(0, PROJECT_STAGES.indexOf(project.stage) + 1)) {
          // Legacy snapshots contain no actual stage timestamps: retain unknown times as empty.
          snapshot.database.stageHistories.push({
            projectId: project.id,
            stage,
            startedAt: '',
            completedAt: stage === project.stage ? null : ''
          })
        }
      }
    }
    for (const update of snapshot.database.progressUpdates) {
      update.kind ??= 'overall'
      update.blocker ??= ''
    }
  }
  if (
    !Array.isArray(snapshot.database.stageHistories) ||
    !Array.isArray(snapshot.database.scheduleChanges) ||
    !Array.isArray(snapshot.database.lifecycleEvents)
  )
    throw new Error('历史记录无效')
  for (const demand of snapshot.database.demands) {
    if (
      !['draft', 'pending', 'returned', 'rejected', 'established', 'withdrawn'].includes(
        demand.status
      ) ||
      typeof demand.name !== 'string' ||
      typeof demand.description !== 'string'
    )
      throw new Error('需求记录无效')
  }
  for (const project of snapshot.database.projects) {
    if (
      !PROJECT_STAGES.includes(project.stage) ||
      !Number.isFinite(project.overallProgress) ||
      !Array.isArray(project.collaboratorIds) ||
      typeof project.expectedDeliveryDate !== 'string'
    )
      throw new Error('项目记录无效')
  }
  return snapshot
}
