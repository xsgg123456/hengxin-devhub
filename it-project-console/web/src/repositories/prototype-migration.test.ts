import { migratePrototypeSnapshot } from './prototype-migration'
import { describe, expect, it } from 'vitest'
import { createInitialPrototypeSnapshot } from '@/mocks/seed'
import {
  PrototypeDataError,
  PrototypeRepository,
  PROTOTYPE_STORAGE_KEY
} from './prototype-repository'
function storageFor(value: unknown) {
  let raw = JSON.stringify(value)
  return {
    getItem: (_key: string) => raw,
    setItem: (_key: string, next: string) => {
      raw = next
    }
  }
}
describe('Phase 2 持久化迁移', () => {
  it('旧schema2补齐审计数组，持久化名单不会被固定演示角色覆盖', () => {
    const snapshot = createInitialPrototypeSnapshot()
    snapshot.database.users[0].role = 'engineer'
    snapshot.database.users[0].roleLabel = 'IT工程师'
    snapshot.database.users[1].role = 'manager'
    snapshot.database.users[1].roleLabel = '管理人员'
    const old: Record<string, unknown> = { ...snapshot.database }
    delete old.lifecycleEvents
    const storage = storageFor({ ...snapshot, database: old })
    const repo = new PrototypeRepository(storage)
    expect(repo.load().database.lifecycleEvents).toEqual([])
    expect(repo.load().database.users[0].role).toBe('engineer')
    expect(repo.load().database.users[1].role).toBe('manager')
  })
  it('v1迁移保留ID、状态、历史、身份和revision，补齐分离的日期而不重置', () => {
    const initial = createInitialPrototypeSnapshot()
    const legacy = JSON.parse(JSON.stringify(initial))
    legacy.schemaVersion = 1
    legacy.database.schemaVersion = 1
    legacy.revision = 19
    legacy.activeUserId = 'user-engineer-zhao'
    legacy.database.demands[0].name = '用户已经编辑的需求'
    legacy.database.demands[0].status = 'returned'
    for (const project of legacy.database.projects) {
      delete project.expectedDeliveryDate
      delete project.originalDeliveryDate
      delete project.overallProgress
      delete project.lastOverallUpdatedAt
    }
    delete legacy.database.stageHistories
    delete legacy.database.scheduleChanges
    const storage = storageFor(legacy)
    const result = new PrototypeRepository(storage).load()
    expect(result.schemaVersion).toBe(2)
    expect(result.revision).toBe(19)
    expect(result.activeUserId).toBe('user-engineer-zhao')
    expect(result.database.demands[0]).toMatchObject({
      name: '用户已经编辑的需求',
      status: 'returned'
    })
    expect(result.database.projects[0].expectedDeliveryDate).toBe(
      legacy.database.projects[0].expectedLaunchDate
    )
    expect(result.database.progressUpdates).toHaveLength(initial.database.progressUpdates.length)
    expect(JSON.parse(storage.getItem(PROTOTYPE_STORAGE_KEY)).schemaVersion).toBe(2)
  })
  it('无效记录停止加载而不静默重置或覆盖原数据', () => {
    const snapshot = createInitialPrototypeSnapshot()
    const broken = JSON.parse(JSON.stringify(snapshot))
    broken.database.projects[0].stage = '未知阶段'
    const storage = storageFor(broken)
    const original = storage.getItem(PROTOTYPE_STORAGE_KEY)
    expect(() => new PrototypeRepository(storage).load()).toThrow(PrototypeDataError)
    expect(storage.getItem(PROTOTYPE_STORAGE_KEY)).toBe(original)
  })
  it('存储写入失败时不返回伪成功，之前的业务数据保留', () => {
    const initial = createInitialPrototypeSnapshot()
    const raw = JSON.stringify(initial)
    const storage = {
      getItem: () => raw,
      setItem: () => {
        throw new Error('quota exceeded')
      }
    }
    const repo = new PrototypeRepository(storage)
    expect(() =>
      repo.transact((snapshot) => {
        snapshot.database.demands[0].name = '未保存'
      })
    ).toThrow('quota exceeded')
    expect(repo.load().database.demands[0].name).toBe(initial.database.demands[0].name)
  })
})

it('完成迁移优先验收证据、事件兜底，重开排除旧完成且不伪造更新时间', () => {
  const snapshot = createInitialPrototypeSnapshot()
  const p = snapshot.database.projects[0]
  p.stage = '验收交付'; p.simpleStatus = 'completed'; p.actualCompletedAt = null
  const event = { id: 'complete-test', entityType: 'project' as const, entityId: p.id, action: 'complete' as const, authorId: snapshot.activeUserId, createdAt: '2026-09-10T00:00:00Z', reason: '', before: {}, after: {} }
  snapshot.database.lifecycleEvents.push(event)
  snapshot.database.stageHistories.push({ projectId: p.id, stage: '验收交付', startedAt: '', completedAt: '2026-09-09T00:00:00Z' })
  const migrated = migratePrototypeSnapshot(snapshot)
  expect(migrated.database.projects[0]).toMatchObject({ status: 'completed', actualCompletedAt: '2026-09-09T00:00:00Z', archived: false })
  snapshot.database.stageHistories = snapshot.database.stageHistories.filter(h => h.stage !== '验收交付')
  expect(migratePrototypeSnapshot(snapshot).database.projects[0].actualCompletedAt).toBe(event.createdAt)
  snapshot.database.lifecycleEvents.push({ ...event, id: 'reopen-test', action: 'reopen', createdAt: '2026-09-11T00:00:00Z' })
  expect(migratePrototypeSnapshot(snapshot).database.projects[0].actualCompletedAt).toBeNull()
  p.status = 'completed'
  expect(migratePrototypeSnapshot(snapshot).database.projects[0].actualCompletedAt).toBeNull()
})
