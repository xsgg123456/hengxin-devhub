import { describe, expect, it } from 'vitest'
import { createProject, updateProgress } from './workflow-service'
import { saveProjectPlan, needsPlan, remainingStages } from './stage-plan-service'
import { computeProjectRisks } from './risk-service'
import { now, projectInput, fresh, planFixture } from './workflow-fixtures'
import { isPrototypeSnapshot } from '@/repositories/prototype-validation'
import { migratePrototypeSnapshot } from '@/repositories/prototype-migration'
function setup() {
  const snapshot = fresh()
  snapshot.activeUserId = 'user-manager-chen'
  const project = createProject(snapshot, projectInput)
  return { snapshot, project }
}
describe('先排期后执行', () => {
  it('无日期立项可以保存，排期前不能执行，迁移不伪造旧时间', () => {
    const { snapshot, project } = setup()
    expect(project.expectedDeliveryDate).toBe('')
    expect(project.stagePlans).toEqual([])
    expect(isPrototypeSnapshot(snapshot)).toBe(true)
    expect(() =>
      updateProgress(snapshot, {
        projectId: project.id,
        kind: 'overall',
        summary: '',
        status: 'completed'
      })
    ).toThrow('完整制定')
    const histories = structuredClone(snapshot.database.stageHistories)
    const migrated = migratePrototypeSnapshot(snapshot)
    expect(migrated.database.stageHistories).toEqual(histories)
    expect(needsPlan(project)).toBe(true)
  })
  it('权限、全量及日期顺序失败无写入，同日交接可用', () => {
    const { snapshot, project } = setup()
    const plans = remainingStages(project).map((stage) => ({
      stage,
      startDate: '2026-09-10',
      endDate: '2026-09-10'
    }))
    snapshot.activeUserId = 'user-engineer-zhao'
    expect(() => saveProjectPlan(snapshot, { projectId: project.id, plans })).toThrow('主负责人')
    snapshot.activeUserId = project.primaryOwnerId
    const before = structuredClone(snapshot)
    expect(() =>
      saveProjectPlan(snapshot, { projectId: project.id, plans: plans.slice(1) })
    ).toThrow('完整填写')
    expect(() =>
      saveProjectPlan(snapshot, {
        projectId: project.id,
        plans: plans.map((p, i) => (i === 2 ? { ...p, startDate: '2026-09-09' } : p))
      })
    ).toThrow('前一环节')
    expect(snapshot).toEqual(before)
    saveProjectPlan(snapshot, { projectId: project.id, plans })
    expect(needsPlan(project)).toBe(false)
    expect(snapshot.database.lifecycleEvents.at(-1)).toMatchObject({
      action: 'plan',
      authorId: project.primaryOwnerId,
      reason: '首次排期',
      before: { stagePlans: '尚未排期' }
    })
    expect(snapshot.database.lifecycleEvents.at(-1)?.after.stagePlans).toContain(
      '验收交付 2026-09-10 → 2026-09-10'
    )
    expect(isPrototypeSnapshot(snapshot)).toBe(true)
  })
  it('改期留字段级旧新值、人员时间和最初计划，不能改已完成阶段', () => {
    const { snapshot, project } = setup()
    planFixture(snapshot, project)
    const original = project.expectedDeliveryDate
    const plans = project.stagePlans!.map((p) =>
      p.stage === '验收交付' ? { ...p, endDate: '2026-10-01' } : p
    )
    expect(() => saveProjectPlan(snapshot, { projectId: project.id, plans })).toThrow('调整原因')
    saveProjectPlan(snapshot, {
      projectId: project.id,
      plans,
      changeReason: '技术问题',
      changeDescription: '补充验证',
      now
    })
    expect(project.originalDeliveryDate).toBe(original)
    expect(snapshot.database.scheduleChanges.at(-1)).toMatchObject({
      field: 'stage:验收交付:endDate',
      oldValue: original,
      newValue: '2026-10-01',
      authorId: snapshot.activeUserId,
      createdAt: now
    })
    updateProgress(snapshot, {
      projectId: project.id,
      kind: 'overall',
      summary: '',
      status: 'completed',
      now
    })
    expect(() => saveProjectPlan(snapshot, { projectId: project.id, plans })).toThrow('完整填写')
    expect(isPrototypeSnapshot(snapshot)).toBe(true)
  })
  it('协作进展不动整体时间，越权整体字段拒绝；整体说明可空', () => {
    const { snapshot, project } = setup()
    planFixture(snapshot, project)
    snapshot.activeUserId = 'user-engineer-zhao'
    expect(() =>
      updateProgress(snapshot, { projectId: project.id, kind: 'overall', summary: '' })
    ).toThrow('主负责人')
    expect(() =>
      updateProgress(snapshot, {
        projectId: project.id,
        kind: 'personal',
        summary: '测试',
        overallProgress: 90
      })
    ).toThrow('整体字段')
    const last = project.lastOverallUpdatedAt
    updateProgress(snapshot, {
      projectId: project.id,
      kind: 'personal',
      summary: '个人进展',
      status: 'in-progress'
    })
    expect(project.lastOverallUpdatedAt).toBe(last)
    snapshot.activeUserId = project.primaryOwnerId
    updateProgress(snapshot, {
      projectId: project.id,
      kind: 'overall',
      summary: '',
      status: 'in-progress',
      now
    })
    expect(project.lastOverallUpdatedAt).toBe(now)
  })
  it('按计划推进五阶段，验收自动完成记录实际时间及作者，不归档', () => {
    const { snapshot, project } = setup()
    planFixture(snapshot, project)
    for (const stage of remainingStages(project)) {
      expect(project.stage).toBe(stage)
      updateProgress(snapshot, {
        projectId: project.id,
        kind: 'overall',
        summary: '',
        status: 'completed',
        now
      })
    }
    expect(project).toMatchObject({ status: 'completed', actualCompletedAt: now, archived: false })
    expect(
      snapshot.database.stageHistories.filter((h) => h.projectId === project.id && h.completedAt)
    ).toHaveLength(7)
    expect(snapshot.database.progressUpdates[0]).toMatchObject({
      authorId: snapshot.activeUserId,
      createdAt: now,
      summary: ''
    })
    expect(() =>
      updateProgress(snapshot, {
        projectId: project.id,
        kind: 'overall',
        summary: '',
        status: 'completed',
        now
      })
    ).toThrow('只读')
    expect(
      snapshot.database.lifecycleEvents.filter(
        (e) => e.entityId === project.id && e.action === 'complete'
      )
    ).toHaveLength(1)
  })
  it('阶段和交付风险按上海日期计算', () => {
    const { snapshot, project } = setup()
    planFixture(snapshot, project)
    project.stageExpectedDate = '2026-09-14'
    project.expectedDeliveryDate = '2026-10-01'
    expect(computeProjectRisks(project, [], '2026-09-11T09:00:00+08:00')).toContain(
      '环节临期：下一个工作日到期'
    )
    expect(computeProjectRisks(project, [], '2026-10-01T17:00:00Z')).toContain('项目延期 1 天')
  })
})
