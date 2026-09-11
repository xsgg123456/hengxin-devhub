import { describe, expect, it } from 'vitest'
import { actionDemand, actionProject } from './lifecycle-service'
import { createProject, reviewDemand, saveDemand, updateProgress } from './workflow-service'
import { fresh, demandInput, projectInput, now, planFixture } from './workflow-fixtures'
import { PROJECT_STAGES, type DemoProject } from '@/domain/prototype'

function projectFixture() {
  const snapshot = fresh()
  snapshot.activeUserId = 'user-manager-chen'
  const project = createProject(snapshot, projectInput)
  planFixture(snapshot, project)
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
  it.each(['draft', 'pending', 'returned', 'rejected', 'established', 'withdrawn'] as const)(
    '本人业务人员可删除%s；工程师无权',
    (status) => {
      const snapshot = fresh()
      const demand = saveDemand(snapshot, demandInput)
      demand.status = status
      snapshot.activeUserId = 'user-engineer-wang'
      const before = structuredClone(snapshot)
      expect(() => actionDemand(snapshot, { demandId: demand.id, action: 'delete' })).toThrow(
        '管理人员'
      )
      expect(snapshot).toEqual(before)
      snapshot.activeUserId = demand.submitterId
      actionDemand(snapshot, { demandId: demand.id, action: 'delete' })
      expect(snapshot.database.demands.some((row) => row.id === demand.id)).toBe(false)
    }
  )
  it('管理员可删除他人需求', () => {
    const snapshot = fresh()
    const demand = saveDemand(snapshot, demandInput)
    snapshot.activeUserId = 'user-manager-chen'
    actionDemand(snapshot, { demandId: demand.id, action: 'delete' })
    expect(snapshot.database.demands.some((row) => row.id === demand.id)).toBe(false)
  })
})
describe('项目生命周期', () => {
  it('验收完成自动完成项目但不归档，重开清除当前完成时间并保留历史', () => {
    const { snapshot, project } = projectFixture()
    snapshot.activeUserId = project.primaryOwnerId
    for (const _stage of PROJECT_STAGES.slice(2)) updateProgress(snapshot, {
      projectId: project.id, kind: 'overall', summary: '', status: 'completed', now
    })
    expect(project).toMatchObject({ status: 'completed', archived: false, actualCompletedAt: now })
    expect(snapshot.database.lifecycleEvents[0]).toMatchObject({ action: 'complete', authorId: project.primaryOwnerId, createdAt: now })
    expect(() => actionProject(snapshot, { projectId: project.id, action: 'complete' })).toThrow('自动完成')
    snapshot.activeUserId = 'user-manager-chen'
    actionProject(snapshot, { projectId: project.id, action: 'reopen', now })
    expect(project.actualCompletedAt).toBeNull()
    const again = '2026-09-09T09:00:00+08:00'
    updateProgress(snapshot, { projectId: project.id, kind: 'overall', summary: '', status: 'completed', now: again })
    expect(project.actualCompletedAt).toBe(again)
    expect(snapshot.database.lifecycleEvents.filter(e => e.entityId === project.id && e.action === 'complete')).toHaveLength(2)
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
      status: 'in-progress',
      summary: '恢复执行',
      now
    })
    expect(project.simpleStatus).toBe('in-progress')
  })
  it('有个人进度仍能删除；本人删除已归档关联项目时整组清除且保留审计', () => {
    const { snapshot, project } = projectFixture()
    updateProgress(snapshot, { projectId: project.id, kind: 'personal', summary: '个人记录', now })
    actionProject(snapshot, { projectId: project.id, action: 'delete' })
    expect(snapshot.database.progressUpdates.some((row) => row.projectId === project.id)).toBe(
      false
    )
    snapshot.activeUserId = 'user-business-li'
    const demand = saveDemand(snapshot, demandInput)
    snapshot.activeUserId = 'user-manager-chen'
    const linked = reviewDemand(snapshot, {
      demandId: demand.id,
      decision: 'establish',
      project: { ...projectInput, requestId: 'linked' }
    }) as DemoProject
    linked.archived = true
    snapshot.activeUserId = linked.primaryOwnerId
    expect(() => actionProject(snapshot, { projectId: linked.id, action: 'delete' })).toThrow(
      '管理人员'
    )
    snapshot.activeUserId = demand.submitterId
    actionProject(snapshot, { projectId: linked.id, action: 'delete' })
    expect(snapshot.database.demands.some((row) => row.id === demand.id)).toBe(false)
    expect(snapshot.database.projects.some((row) => row.id === linked.id)).toBe(false)
    expect(snapshot.database.stageHistories.some((row) => row.projectId === linked.id)).toBe(false)
    expect(
      snapshot.database.lifecycleEvents.filter(
        (row) => row.action === 'delete' && [linked.id, demand.id].includes(row.entityId)
      )
    ).toHaveLength(2)
  })
  it('删除已立项需求同步删除关联项目且不影响其他项目', () => {
    const { snapshot, project } = projectFixture()
    snapshot.activeUserId = 'user-business-li'
    const demand = saveDemand(snapshot, demandInput)
    snapshot.activeUserId = 'user-manager-chen'
    const linked = reviewDemand(snapshot, {
      demandId: demand.id,
      decision: 'establish',
      project: { ...projectInput, requestId: 'delete-demand-linked' }
    })
    actionDemand(snapshot, { demandId: demand.id, action: 'delete' })
    expect(snapshot.database.projects.some((row) => row.id === linked.id)).toBe(false)
    expect(snapshot.database.projects.some((row) => row.id === project.id)).toBe(true)
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
