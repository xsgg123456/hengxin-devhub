import {
  PROJECT_STAGES,
  SCHEDULE_REASONS,
  type PrototypeSnapshot,
  type SimpleStatus
} from '@/domain/prototype'
import { assertWrite, dateValue, nextId, textValue, WorkflowError } from './workflow-validation'
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
  const summary = textValue(input.summary, '进展说明')
  const blocker = input.blocker?.trim() ?? ''
  if (blocker.length > 300) throw new WorkflowError('阻塞说明最多 300 字')
  const status = input.status ?? project.simpleStatus
  if (!['not-started', 'in-progress', 'nearly-done', 'completed', 'blocked'].includes(status))
    throw new WorkflowError('简单状态无效')
  if (status === 'blocked' && !blocker) throw new WorkflowError('请填写阻塞说明')
  const now = input.now ?? new Date().toISOString()
  const previousStage = project.stage
  if (input.kind === 'overall') {
    if (
      input.overallProgress === undefined ||
      !Number.isFinite(input.overallProgress) ||
      input.overallProgress < 0 ||
      input.overallProgress > 100
    )
      throw new WorkflowError('整体进度须为 0～100%')
    const fields = ['stageExpectedDate', 'expectedLaunchDate', 'expectedDeliveryDate'] as const
    const changes = fields.filter(
      (field) => input[field] !== undefined && input[field] !== project[field]
    )
    fields.forEach((field) =>
      dateValue(
        input[field] ?? project[field],
        field === 'stageExpectedDate' ? '阶段预计日期' : '计划日期'
      )
    )
    if (changes.length) {
      if (!SCHEDULE_REASONS.some((reason) => reason === input.changeReason))
        throw new WorkflowError('请选择日期调整原因')
      textValue(input.changeDescription ?? '', '日期调整说明')
    }
    const nextStage = PROJECT_STAGES[PROJECT_STAGES.indexOf(project.stage) + 1]
    if (status === 'completed' && nextStage)
      dateValue(input.nextStageExpectedDate ?? '', '下一阶段预计完成日期')
    for (const field of changes) {
      snapshot.database.scheduleChanges.push({
        id: nextId('S', snapshot.database.scheduleChanges),
        projectId: project.id,
        field,
        oldValue: project[field],
        newValue: input[field]!,
        reason: input.changeReason!,
        description: input.changeDescription!.trim(),
        authorId: actor.id,
        createdAt: now
      })
      project[field] = input[field]!
    }
    project.overallProgress = input.overallProgress
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
      if (nextStage) {
        project.stage = nextStage
        project.simpleStatus = 'not-started'
        project.stageExpectedDate = input.nextStageExpectedDate!
        snapshot.database.stageHistories.push({
          projectId: project.id,
          stage: nextStage,
          startedAt: now,
          completedAt: null
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
    createdAt: now,
    ...(input.kind === 'overall' ? { overallProgress: project.overallProgress } : {})
  }
  snapshot.database.progressUpdates.unshift(update)
  project.updatedAt = now
  project.risks = computeProjectRisks(project, snapshot.database.scheduleChanges, now)
  return update
}
