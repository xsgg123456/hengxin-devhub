import { describe, expect, it } from 'vitest'
import { actionDemand, actionProject } from './lifecycle-service'
import { createProject, reviewDemand, saveDemand, updateProgress } from './workflow-service'
import { fresh, demandInput, projectInput, now } from './workflow-fixtures'
import { PROJECT_STAGES } from '@/domain/prototype'

function projectFixture() {
  const snapshot = fresh()
  snapshot.activeUserId = 'user-manager-chen'
  const project = createProject(snapshot, projectInput)
  return { snapshot, project }
}
describe('需求生命周期', () => {
  it('本人撤回后保留材料并可重提，同步记录操作者和时间', () => {
    const snapshot = fresh()
    const demand = saveDemand(snapshot, demandInput)
    actionDemand(snapshot, { demandId: demand.id, action: 'withdraw', now })
    expect(demand.status).toBe('withdrawn')
    expect(demand.prd).toEqual(demandInput.prd)
    expect(snapshot.database.lifecycleEvents[0]).toMatchObject({
      authorId: snapshot.activeUserId,
      createdAt: now,
      action: 'withdraw'
    })
    saveDemand(snapshot, { ...demandInput, id: demand.id })
    expect(demand.status).toBe('pending')
  })
  it.each(['draft', 'pending', 'returned'] as const)('本人可删除%s；其他身份无权', (status) => {
    const snapshot = fresh()
    const demand = saveDemand(snapshot, demandInput)
    demand.status = status
    snapshot.activeUserId = 'user-manager-chen'
    const before = structuredClone(snapshot)
    expect(() => actionDemand(snapshot, { demandId: demand.id, action: 'delete' })).toThrow('本人')
    expect(snapshot).toEqual(before)
    snapshot.activeUserId = demand.submitterId
    actionDemand(snapshot, { demandId: demand.id, action: 'delete' })
    expect(snapshot.database.demands.some((row) => row.id === demand.id)).toBe(false)
  })
  it.each(['rejected', 'established', 'withdrawn'] as const)('%s需求不可删除', (status) => {
    const snapshot = fresh()
    const demand = saveDemand(snapshot, demandInput)
    demand.status = status
    const before = structuredClone(snapshot)
    expect(() => actionDemand(snapshot, { demandId: demand.id, action: 'delete' })).toThrow('状态')
    expect(snapshot).toEqual(before)
  })
})
describe('项目生命周期', () => {
  it('100%不自动完成，末阶段完成后仅主负责人显式完成自动归档', () => {
    const { snapshot, project } = projectFixture()
    snapshot.activeUserId = project.primaryOwnerId
    updateProgress(snapshot, {
      projectId: project.id,
      kind: 'overall',
      overallProgress: 100,
      summary: '进度达到100%',
      status: 'in-progress',
      now
    })
    expect(project).toMatchObject({ status: 'active', archived: false })
    expect(() => actionProject(snapshot, { projectId: project.id, action: 'complete' })).toThrow(
      '验收'
    )
    for (const _stage of PROJECT_STAGES.slice(2)) {
      updateProgress(snapshot, {
        projectId: project.id,
        kind: 'overall',
        overallProgress: 100,
        summary: '阶段完成',
        status: 'completed',
        nextStageExpectedDate: '2026-09-20',
        now
      })
    }
    expect(project).toMatchObject({
      stage: '验收交付',
      simpleStatus: 'completed',
      status: 'active'
    })
    snapshot.activeUserId = 'user-manager-chen'
    expect(() => actionProject(snapshot, { projectId: project.id, action: 'complete' })).toThrow(
      '主负责人'
    )
    snapshot.activeUserId = project.primaryOwnerId
    actionProject(snapshot, { projectId: project.id, action: 'complete', now })
    expect(project).toMatchObject({ status: 'completed', archived: true })
    expect(snapshot.database.lifecycleEvents[0]).toMatchObject({
      action: 'complete',
      authorId: project.primaryOwnerId,
      createdAt: now
    })
  })
  it('取消必须填写原因；取消/归档只读，重开保留历史并恢复更新', () => {
    const { snapshot, project } = projectFixture()
    const before = structuredClone(snapshot)
    expect(() => actionProject(snapshot, { projectId: project.id, action: 'cancel' })).toThrow(
      '取消原因'
    )
    expect(snapshot).toEqual(before)
    actionProject(snapshot, { projectId: project.id, action: 'cancel', reason: '预算取消', now })
    expect(() =>
      updateProgress(snapshot, {
        projectId: project.id,
        kind: 'overall',
        overallProgress: 1,
        summary: '测试'
      })
    ).toThrow('只读')
    actionProject(snapshot, { projectId: project.id, action: 'archive', now })
    const events = structuredClone(snapshot.database.lifecycleEvents)
    actionProject(snapshot, { projectId: project.id, action: 'reopen', now })
    expect(project).toMatchObject({
      status: 'active',
      archived: false,
      simpleStatus: 'in-progress'
    })
    expect(snapshot.database.lifecycleEvents.slice(1)).toEqual(events)
    updateProgress(snapshot, {
      projectId: project.id,
      kind: 'overall',
      overallProgress: 5,
      summary: '恢复执行',
      now
    })
    expect(project.overallProgress).toBe(5)
  })
  it('有个人进度也禁止删除；无进度误建删除后关联需求回到待评估', () => {
    const { snapshot, project } = projectFixture()
    updateProgress(snapshot, { projectId: project.id, kind: 'personal', summary: '个人记录', now })
    expect(() => actionProject(snapshot, { projectId: project.id, action: 'delete' })).toThrow(
      '取消或归档'
    )
    snapshot.activeUserId = 'user-business-li'
    const demand = saveDemand(snapshot, demandInput)
    snapshot.activeUserId = 'user-manager-chen'
    const linked = reviewDemand(snapshot, {
      demandId: demand.id,
      decision: 'establish',
      project: { ...projectInput, requestId: 'linked' }
    })
    actionProject(snapshot, { projectId: linked.id, action: 'delete' })
    expect(demand.status).toBe('pending')
    expect(snapshot.database.projects.some((row) => row.id === linked.id)).toBe(false)
    expect(snapshot.database.stageHistories.some((row) => row.projectId === linked.id)).toBe(false)
  })
  it.each(['save-error', 'forbidden'] as const)('场景%s不写入', (scenario) => {
    const { snapshot, project } = projectFixture()
    snapshot.scenario = scenario
    const before = structuredClone(snapshot)
    expect(() => actionProject(snapshot, { projectId: project.id, action: 'delete' })).toThrow()
    expect(snapshot).toEqual(before)
  })
  it.each(['user-business-li', 'user-engineer-zhao'])('非管理员%s禁止生命周期管理', (id) => {
    const { snapshot, project } = projectFixture()
    snapshot.activeUserId = id
    for (const action of ['cancel', 'archive', 'reopen', 'delete'] as const)
      expect(() =>
        actionProject(snapshot, { projectId: project.id, action, reason: '原因' })
      ).toThrow('管理人员')
  })
})
