import type { DemoLifecycleEvent, DemoProject, PrototypeSnapshot } from '@/domain/prototype'
import { assertWrite, nextId, textValue, WorkflowError } from './workflow-validation'
import { computeProjectRisks } from './risk-service'

export interface ProjectActionInput {
  projectId: string
  action: 'complete' | 'cancel' | 'archive' | 'reopen' | 'delete'
  reason?: string
  now?: string
}
export interface DemandActionInput {
  demandId: string
  action: 'withdraw' | 'delete'
  now?: string
}
export function recordLifecycle(
  snapshot: PrototypeSnapshot,
  event: Omit<DemoLifecycleEvent, 'id' | 'authorId'>
) {
  snapshot.database.lifecycleEvents.unshift({
    ...event,
    id: nextId('L', snapshot.database.lifecycleEvents),
    authorId: snapshot.activeUserId
  })
}
export function projectState(project: DemoProject) {
  return {
    status: project.status,
    archived: project.archived,
    stage: project.stage,
    simpleStatus: project.simpleStatus,
    actualCompletedAt: project.actualCompletedAt ?? ''
  }
}
function removeGroup(snapshot: PrototypeSnapshot, demandId?: string | null, projectId?: string) {
  snapshot.database.demands = snapshot.database.demands.filter((row) => row.id !== demandId)
  snapshot.database.projects = snapshot.database.projects.filter((row) => row.id !== projectId)
  snapshot.database.progressUpdates = snapshot.database.progressUpdates.filter(
    (row) => row.projectId !== projectId
  )
  snapshot.database.stageHistories = snapshot.database.stageHistories.filter(
    (row) => row.projectId !== projectId
  )
  snapshot.database.scheduleChanges = snapshot.database.scheduleChanges.filter(
    (row) => row.projectId !== projectId
  )
}
export function actionDemand(snapshot: PrototypeSnapshot, input: DemandActionInput) {
  const actor = assertWrite(snapshot)
  const demand = snapshot.database.demands.find((row) => row.id === input.demandId)
  if (!demand) throw new WorkflowError('需求不存在')
  if (!['withdraw', 'delete'].includes(input.action)) throw new WorkflowError('需求操作无效')
  const project = snapshot.database.projects.find((row) => row.demandId === demand.id)
  if (input.action === 'delete') {
    if (actor.role !== 'manager' && !(actor.role === 'business' && demand.submitterId === actor.id))
      throw new WorkflowError('只有管理人员或需求本人业务提交人可以删除')
    removeGroup(snapshot, demand.id, project?.id)
    if (project)
      recordLifecycle(snapshot, {
        entityType: 'project',
        entityId: project.id,
        action: 'delete',
        createdAt: input.now ?? new Date().toISOString(),
        reason: '',
        before: projectState(project),
        after: { deleted: true }
      })
  } else {
    if (demand.submitterId !== actor.id) throw new WorkflowError('只能维护本人需求')
    if (!['pending', 'returned'].includes(demand.status) || project)
      throw new WorkflowError('当前需求状态不允许撤回')
  }
  const before = { status: demand.status, name: demand.name }
  if (input.action === 'withdraw') demand.status = 'withdrawn'
  recordLifecycle(snapshot, {
    entityType: 'demand',
    entityId: demand.id,
    action: input.action,
    createdAt: input.now ?? new Date().toISOString(),
    reason: '',
    before,
    after: input.action === 'delete' ? { deleted: true } : { status: demand.status }
  })
  return demand
}
export function actionProject(snapshot: PrototypeSnapshot, input: ProjectActionInput) {
  const actor = assertWrite(snapshot)
  const project = snapshot.database.projects.find((row) => row.id === input.projectId)
  if (!project) throw new WorkflowError('项目不存在')
  if (!['complete', 'cancel', 'archive', 'reopen', 'delete'].includes(input.action))
    throw new WorkflowError('项目操作无效')
  if (input.action === 'complete') {
    throw new WorkflowError('请通过更新环节完成验收交付，项目会自动完成')
  } else if (input.action === 'delete') {
    const demand = snapshot.database.demands.find((row) => row.id === project.demandId)
    if (
      actor.role !== 'manager' &&
      !(actor.role === 'business' && demand?.submitterId === actor.id)
    )
      throw new WorkflowError('只有管理人员或需求本人业务提交人可以删除')
  } else if (actor.role !== 'manager') throw new WorkflowError('只有管理人员可以执行此操作')
  if (input.action === 'cancel' && (project.status !== 'active' || project.archived))
    throw new WorkflowError('只有未归档的进行中项目可以取消')
  if (input.action === 'archive' && project.archived) throw new WorkflowError('项目已经归档')
  if (input.action === 'reopen' && project.status === 'active' && !project.archived)
    throw new WorkflowError('项目已经处于进行中')
  const reason =
    input.action === 'cancel'
      ? textValue(input.reason ?? '', '取消原因')
      : (input.reason?.trim() ?? '')
  const before = projectState(project)
  const now = input.now ?? new Date().toISOString()
  if (input.action === 'delete') {
    removeGroup(snapshot, project.demandId, project.id)
    if (project.demandId)
      recordLifecycle(snapshot, {
        entityType: 'demand',
        entityId: project.demandId,
        action: 'delete',
        createdAt: now,
        reason,
        before: { projectId: project.id },
        after: { deleted: true }
      })
  } else {
    if (input.action === 'cancel') project.status = 'cancelled'
    if (input.action === 'archive') project.archived = true
    if (input.action === 'reopen') {
      project.actualCompletedAt = null
      project.status = 'active'
      project.archived = false
      project.simpleStatus = 'in-progress'
      if (
        !snapshot.database.stageHistories.some(
          (row) =>
            row.projectId === project.id &&
            row.stage === project.stage &&
            row.completedAt === null &&
            !row.interruptedAt
        )
      )
        snapshot.database.stageHistories.push({
          projectId: project.id,
          stage: project.stage,
          startedAt: now,
          completedAt: null
        })
    }
    project.updatedAt = now
    project.risks = computeProjectRisks(project, snapshot.database.scheduleChanges, now)
  }
  recordLifecycle(snapshot, {
    entityType: 'project',
    entityId: project.id,
    action: input.action,
    createdAt: now,
    reason,
    before,
    after: input.action === 'delete' ? { deleted: true } : projectState(project)
  })
  return project
}
