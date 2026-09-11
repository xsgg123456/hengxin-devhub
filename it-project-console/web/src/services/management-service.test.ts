import { describe, expect, it } from 'vitest'
import { correctProject, setManager } from './management-service'
import { createProject } from './project-service'
import { actionProject } from './lifecycle-service'
import { fresh, projectInput, now } from './workflow-fixtures'
import { migratePrototypeSnapshot } from '@/repositories/prototype-migration'

describe('管理人员名单', () => {
  it('保护最后管理员，授权覆盖部门，移除恢复部门默认角色且刷新保留', () => {
    let snapshot = fresh()
    snapshot.activeUserId = 'user-manager-chen'
    const before = structuredClone(snapshot)
    expect(() => setManager(snapshot, { userId: snapshot.activeUserId, enabled: false })).toThrow(
      '最后'
    )
    expect(snapshot).toEqual(before)
    setManager(snapshot, { userId: 'user-business-li', enabled: true, now })
    setManager(snapshot, { userId: 'user-manager-chen', enabled: false, now })
    snapshot = migratePrototypeSnapshot(snapshot)
    expect(snapshot.database.users.find((row) => row.id === 'user-manager-chen')?.role).toBe(
      'engineer'
    )
    expect(snapshot.database.users.find((row) => row.id === 'user-business-li')?.role).toBe(
      'manager'
    )
    snapshot.activeUserId = 'user-business-li'
    setManager(snapshot, { userId: 'user-engineer-wang', enabled: true })
    setManager(snapshot, { userId: 'user-business-li', enabled: false })
    expect(snapshot.database.users.find((row) => row.id === 'user-business-li')?.role).toBe(
      'business'
    )
    expect(snapshot.database.lifecycleEvents[0].authorId).toBe('user-business-li')
  })
  it('只能由管理员维护已有组织用户；IT管理员也能作为项目成员', () => {
    const snapshot = fresh()
    expect(() => setManager(snapshot, { userId: 'user-engineer-wang', enabled: true })).toThrow(
      '管理人员'
    )
    snapshot.activeUserId = 'user-manager-chen'
    expect(() => setManager(snapshot, { userId: '不存在', enabled: true })).toThrow('已有组织')
    const project = createProject(snapshot, {
      ...projectInput,
      primaryOwnerId: 'user-manager-chen'
    })
    expect(project.primaryOwnerId).toBe('user-manager-chen')
  })
})
describe('管理纠正', () => {
  it('须理由、权限及固定阶段，失败不留部分日期或历史', () => {
    const snapshot = fresh()
    const project = snapshot.database.projects[0]
    const input = {
      projectId: project.id,
      stage: project.stage,
      reason: '修正误填',
      now
    }
    expect(() => correctProject(snapshot, input)).toThrow('管理人员')
    snapshot.activeUserId = 'user-manager-chen'
    const before = structuredClone(snapshot)
    expect(() => correctProject(snapshot, { ...input, reason: ' ' })).toThrow('纠正原因')
    expect(() => correctProject(snapshot, { ...input, stage: '验收交付' })).toThrow('跳过')
    expect(() => correctProject(snapshot, { ...input, stage: '联调测试' })).toThrow('完成当前')
    expect(() => correctProject(snapshot, { ...input, expectedLaunchDate: '2026-11-01' })).toThrow(
      '独立计划入口'
    )
    expect(snapshot).toEqual(before)
  })
  it('回退保留原历史与日期，记录人员时间且后续可管理删除', () => {
    const snapshot = fresh()
    snapshot.activeUserId = 'user-manager-chen'
    const project = snapshot.database.projects[0]
    snapshot.database.stageHistories.find(h => h.projectId === project.id && h.stage === '方案设计')!.startedAt = '2026-08-01T00:00:00Z'
    const oldHistoryLength = snapshot.database.stageHistories.length
    const original = project.originalLaunchDate
    correctProject(snapshot, {
      projectId: project.id,
      stage: '方案设计',
      reason: '阶段填错',
      now
    })
    expect(project.stage).toBe('方案设计')
    expect(project.originalLaunchDate).toBe(original)
    expect(snapshot.database.stageHistories.length).toBe(oldHistoryLength + 1)
    expect(snapshot.database.scheduleChanges).toHaveLength(0)
    expect(snapshot.database.lifecycleEvents[0]).toMatchObject({
      action: 'correct',
      reason: '阶段填错',
      before: { stage: '开发编码' },
      after: { stage: '方案设计' }
    })
    actionProject(snapshot, { projectId: project.id, action: 'archive' })
    expect(() =>
      correctProject(snapshot, {
        projectId: project.id,
        stage: '方案设计',
          reason: '纠正'
      })
    ).toThrow('重新打开')
    actionProject(snapshot, { projectId: project.id, action: 'delete' })
    expect(snapshot.database.projects.some((row) => row.id === project.id)).toBe(false)
    expect(snapshot.database.progressUpdates.some((row) => row.projectId === project.id)).toBe(
      false
    )
    expect(snapshot.database.scheduleChanges.some((row) => row.projectId === project.id)).toBe(
      false
    )
    expect(
      snapshot.database.lifecycleEvents.some(
        (row) => row.entityId === project.id && row.action === 'correct'
      )
    ).toBe(true)
    expect(snapshot.database.lifecycleEvents[0]).toMatchObject({
      action: 'delete',
      authorId: snapshot.activeUserId
    })
  })
  it.each(['save-error', 'forbidden'] as const)('场景%s授权与纠正均无写入', (scenario) => {
    const snapshot = fresh()
    snapshot.activeUserId = 'user-manager-chen'
    snapshot.scenario = scenario
    const before = structuredClone(snapshot)
    expect(() => setManager(snapshot, { userId: 'user-business-li', enabled: true })).toThrow()
    expect(() =>
      correctProject(snapshot, {
        projectId: snapshot.database.projects[0].id,
        stage: '方案设计',
          reason: '纠正'
      })
    ).toThrow()
    expect(snapshot).toEqual(before)
  })
})

it('纠正拒绝系统阶段和空占位历史，真实完成但进入未知的环节可回退', () => {
  const snapshot = fresh()
  snapshot.activeUserId = 'user-manager-chen'
  const p = snapshot.database.projects[0]
  const command = { projectId: p.id, stage: '方案设计' as const, reason: '修复误操作', now }
  expect(() => correctProject(snapshot, { ...command, stage: '需求受理' })).toThrow('固定阶段')
  expect(() => correctProject(snapshot, command)).toThrow('已走过')
  snapshot.database.stageHistories.find(h => h.projectId === p.id && h.stage === '方案设计')!.completedAt = '2026-09-01T00:00:00Z'
  correctProject(snapshot, command)
  expect(p.stage).toBe('方案设计')
})
