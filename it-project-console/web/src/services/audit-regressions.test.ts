import { expect, it } from 'vitest'
import { fresh, projectInput, demandInput, now } from './workflow-fixtures'
import { correctProject } from './management-service'
import { createProject, saveDemand, updateProgress } from './workflow-service'
import { actionProject, actionDemand } from './lifecycle-service'

it('纠正离开不伪造完成时间，也不补造旧数据的未知时间，再次推进只完成当前阶段实例', () => {
  const snapshot = fresh()
  snapshot.activeUserId = 'user-manager-chen'
  const p = snapshot.database.projects[0]
  const original = structuredClone(
    snapshot.database.stageHistories.filter((h) => h.projectId === p.id)
  )
  correctProject(snapshot, {
    projectId: p.id,
    stage: '方案设计',
    overallProgress: 20,
    reason: '需要重新设计',
    now
  })
  const after = snapshot.database.stageHistories.filter((h) => h.projectId === p.id)
  original
    .filter((h) => h.completedAt === '')
    .forEach((h) =>
      expect(
        after.find((n) => n.stage === h.stage && n.startedAt === h.startedAt)?.completedAt
      ).toBe('')
    )
  expect(after.find((h) => h.stage === '开发编码')).toMatchObject({
    completedAt: null,
    interruptedAt: now
  })
  updateProgress(snapshot, {
    projectId: p.id,
    kind: 'overall',
    overallProgress: 25,
    status: 'completed',
    summary: '重新设计完成',
    nextStageExpectedDate: '2026-12-01',
    now
  })
  updateProgress(snapshot, {
    projectId: p.id,
    kind: 'overall',
    overallProgress: 60,
    status: 'completed',
    summary: '重新开发完成',
    nextStageExpectedDate: '2026-12-05',
    now
  })
  expect(after.find((h) => h.stage === '开发编码' && h.interruptedAt)?.completedAt).toBeNull()
  expect(
    snapshot.database.stageHistories.filter(
      (h) => h.projectId === p.id && h.stage === '开发编码' && h.completedAt === now
    )
  ).toHaveLength(1)
})

it('删除再新建项目与需求不复用编号，旧审计不会串到新实体', () => {
  const snapshot = fresh()
  snapshot.activeUserId = 'user-manager-chen'
  const deletedProject = createProject(snapshot, projectInput)
  actionProject(snapshot, { projectId: deletedProject.id, action: 'delete', reason: '误建', now })
  const newProject = createProject(snapshot, { ...projectInput, requestId: 'second-project' })
  expect(newProject.id).not.toBe(deletedProject.id)
  expect(
    snapshot.database.lifecycleEvents.filter((e) => e.entityId === newProject.id)
  ).toHaveLength(0)
  snapshot.activeUserId = 'user-business-li'
  const deletedDemand = saveDemand(snapshot, demandInput)
  actionDemand(snapshot, { demandId: deletedDemand.id, action: 'delete', now })
  const newDemand = saveDemand(snapshot, { ...demandInput, requestId: 'second-demand' })
  expect(newDemand.id).not.toBe(deletedDemand.id)
})
