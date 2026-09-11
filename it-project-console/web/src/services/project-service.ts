import { PROJECT_STAGES, type DemoProject, type PrototypeSnapshot } from '@/domain/prototype'
import { isItDepartment } from '@/utils/it-department'
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
  const actor = assertWrite(snapshot)
  if (actor.role !== 'manager') throw new WorkflowError('只有管理人员可以创建项目')
  const requestId = textValue(input.requestId, '请求编号')
  const existing = snapshot.database.projects.find(
    (row) => row.requestId === requestId || (demandId !== null && row.demandId === demandId)
  )
  if (existing) {
    if (existing.demandId !== demandId) throw new WorkflowError('请求编号已用于其他项目')
    return existing
  }
  const engineers = snapshot.database.users
    .filter((user) => isItDepartment(user.department))
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
  const project: DemoProject = {
    id: nextId(
      'P',
      snapshot.database.projects,
      snapshot.database.lifecycleEvents
        .filter((e) => e.entityType === 'project')
        .map((e) => e.entityId)
    ),
    requestId,
    demandId,
    source: demandId ? ('demand' as const) : ('direct' as const),
    name,
    department,
    priority: input.priority,
    primaryOwnerId: input.primaryOwnerId,
    collaboratorIds: [...input.collaboratorIds],
    stage: '方案设计' as const,
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
  snapshot.database.projects.unshift(project)
  snapshot.database.stageHistories.push(
    ...PROJECT_STAGES.slice(0, 3).map((stage, index) => ({
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
  if (actor.role !== 'manager') throw new WorkflowError('只有管理人员可以评估需求')
  const demand = snapshot.database.demands.find((row) => row.id === input.demandId)
  if (!demand) throw new WorkflowError('需求不存在')
  if (input.decision === 'establish' && demand.status === 'established') {
    const existing = snapshot.database.projects.find((row) => row.demandId === demand.id)
    if (existing) return existing
  }
  if (demand.status !== 'pending') throw new WorkflowError('仅待评估需求可处理')
  if (input.decision === 'establish') {
    if (!input.project) throw new WorkflowError('请填写立项信息')
    validateMaterials(demandMaterials(demand))
    const project = createProject(
      snapshot,
      {
        ...input.project,
        name: demand.name,
        department: demand.department,
        now: input.now ?? input.project.now
      },
      demand.id
    )
    demand.status = 'established'
    demand.reviewedBy = actor.id
    demand.reviewedAt = input.now ?? new Date().toISOString()
    return project
  }
  if (!['return', 'reject'].includes(input.decision)) throw new WorkflowError('处理结果无效')
  const reason = textValue(input.reason ?? '', '处理原因')
  demand.status = input.decision === 'return' ? 'returned' : 'rejected'
  demand.reviewReason = reason
  demand.reviewedBy = actor.id
  demand.reviewedAt = input.now ?? new Date().toISOString()
  return demand
}
