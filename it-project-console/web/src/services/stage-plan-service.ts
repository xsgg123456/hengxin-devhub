import {
  PROJECT_STAGES,
  SCHEDULE_REASONS,
  type DemoProject,
  type PrototypeSnapshot,
  type StagePlan
} from '@/domain/prototype'
import { assertWrite, dateValue, nextId, textValue, WorkflowError } from './workflow-validation'
import { computeProjectRisks } from './risk-service'

export interface PlanInput {
  projectId: string
  plans: StagePlan[]
  changeReason?: string
  changeDescription?: string
  now?: string
}
export function remainingStages(project: DemoProject) {
  return PROJECT_STAGES.slice(Math.max(2, PROJECT_STAGES.indexOf(project.stage)))
}
export function needsPlan(project: DemoProject) {
  return (
    project.status === 'active' &&
    remainingStages(project).some(
      (stage) =>
        !project.stagePlans?.some((plan) => plan.stage === stage && plan.startDate && plan.endDate)
    )
  )
}
export function validatePlans(project: DemoProject, input: PlanInput) {
  const stages = remainingStages(project)
  if (
    input.plans.length !== stages.length ||
    stages.some((stage, index) => input.plans[index]?.stage !== stage)
  )
    throw new WorkflowError('请完整填写当前及后续环节计划，不得修改已完成环节')
  let previous =
    project.stagePlans?.find(
      (p) => p.stage === PROJECT_STAGES[PROJECT_STAGES.indexOf(stages[0]) - 1]
    )?.endDate ?? ''
  for (const plan of input.plans) {
    dateValue(plan.startDate, `${plan.stage}计划开始日期`)
    dateValue(plan.endDate, `${plan.stage}计划结束日期`)
    if (plan.startDate > plan.endDate)
      throw new WorkflowError(`${plan.stage}开始日期不得晚于结束日期`)
    if (previous && plan.startDate < previous)
      throw new WorkflowError(`${plan.stage}不得早于前一环节结束日期`)
    previous = plan.endDate
  }
  const changed = input.plans.some((plan) => {
    const old = project.stagePlans?.find((p) => p.stage === plan.stage)
    return old && (old.startDate !== plan.startDate || old.endDate !== plan.endDate)
  })
  if (changed) {
    if (!SCHEDULE_REASONS.some((reason) => reason === input.changeReason))
      throw new WorkflowError('请选择日期调整原因')
    textValue(input.changeDescription ?? '', '日期调整说明')
  }
}
export function saveProjectPlan(snapshot: PrototypeSnapshot, input: PlanInput) {
  const actor = assertWrite(snapshot)
  const project = snapshot.database.projects.find((p) => p.id === input.projectId)
  if (!project) throw new WorkflowError('项目不存在')
  if (actor.role !== 'manager' && actor.id !== project.primaryOwnerId)
    throw new WorkflowError('只有主负责人或管理人员可以制定计划')
  if (project.status !== 'active' || project.archived) throw new WorkflowError('当前项目只读')
  validatePlans(project, input)
  const now = input.now ?? new Date().toISOString()
  const beforePlans =
    (project.stagePlans ?? [])
      .map((plan) => `${plan.stage} ${plan.startDate} → ${plan.endDate}`)
      .join('；') || '尚未排期'
  const plans = input.plans.map((plan) => {
    const old = project.stagePlans?.find((p) => p.stage === plan.stage)
    if (old)
      for (const field of ['startDate', 'endDate'] as const) {
        if (old[field] === plan[field]) continue
        snapshot.database.scheduleChanges.push({
          id: nextId('S', snapshot.database.scheduleChanges),
          projectId: project.id,
          field: `stage:${plan.stage}:${field}`,
          oldValue: old[field],
          newValue: plan[field],
          reason: input.changeReason!,
          description: input.changeDescription!.trim(),
          authorId: actor.id,
          createdAt: now
        })
      }
    return {
      stage: plan.stage,
      startDate: plan.startDate,
      endDate: plan.endDate,
      originalStartDate: old?.originalStartDate ?? old?.startDate ?? plan.startDate,
      originalEndDate: old?.originalEndDate ?? old?.endDate ?? plan.endDate
    }
  })
  project.stagePlans = [
    ...(project.stagePlans ?? []).filter((p) => !plans.some((next) => next.stage === p.stage)),
    ...plans
  ]
  project.stageExpectedDate =
    project.stagePlans.find((p) => p.stage === project.stage)?.endDate ?? ''
  project.expectedLaunchDate = project.stagePlans.find((p) => p.stage === '上线部署')?.endDate ?? ''
  project.expectedDeliveryDate =
    project.stagePlans.find((p) => p.stage === '验收交付')?.endDate ?? ''
  project.originalLaunchDate ||=
    project.stagePlans.find((p) => p.stage === '上线部署')?.originalEndDate ?? ''
  project.originalDeliveryDate ||=
    project.stagePlans.find((p) => p.stage === '验收交付')?.originalEndDate ?? ''
  project.updatedAt = now
  snapshot.database.lifecycleEvents.push({
    id: nextId('L', snapshot.database.lifecycleEvents),
    entityType: 'project',
    entityId: project.id,
    action: 'plan',
    authorId: actor.id,
    createdAt: now,
    reason:
      input.changeDescription?.trim() || (beforePlans === '尚未排期' ? '首次排期' : '保存排期'),
    before: { stagePlans: beforePlans },
    after: {
      stagePlans: project.stagePlans
        .map((plan) => `${plan.stage} ${plan.startDate} → ${plan.endDate}`)
        .join('；')
    }
  })
  project.risks = computeProjectRisks(project, snapshot.database.scheduleChanges, now)
  return project
}
