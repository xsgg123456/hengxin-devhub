import {
  PROJECT_STAGES,
  SCHEDULE_REASONS,
  type ProjectStage,
  type PrototypeSnapshot,
  type SimpleStatus
} from '@/domain/prototype'
import { assertWrite, dateValue, nextId, textValue, WorkflowError } from './workflow-validation'
import { projectState, recordLifecycle } from './lifecycle-service'
import { computeProjectRisks } from './risk-service'
import { isItDepartment } from '@/utils/it-department'

export interface ManagerInput {
  userId: string
  enabled: boolean
  now?: string
}
export interface CorrectionInput {
  projectId: string
  stage: ProjectStage
  overallProgress: number
  status?: SimpleStatus
  reason: string
  stageExpectedDate?: string
  expectedLaunchDate?: string
  expectedDeliveryDate?: string
  changeReason?: string
  changeDescription?: string
  blocker?: string
  now?: string
}
export function setManager(snapshot: PrototypeSnapshot, input: ManagerInput) {
  const actor = assertWrite(snapshot)
  if (actor.role !== 'manager') throw new WorkflowError('只有管理人员可以维护名单')
  const user = snapshot.database.users.find((row) => row.id === input.userId)
  if (!user) throw new WorkflowError('请选择已有组织用户')
  if (typeof input.enabled !== 'boolean') throw new WorkflowError('授权操作无效')
  if ((user.role === 'manager') === input.enabled) return user
  if (!input.enabled && snapshot.database.users.filter((row) => row.role === 'manager').length <= 1)
    throw new WorkflowError('不能移除最后一名管理人员')
  const before = { role: user.role, roleLabel: user.roleLabel }
  user.role = input.enabled ? 'manager' : isItDepartment(user.department) ? 'engineer' : 'business'
  user.roleLabel =
    user.role === 'manager' ? '管理人员' : user.role === 'engineer' ? 'IT工程师' : '业务人员'
  recordLifecycle(snapshot, {
    entityType: 'user',
    entityId: user.id,
    action: input.enabled ? 'grant' : 'revoke',
    createdAt: input.now ?? new Date().toISOString(),
    reason: '',
    before,
    after: { role: user.role, roleLabel: user.roleLabel }
  })
  return user
}
export function correctProject(snapshot: PrototypeSnapshot, input: CorrectionInput) {
  const actor = assertWrite(snapshot)
  if (actor.role !== 'manager') throw new WorkflowError('只有管理人员可以纠正项目')
  const project = snapshot.database.projects.find((row) => row.id === input.projectId)
  if (!project) throw new WorkflowError('项目不存在')
  if (project.status !== 'active' || project.archived) throw new WorkflowError('请先重新打开项目')
  const index = PROJECT_STAGES.indexOf(input.stage)
  const oldIndex = PROJECT_STAGES.indexOf(project.stage)
  if (index < 0 || index > oldIndex + 1) throw new WorkflowError('不得跳过固定阶段')
  if (index > oldIndex && project.simpleStatus !== 'completed')
    throw new WorkflowError('须先完成当前阶段')
  if (
    index < oldIndex &&
    !snapshot.database.stageHistories.some(
      (row) => row.projectId === project.id && row.stage === input.stage
    )
  )
    throw new WorkflowError('只能纠正到已走过的阶段')
  if (
    !Number.isFinite(input.overallProgress) ||
    input.overallProgress < 0 ||
    input.overallProgress > 100
  )
    throw new WorkflowError('整体进度须为 0～100%')
  const status = input.status ?? 'in-progress'
  if (!['not-started', 'in-progress', 'nearly-done', 'completed', 'blocked'].includes(status))
    throw new WorkflowError('简单状态无效')
  const blocker = input.blocker?.trim() ?? project.blocker
  if (status === 'blocked' && !blocker) throw new WorkflowError('请填写阻塞说明')
  if (blocker.length > 300) throw new WorkflowError('阻塞说明最多 300 字')
  if (status === 'completed' && input.stage !== '验收交付')
    throw new WorkflowError('请通过进度更新完成当前阶段并设置下一阶段日期')
  const reason = textValue(input.reason, '纠正原因')
  const fields = ['stageExpectedDate', 'expectedLaunchDate', 'expectedDeliveryDate'] as const
  const changes = fields.filter(
    (field) => input[field] !== undefined && input[field] !== project[field]
  )
  fields.forEach((field) => dateValue(input[field] ?? project[field], '预计日期'))
  if (changes.length) {
    if (!SCHEDULE_REASONS.some((value) => value === input.changeReason))
      throw new WorkflowError('请选择日期调整原因')
    textValue(input.changeDescription ?? '', '日期调整说明')
  }
  const now = input.now ?? new Date().toISOString()
  const before = projectState(project)
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
  if (
    project.stage !== input.stage ||
    (project.simpleStatus === 'completed' && status !== 'completed')
  ) {
    for (const history of snapshot.database.stageHistories.filter(
      (row) => row.projectId === project.id && row.completedAt === null && !row.interruptedAt
    ))
      history.interruptedAt = now
    snapshot.database.stageHistories.push({
      projectId: project.id,
      stage: input.stage,
      startedAt: now,
      completedAt: status === 'completed' ? now : null
    })
  } else if (status === 'completed') {
    for (const history of snapshot.database.stageHistories.filter(
      (row) => row.projectId === project.id && row.completedAt === null && !row.interruptedAt
    ))
      history.completedAt = now
  }
  project.stage = input.stage
  project.overallProgress = input.overallProgress
  project.simpleStatus = status
  project.blocker = status === 'blocked' ? blocker : ''
  project.updatedAt = now
  project.lastOverallUpdatedAt = now
  snapshot.database.progressUpdates.unshift({
    id: nextId('U', snapshot.database.progressUpdates),
    projectId: project.id,
    authorId: actor.id,
    kind: 'overall',
    stage: project.stage,
    status,
    summary: reason,
    blocker: project.blocker,
    overallProgress: project.overallProgress,
    createdAt: now
  })
  project.risks = computeProjectRisks(project, snapshot.database.scheduleChanges, now)
  recordLifecycle(snapshot, {
    entityType: 'project',
    entityId: project.id,
    action: 'correct',
    createdAt: now,
    reason,
    before,
    after: projectState(project)
  })
  return project
}
