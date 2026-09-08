import { describe, expect, it } from 'vitest'
import { createProject, updateProgress } from './workflow-service'
import { computeProjectRisks } from './risk-service'
import { now, projectInput, fresh } from './workflow-fixtures'
describe('进度、日期与风险', () => {
  it('协作个人更新不修改整体时间，越权整体字段被拒绝', () => {
    const snapshot = fresh()
    snapshot.activeUserId = 'user-manager-chen'
    const project = createProject(snapshot, { ...projectInput, now: '2026-09-03T09:00:00+08:00' })
    snapshot.activeUserId = 'user-engineer-zhao'
    expect(() =>
      updateProgress(snapshot, {
        projectId: project.id,
        kind: 'overall',
        summary: '越权',
        overallProgress: 90,
        now
      })
    ).toThrow('主负责人')
    expect(() =>
      updateProgress(snapshot, {
        projectId: project.id,
        kind: 'personal',
        summary: '越权',
        overallProgress: 90,
        now
      })
    ).toThrow('整体字段')
    updateProgress(snapshot, {
      projectId: project.id,
      kind: 'personal',
      summary: '个人进展',
      status: 'in-progress',
      now
    })
    expect(project.lastOverallUpdatedAt).toBe('2026-09-03T09:00:00+08:00')
    expect(project.risks.some((risk) => risk.includes('3 个工作日'))).toBe(true)
    snapshot.activeUserId = 'user-engineer-wang'
    updateProgress(snapshot, {
      projectId: project.id,
      kind: 'overall',
      overallProgress: 100,
      summary: '整体更新',
      status: 'in-progress',
      now
    })
    expect(project.status).toBe('active')
    expect(project.archived).toBe(false)
    expect(project.risks.some((risk) => risk.includes('未更新'))).toBe(false)
  })
  it('阶段只能完成后推进，需下一阶段日期，交付结束仍须显式完成', () => {
    const snapshot = fresh()
    snapshot.activeUserId = 'user-manager-chen'
    const project = createProject(snapshot, projectInput)
    expect(() =>
      updateProgress(snapshot, {
        projectId: project.id,
        kind: 'overall',
        overallProgress: 50,
        summary: '阶段完成',
        status: 'completed',
        now
      })
    ).toThrow('下一阶段')
    for (const stage of ['开发编码', '联调测试', '上线部署', '验收交付']) {
      updateProgress(snapshot, {
        projectId: project.id,
        kind: 'overall',
        overallProgress: 100,
        summary: '阶段完成',
        status: 'completed',
        nextStageExpectedDate: '2026-09-20',
        now
      })
      expect(project.stage).toBe(stage)
    }
    updateProgress(snapshot, {
      projectId: project.id,
      kind: 'overall',
      overallProgress: 100,
      summary: '交付完成',
      status: 'completed',
      now
    })
    expect(project.status).toBe('active')
    expect(
      snapshot.database.stageHistories.filter(
        (row) => row.projectId === project.id && row.completedAt
      )
    ).toHaveLength(7)
  })
  it('日期变化必须有原因历史，原上线及交付承诺永久不变', () => {
    const snapshot = fresh()
    snapshot.activeUserId = 'user-manager-chen'
    const project = createProject(snapshot, projectInput)
    const input = {
      projectId: project.id,
      kind: 'overall' as const,
      overallProgress: 20,
      summary: '调整计划',
      expectedDeliveryDate: '2026-11-01',
      now
    }
    expect(() => updateProgress(snapshot, input)).toThrow('调整原因')
    updateProgress(snapshot, {
      ...input,
      changeReason: '技术问题',
      changeDescription: '接口需要改造'
    })
    expect(project.originalDeliveryDate).toBe('2026-10-01')
    expect(project.expectedLaunchDate).toBe('2026-09-20')
    expect(snapshot.database.scheduleChanges[0]).toMatchObject({
      oldValue: '2026-10-01',
      newValue: '2026-11-01',
      authorId: snapshot.activeUserId
    })
    expect(project.risks.some((risk) => risk.includes('计划有变'))).toBe(true)
  })
  it('风险以交付日计算，周五的下一工作日为周一，日期按上海时区', () => {
    const snapshot = fresh()
    snapshot.activeUserId = 'user-manager-chen'
    const project = createProject(snapshot, {
      ...projectInput,
      expectedLaunchDate: '2026-09-01',
      stageExpectedDate: '2026-09-14'
    })
    expect(computeProjectRisks(project, [], '2026-09-11T09:00:00+08:00')).toContain(
      '环节临期：下一个工作日到期'
    )
    expect(
      computeProjectRisks(project, [], '2026-09-11T09:00:00+08:00').some((risk) =>
        risk.startsWith('项目延期')
      )
    ).toBe(false)
    expect(computeProjectRisks(project, [], '2026-10-01T17:00:00Z')).toContain('项目延期 1 天')
  })
})
