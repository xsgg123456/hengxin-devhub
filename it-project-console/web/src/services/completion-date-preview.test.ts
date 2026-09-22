import { describe, expect, it } from 'vitest'
import { createInitialPrototypeSnapshot } from '@/mocks/seed'
import { saveCompletionDatesPreview } from './completion-date-preview'
import { isPrototypeSnapshot } from '@/repositories/prototype-validation'

describe('节点实际完成日期本地预览', () => {
  it('指定管理员可修改已走过节点并保留其他项目事实', () => {
    const snapshot = createInitialPrototypeSnapshot()
    const project = snapshot.database.projects[0]
    const beforeStatus = project.status
    const beforeStage = project.stage
    saveCompletionDatesPreview(snapshot, {
      projectId: project.id,
      version: project.version ?? 1,
      dates: [
        { stage: '需求受理', completedOn: '2026-07-20' },
        { stage: '方案设计', completedOn: '2026-07-22' }
      ],
      reason: '按历史资料补录节点日期'
    })
    expect(project.status).toBe(beforeStatus)
    expect(project.stage).toBe(beforeStage)
    expect(project.version).toBe(2)
    expect(snapshot.database.completionDateChanges).toEqual(expect.arrayContaining([
      expect.objectContaining({ projectId: project.id, stage: '需求受理', newValue: '2026-07-20' }),
      expect.objectContaining({ projectId: project.id, stage: '方案设计', newValue: '2026-07-22' })
    ]))
    expect(isPrototypeSnapshot(snapshot)).toBe(true)
  })

  it('非指定身份、当前节点、未来日期和倒序日期均拒绝且不写入', () => {
    const snapshot = createInitialPrototypeSnapshot()
    const project = snapshot.database.projects[0]
    snapshot.activeUserId = 'user-business-li'
    expect(() => saveCompletionDatesPreview(snapshot, {
      projectId: project.id, version: project.version ?? 1,
      dates: [{ stage: '需求受理', completedOn: '2026-07-20' }], reason: '越权测试'
    })).toThrow('指定管理人员')
    snapshot.activeUserId = 'user-manager-chen'
    const version = project.version ?? 1
    const before = structuredClone(snapshot.database)
    expect(() => saveCompletionDatesPreview(snapshot, {
      projectId: project.id, version,
      dates: [{ stage: '开发编码', completedOn: '2026-07-20' }], reason: '当前节点测试'
    })).toThrow('尚未按流程完成')
    expect(() => saveCompletionDatesPreview(snapshot, {
      projectId: project.id, version,
      dates: [{ stage: '需求受理', completedOn: '2099-01-01' }], reason: '未来日期测试'
    })).toThrow('不能晚于今天')
    expect(() => saveCompletionDatesPreview(snapshot, {
      projectId: project.id, version,
      dates: [
        { stage: '需求受理', completedOn: '2026-08-10' },
        { stage: '方案设计', completedOn: '2026-08-01' }
      ], reason: '顺序测试'
    })).toThrow('不能早于')
    expect(snapshot.database).toMatchObject(before)
  })

  it('已有进入记录但尚未完成的历史节点不能被直接补成完成', () => {
    const snapshot = createInitialPrototypeSnapshot()
    const project = snapshot.database.projects[0]
    project.stage = '开发编码'
    snapshot.database.stageHistories.push({
      projectId: project.id,
      stage: '方案设计',
      startedAt: '2026-07-10T00:00:00.000Z',
      completedAt: null
    })
    expect(() => saveCompletionDatesPreview(snapshot, {
      projectId: project.id,
      version: project.version ?? 1,
      dates: [{ stage: '方案设计', completedOn: '2026-07-20' }],
      reason: '不应补录未完成节点'
    })).toThrow('尚未按流程完成')
  })

  it('重复进入阶段只改最新有效记录，第七节点同步已完成项目日期', () => {
    const snapshot = createInitialPrototypeSnapshot()
    const project = snapshot.database.projects[0]
    project.stage = '联调测试'
    const old = { projectId: project.id, stage: '开发编码' as const, startedAt: '2026-07-01T00:00:00.000Z', completedAt: '2026-07-05T00:00:00.000Z' }
    const latest = { projectId: project.id, stage: '开发编码' as const, startedAt: '2026-07-10T00:00:00.000Z', completedAt: '2026-07-11T00:00:00.000Z' }
    snapshot.database.stageHistories.push(old, latest)
    saveCompletionDatesPreview(snapshot, {
      projectId: project.id, version: project.version ?? 1,
      dates: [{ stage: '开发编码', completedOn: '2026-07-15' }], reason: '修订最新阶段记录'
    })
    expect(old.completedAt).toBe('2026-07-05T00:00:00.000Z')
    expect(latest.completedAt).toBe('2026-07-15T00:00:00.000Z')

    const completed = snapshot.database.projects[1]
    completed.status = 'completed'
    completed.stage = '验收交付'
    completed.simpleStatus = 'completed'
    completed.actualCompletedAt = '2026-08-01T00:00:00.000Z'
    completed.version = 1
    snapshot.database.stageHistories.push({ projectId: completed.id, stage: '验收交付', startedAt: '', completedAt: '2026-08-01T00:00:00.000Z' })
    saveCompletionDatesPreview(snapshot, {
      projectId: completed.id, version: 1,
      dates: [{ stage: '验收交付', completedOn: '2026-08-05' }], reason: '修订项目实际完成日'
    })
    expect(completed.actualCompletedAt).toBe('2026-08-05T00:00:00.000Z')
    expect(completed.status).toBe('completed')
  })
})
