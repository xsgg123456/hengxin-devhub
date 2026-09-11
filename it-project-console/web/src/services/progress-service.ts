import { needsPlan } from './stage-plan-service'
import { projectState, recordLifecycle } from './lifecycle-service'
import { PROJECT_STAGES, type PrototypeSnapshot, type SimpleStatus } from '@/domain/prototype'
import { assertWrite, nextId, textValue, WorkflowError } from './workflow-validation'
import { computeProjectRisks } from './risk-service'
export interface ProgressInput {
  projectId: string
  kind: 'overall' | 'personal'
  summary: string
  blocker?: string
  overallProgress?: number
  status?: SimpleStatus
  stageExpectedDate?: string
  expectedLaunchDate?: string
  expectedDeliveryDate?: string
  nextStageExpectedDate?: string
  changeReason?: string
  changeDescription?: string
  now?: string
}
export function updateProgress(snapshot: PrototypeSnapshot, input: ProgressInput) {
  const actor = assertWrite(snapshot)
  if ('stage' in input) throw new WorkflowError('不能直接修改或跳过阶段，请完成当前阶段')
  const project = snapshot.database.projects.find((row) => row.id === input.projectId)
  if (!project) throw new WorkflowError('项目不存在')
  if (project.status !== 'active' || project.archived) throw new WorkflowError('当前项目只读')
  const overall = actor.role === 'manager' || actor.id === project.primaryOwnerId
  if (input.kind === 'overall' && !overall)
    throw new WorkflowError('只有主负责人或管理人员能更新整体进度')
  if (input.kind === 'personal' && !project.collaboratorIds.includes(actor.id) && !overall)
    throw new WorkflowError('只有项目成员可以提交进展')
  if (!['overall', 'personal'].includes(input.kind)) throw new WorkflowError('进度记录类型无效')
  const overallKeys = [
    'overallProgress',
    'stageExpectedDate',
    'expectedLaunchDate',
    'expectedDeliveryDate',
    'nextStageExpectedDate',
    'changeReason',
    'changeDescription'
  ] as const
  if (input.kind === 'personal' && overallKeys.some((key) => input[key] !== undefined))
    throw new WorkflowError('个人进展不能修改项目整体字段')
  const summary =
    input.kind === 'overall' ? (input.summary ?? '').trim() : textValue(input.summary, '进展说明')
  if (summary.length > 300) throw new WorkflowError('进展说明最多 300 字')
  const blocker = input.blocker?.trim() ?? ''
  if (blocker.length > 300) throw new WorkflowError('阻塞说明最多 300 字')
  const status = input.status ?? project.simpleStatus
  if (!['not-started', 'in-progress', 'nearly-done', 'completed', 'blocked'].includes(status))
    throw new WorkflowError('简单状态无效')
  if (status === 'blocked' && !blocker) throw new WorkflowError('请填写阻塞说明')
  const now = input.now ?? new Date().toISOString()
  const previousStage = project.stage
  if (input.kind === 'overall') {
    if (needsPlan(project)) throw new WorkflowError('请先完整制定当前及后续环节计划')
    if (!['in-progress', 'completed'].includes(status))
      throw new WorkflowError('请选择尚未完成或已完成')
    if (overallKeys.some((key) => input[key] !== undefined))
      throw new WorkflowError('请通过独立计划入口调整日期，进度更新不接受整体百分比')
    const before = projectState(project)
    const nextStage = PROJECT_STAGES[PROJECT_STAGES.indexOf(project.stage) + 1]
    project.simpleStatus = status
    project.blocker = status === 'blocked' ? blocker : ''
    project.lastOverallUpdatedAt = now
    if (status === 'completed') {
      const history = snapshot.database.stageHistories.find(
        (row) =>
          row.projectId === project.id &&
          row.stage === project.stage &&
          row.completedAt === null &&
          !row.interruptedAt
      )
      if (history) history.completedAt = now
      else
        snapshot.database.stageHistories.push({
          projectId: project.id,
          stage: project.stage,
          startedAt: '',
          completedAt: now
        })
      if (nextStage) {
        project.stage = nextStage
        project.simpleStatus = 'not-started'
        project.stageExpectedDate = project.stagePlans!.find((p) => p.stage === nextStage)!.endDate
        snapshot.database.stageHistories.push({
          projectId: project.id,
          stage: nextStage,
          startedAt: now,
          completedAt: null
        })
      } else {
        project.status = 'completed'
        project.actualCompletedAt = now
        recordLifecycle(snapshot, {
          entityType: 'project',
          entityId: project.id,
          action: 'complete',
          createdAt: now,
          reason: summary,
          before,
          after: projectState(project)
        })
      }
    }
  }
  const update = {
    id: nextId('U', snapshot.database.progressUpdates),
    projectId: project.id,
    authorId: actor.id,
    kind: input.kind,
    stage: previousStage,
    status,
    summary,
    blocker,
    createdAt: now
  }
  snapshot.database.progressUpdates.unshift(update)
  project.updatedAt = now
  project.risks = computeProjectRisks(project, snapshot.database.scheduleChanges, now)
  return update
}
