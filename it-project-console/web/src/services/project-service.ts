import { canApproveProjects } from '@/utils/project-approver'
import { initializeAcceptance } from './acceptance-service'
import { submitProjectProposal, recordProposalDeletion } from './proposal-service'
import { nextProjectCode, backfillProjectCodes } from '@/utils/project-code'
import { PROJECT_STAGES, type DemoProject, type PrototypeSnapshot } from '@/domain/prototype'
import { isEngineerEligible } from '@/utils/engineer-eligibility'
import { computeProjectRisks } from './risk-service'
import { demandMaterials } from './demand-materials'
import {
  assertWrite,
  nextId,
  textValue,
  validateMaterials,
  WorkflowError
} from './workflow-validation'
export interface ProjectInput {
  approvedLaunchDate: string
  requestId: string
  name: string
  department: string
  primaryOwnerId: string
  collaboratorIds: string[]
  priority: 'P0' | 'P1' | 'P2'
  expectedLaunchDate?: string
  expectedDeliveryDate?: string
  stageExpectedDate?: string
  now?: string
}
export interface ReviewInput {
  demandId: string
  decision: 'establish' | 'return' | 'reject'
  reason?: string
  project?: ProjectInput
  now?: string
}
export function createProject(
  snapshot: PrototypeSnapshot,
  input: ProjectInput,
  demandId: string | null = null
) {
  if (!canApproveProjects(assertWrite(snapshot)))
    throw new WorkflowError('仅指定立项审批人可以创建项目')
  return createFormalProject(snapshot, input, demandId)
}
export function createFormalProject(
  snapshot: PrototypeSnapshot,
  input: ProjectInput,
  demandId: string | null = null
) {
  assertWrite(snapshot)
  const requestId = textValue(input.requestId, '请求编号')
  const existing = snapshot.database.projects.find(
    (row) => row.requestId === requestId || (demandId !== null && row.demandId === demandId)
  )
  if (existing) {
    if (existing.demandId !== demandId) throw new WorkflowError('请求编号已用于其他项目')
    return existing
  }
  const engineers = snapshot.database.users
    .filter((user) => isEngineerEligible(user))
    .map((user) => user.id)
  if (!engineers.includes(input.primaryOwnerId)) throw new WorkflowError('请选择唯一 IT 主负责人')
  if (
    new Set(input.collaboratorIds).size !== input.collaboratorIds.length ||
    input.collaboratorIds.some((id) => id === input.primaryOwnerId || !engineers.includes(id))
  )
    throw new WorkflowError('协作人员须为 IT 用户且与主负责人互斥')
  if (!['P0', 'P1', 'P2'].includes(input.priority)) throw new WorkflowError('请选择项目优先级')
  const name = textValue(input.name, '项目名称', 100)
  const department = textValue(input.department, '需求部门', 100)
  const now = input.now ?? new Date().toISOString()
  const parentProjectId = snapshot.database.demands.find(d => d.id === demandId)?.parentProjectId ?? null
  if (parentProjectId) {
    const parent = snapshot.database.projects.find(p => p.id === parentProjectId)
    if (!parent || parent.status !== 'completed' || parent.parentProjectId)
      throw new WorkflowError('原项目状态已变化，不能建立优化项目')
  }
  backfillProjectCodes(snapshot.database)
  const project: DemoProject = {
    approvedLaunchDate: input.approvedLaunchDate,
    code: nextProjectCode(snapshot.database, now, !!parentProjectId),
    id: nextId(
      'P',
      snapshot.database.projects,
      snapshot.database.lifecycleEvents
        .filter((e) => e.entityType === 'project')
        .map((e) => e.entityId)
    ),
    requestId,
    demandId,
    parentProjectId,
    firstRequestedOn: snapshot.database.demands.find(d => d.id === demandId)?.firstRequestedOn || '',
    businessOwnerId: snapshot.database.demands.find(d => d.id === demandId)?.submitterId || '',
    source: demandId ? ('demand' as const) : ('direct' as const),
    name,
    department,
    priority: input.priority,
    primaryOwnerId: input.primaryOwnerId,
    collaboratorIds: [...input.collaboratorIds],
    stage: parentProjectId ? '验收交付' : '方案设计',
    simpleStatus: 'not-started' as const,
    overallProgress: 0,
    stagePlans: [],
    actualCompletedAt: null,
    stageExpectedDate: '',
    originalLaunchDate: '',
    expectedLaunchDate: '',
    originalDeliveryDate: '',
    expectedDeliveryDate: '',
    status: 'active' as const,
    archived: false,
    risks: [] as string[],
    blocker: '',
    createdAt: now,
    updatedAt: now,
    lastOverallUpdatedAt: now
  }
  project.risks = computeProjectRisks(project, snapshot.database.scheduleChanges, now)
  initializeAcceptance(project, snapshot.database)
  snapshot.database.projects.unshift(project)
  snapshot.database.stageHistories.push(
    ...(parentProjectId ? [...PROJECT_STAGES.slice(0, 2), '验收交付' as const] : PROJECT_STAGES.slice(0, 3)).map((stage, index) => ({
      projectId: project.id,
      stage,
      startedAt: now,
      completedAt: index < 2 ? now : null
    }))
  )
  return project
}
export function reviewDemand(snapshot: PrototypeSnapshot, input: ReviewInput) {
  const actor = assertWrite(snapshot)
  if (!canApproveProjects(actor)) throw new WorkflowError('仅指定立项审批人可以评估需求')
  const demand = snapshot.database.demands.find((row) => row.id === input.demandId)
  if (!demand) throw new WorkflowError('需求不存在')
  if (input.decision === 'establish' && demand.status === 'established') {
    const existing = snapshot.database.projects.find((row) => row.demandId === demand.id)
    if (existing) return existing
  }
  if (input.decision === 'establish' && demand.status === 'awaiting_engineer') {
    const proposal = snapshot.database.projectProposals?.find(
      (row) => row.demandId === demand.id && row.requestId === input.project?.requestId
    )
    if (proposal) return proposal
  }
  if (demand.status !== 'pending') throw new WorkflowError('仅待评估需求可处理')
  if (input.decision === 'establish') {
    if (!input.project) throw new WorkflowError('请填写立项信息')
    validateMaterials(demandMaterials(demand), !demand.parentProjectId)
    if (demand.parentProjectId) textValue(demand.optimizationOutcome ?? '', '期望效果 / 验收标准')
    const project = submitProjectProposal(
      snapshot,
      {
        ...input.project,
        name: demand.name,
        department: demand.department,
        now: input.now ?? input.project.now
      },
      demand.id
    )
    demand.status = 'awaiting_engineer'
    demand.reviewedBy = actor.id
    demand.reviewedAt = input.now ?? new Date().toISOString()
    return project
  }
  if (!['return', 'reject'].includes(input.decision)) throw new WorkflowError('处理结果无效')
  const reason = textValue(input.reason ?? '', '处理原因')
  for (const proposal of snapshot.database.projectProposals ?? []) {
    if (proposal.demandId === demand.id) recordProposalDeletion(snapshot, proposal, reason)
  }
  snapshot.database.projectProposals = snapshot.database.projectProposals?.filter(
    (p) => p.demandId !== demand.id
  )
  demand.status = input.decision === 'return' ? 'returned' : 'rejected'
  demand.reviewReason = reason
  demand.reviewedBy = actor.id
  demand.reviewedAt = input.now ?? new Date().toISOString()
  return demand
}
