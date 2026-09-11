import { describe, expect, it } from 'vitest'
import { createInitialPrototypeSnapshot } from '@/mocks/seed'
import { migratePrototypeSnapshot } from '@/repositories/prototype-migration'
import { backfillProjectCodes, nextProjectCode, projectCode } from './project-code'
import { isEngineerEligible } from './engineer-eligibility'
import { PrototypeRepository } from '@/repositories/prototype-repository'
import { actionProject } from '@/services/lifecycle-service'

describe('原型项目编号', () => {
  it('删除和重新加载快照仍保留已分配高水位', () => {
    const storage = new Map<string, string>()
    const repository = new PrototypeRepository({
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => {
        storage.set(key, value)
      }
    })
    repository.load()
    repository.transact((snapshot) => {
      for (const project of [...snapshot.database.projects]) {
        actionProject(snapshot, { projectId: project.id, action: 'delete' })
      }
    })
    const loaded = repository.load()
    expect(nextProjectCode(loaded.database, '2026-09-11T00:00:00Z')).toBe('XM-2026-0004')
  })
  it('按创建时间和id稳定回填，重复迁移保留编号', () => {
    const snapshot = createInitialPrototypeSnapshot()
    for (const p of snapshot.database.projects) delete p.code
    delete snapshot.database.projectCodeCounters
    snapshot.database.projects.reverse()
    const migrated = migratePrototypeSnapshot(snapshot)
    const ordered = [...migrated.database.projects].sort(
      (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)
    )
    expect(ordered.map(projectCode)).toEqual(['XM-2026-0001', 'XM-2026-0002', 'XM-2026-0003'])
    expect(migratePrototypeSnapshot(migrated)).toEqual(migrated)
  })
  it('删除后持久高水位不回退，上海跨年和超四位可分配', () => {
    const db = createInitialPrototypeSnapshot().database
    db.projects = []
    backfillProjectCodes(db)
    expect(nextProjectCode(db, '2026-12-31T15:59:59Z')).toBe('XM-2026-0004')
    expect(nextProjectCode(db, '2026-12-31T16:00:00Z')).toBe('XM-2027-0001')
    db.projectCodeCounters!['2027'] = 9999
    expect(nextProjectCode(db, '2027-01-01T00:00:00Z')).toBe('XM-2027-10000')
    expect(projectCode({ id: 'legacy' })).toBe('legacy')
  })
  it('服务端资格明确优先，存量原型兼容部门，迁移保留例外', () => {
    const snapshot = createInitialPrototypeSnapshot()
    const user = snapshot.database.users[0]
    user.department = '业务部门'
    user.engineerEligible = true
    expect(isEngineerEligible(user)).toBe(true)
    expect(migratePrototypeSnapshot(snapshot).database.users[0].engineerEligible).toBe(true)
    user.department = '信息技术部'
    user.engineerEligible = false
    expect(isEngineerEligible(user)).toBe(false)
    delete user.engineerEligible
    expect(isEngineerEligible(user)).toBe(true)
  })
})
