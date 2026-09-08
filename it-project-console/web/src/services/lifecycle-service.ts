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
    overallProgress: project.overallProgress
  }
}
export function actionDemand(snapshot: PrototypeSnapshot, input: DemandActionInput) {
  const actor = assertWrite(snapshot)
  const demand = snapshot.database.demands.find((row) => row.id === input.demandId)
  if (!demand) throw new WorkflowError('需求不存在')
  if (demand.submitterId !== actor.id) throw new WorkflowError('只能维护本人需求')
  if (!['withdraw', 'delete'].includes(input.action)) throw new WorkflowError('需求操作无效')
  const allowed =
    input.action === 'delete' ? ['draft', 'pending', 'returned'] : ['pending', 'returned']
  if (!allowed.includes(demand.status)) throw new WorkflowError('当前需求状态不允许此操作')
  if (snapshot.database.projects.some((row) => row.demandId === demand.id))
    throw new WorkflowError('已关联项目的需求不可撤回或删除')
  const before = { status: demand.status, name: demand.name }
  if (input.action === 'delete')
    snapshot.database.demands = snapshot.database.demands.filter((row) => row.id !== demand.id)
  else demand.status = 'withdrawn'
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
    if (actor.id !== project.primaryOwnerId) throw new WorkflowError('只有主负责人可以完成项目')
    if (project.status !== 'active' || project.archived) throw new WorkflowError('当前项目只读')
    if (project.stage !== '验收交付' || project.simpleStatus !== 'completed')
      throw new WorkflowError('须先完成验收交付阶段')
  } else if (actor.role !== 'manager') throw new WorkflowError('只有管理人员可以执行此操作')
  if (
    input.action === 'delete' &&
    snapshot.database.progressUpdates.some((row) => row.projectId === project.id)
  )
    throw new WorkflowError('已有进度记录，请取消或归档项目')
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
    snapshot.database.projects = snapshot.database.projects.filter((row) => row.id !== project.id)
    snapshot.database.stageHistories = snapshot.database.stageHistories.filter(
      (row) => row.projectId !== project.id
    )
    snapshot.database.scheduleChanges = snapshot.database.scheduleChanges.filter(
      (row) => row.projectId !== project.id
    )
    const demand = snapshot.database.demands.find((row) => row.id === project.demandId)
    if (demand) {
      demand.status = 'pending'
      demand.reviewReason = ''
      delete demand.reviewedBy
      delete demand.reviewedAt
    }
  } else {
    if (input.action === 'complete') {
      project.status = 'completed'
      project.archived = true
    }
    if (input.action === 'cancel') project.status = 'cancelled'
    if (input.action === 'archive') project.archived = true
    if (input.action === 'reopen') {
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
