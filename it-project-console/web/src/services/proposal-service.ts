import type { ProjectProposal, PrototypeSnapshot } from '@/domain/prototype'
import type { ProjectInput } from './project-service'
import { createFormalProject } from './project-service'
import { assertWrite, dateValue, nextId, textValue, WorkflowError } from './workflow-validation'
import { isEngineerEligible } from '@/utils/engineer-eligibility'
import { recordLifecycle } from './lifecycle-service'
import { apiRequest } from './api-client'
import { projectDto, type LiveWriteResult } from './live-demand-service'

function fields(snapshot: PrototypeSnapshot, input: ProjectInput) {
  const engineers = snapshot.database.users.filter(isEngineerEligible).map((user) => user.id)
  if (!engineers.includes(input.primaryOwnerId)) throw new WorkflowError('请选择唯一 IT 主负责人')
  if (
    new Set(input.collaboratorIds).size !== input.collaboratorIds.length ||
    input.collaboratorIds.some((id) => id === input.primaryOwnerId || !engineers.includes(id))
  )
    throw new WorkflowError('协作人员须为 IT 用户且与主负责人互斥')
  if (!['P0', 'P1', 'P2'].includes(input.priority)) throw new WorkflowError('请选择项目优先级')
  return {
    name: textValue(input.name, '项目名称', 100),
    department: textValue(input.department, '需求部门', 100),
    primaryOwnerId: input.primaryOwnerId,
    collaboratorIds: [...input.collaboratorIds],
    priority: input.priority,
    approvedLaunchDate: dateValue(input.approvedLaunchDate, '审批确认上线日期')
  }
}
function proposalState(p: ProjectProposal) {
  return {
    version: p.version,
    name: p.name,
    department: p.department,
    primaryOwnerId: p.primaryOwnerId,
    collaboratorIds: p.collaboratorIds.join(','),
    priority: p.priority,
    approvedLaunchDate: p.approvedLaunchDate,
    status: p.status,
    reviewReason: p.reviewReason,
    projectId: p.projectId ?? ''
  }
}
function log(
  snapshot: PrototypeSnapshot,
  proposal: ProjectProposal,
  action: 'submit' | 'accept' | 'return' | 'delete',
  reason = '',
  before: Record<string, string | number | boolean> = {}
) {
  recordLifecycle(snapshot, {
    entityType: 'proposal',
    entityId: proposal.id,
    action,
    reason,
    createdAt: action === 'delete' ? new Date().toISOString() : proposal.updatedAt,
    before,
    after: action === 'delete' ? { deleted: true } : proposalState(proposal)
  })
}
export function recordProposalDeletion(
  snapshot: PrototypeSnapshot,
  proposal: ProjectProposal,
  reason = ''
) {
  log(snapshot, proposal, 'delete', reason, proposalState(proposal))
}
export function submitProjectProposal(
  snapshot: PrototypeSnapshot,
  input: ProjectInput,
  demandId: string | null = null
) {
  const actor = assertWrite(snapshot)
  if (actor.role !== 'manager') throw new WorkflowError('只有管理人员可以提交立项评估')
  const list = (snapshot.database.projectProposals ??= [])
  const requestId = textValue(input.requestId, '请求编号')
  const existing = list.find(
    (row) => row.requestId === requestId || (demandId !== null && row.demandId === demandId)
  )
  if (existing) {
    if (existing.demandId !== demandId) throw new WorkflowError('请求编号已被使用')
    if (existing.status === 'returned')
      return resubmitProjectProposal(snapshot, existing.id, existing.version, input)
    return existing
  }
  const now = input.now ?? new Date().toISOString()
  const proposal: ProjectProposal = {
    ...fields(snapshot, input),
    id: nextId(
      'PP',
      list,
      snapshot.database.lifecycleEvents
        .filter((e) => e.entityType === 'proposal')
        .map((e) => e.entityId)
    ),
    requestId,
    version: 1,
    demandId,
    status: 'pending',
    reviewReason: '',
    createdBy: actor.id,
    createdAt: now,
    updatedAt: now,
    projectId: null
  }
  list.unshift(proposal)
  log(snapshot, proposal, 'submit')
  return proposal
}
export function confirmProjectProposal(
  snapshot: PrototypeSnapshot,
  id: string,
  version: number,
  decision: 'accept' | 'return',
  reason = ''
) {
  const actor = assertWrite(snapshot)
  const proposal = snapshot.database.projectProposals?.find((row) => row.id === id)
  if (!proposal) throw new WorkflowError('待接单记录不存在')
  if (!isEngineerEligible(actor) || actor.id !== proposal.primaryOwnerId)
    throw new WorkflowError('仅指定主负责工程师可以接单或退回')
  if (proposal.version !== version || proposal.status !== 'pending')
    throw new WorkflowError('记录已更新，请刷新后重试')
  if (!['accept', 'return'].includes(decision)) throw new WorkflowError('确认决定无效')
  const linkedDemand = snapshot.database.demands.find((row) => row.id === proposal.demandId)
  if (proposal.demandId && linkedDemand?.status !== 'awaiting_engineer')
    throw new WorkflowError('关联需求状态已变化，请重新评估')
  const before = proposalState(proposal)
  const reviewReason = decision === 'return' ? textValue(reason, '退回原因') : ''
  const now = new Date().toISOString()
  if (decision === 'accept') {
    // Formal creation shares the existing constructor; permission is checked on the proposal above.
    const project = createFormalProject(snapshot, { ...proposal, now }, proposal.demandId)
    proposal.projectId = project.id
  }
  proposal.status = decision === 'accept' ? 'confirmed' : 'returned'
  proposal.reviewReason = reviewReason
  proposal.updatedAt = now
  proposal.version++
  const demand = snapshot.database.demands.find((row) => row.id === proposal.demandId)
  if (demand) {
    demand.status = decision === 'accept' ? 'established' : 'pending'
    demand.reviewReason = reviewReason
    demand.version = (demand.version ?? 1) + 1
  }
  log(snapshot, proposal, decision, reviewReason, before)
  return proposal
}
export function resubmitProjectProposal(
  snapshot: PrototypeSnapshot,
  id: string,
  version: number,
  input: ProjectInput
) {
  const actor = assertWrite(snapshot)
  if (actor.role !== 'manager') throw new WorkflowError('只有管理人员可以重新评估')
  const proposal = snapshot.database.projectProposals?.find((row) => row.id === id)
  if (!proposal || proposal.version !== version || proposal.status !== 'returned')
    throw new WorkflowError('记录已更新，请刷新后重试')
  const linkedDemand = snapshot.database.demands.find((row) => row.id === proposal.demandId)
  if (proposal.demandId && linkedDemand?.status !== 'pending')
    throw new WorkflowError('关联需求状态已变化，请重新评估')
  const before = proposalState(proposal)
  Object.assign(proposal, fields(snapshot, input), {
    version: proposal.version + 1,
    status: 'pending',
    reviewReason: '',
    updatedAt: input.now ?? new Date().toISOString()
  })
  const demand = snapshot.database.demands.find((row) => row.id === proposal.demandId)
  if (demand) {
    demand.status = 'awaiting_engineer'
    demand.reviewReason = ''
    demand.version = (demand.version ?? 1) + 1
  }
  log(snapshot, proposal, 'submit', '', before)
  return proposal
}
export function deleteProjectProposal(snapshot: PrototypeSnapshot, id: string, version: number) {
  const actor = assertWrite(snapshot)
  const proposal = snapshot.database.projectProposals?.find((row) => row.id === id)
  if (actor.role !== 'manager') throw new WorkflowError('只有管理人员可以删除')
  if (
    !proposal ||
    proposal.version !== version ||
    proposal.status === 'confirmed' ||
    proposal.demandId
  )
    throw new WorkflowError('该记录不可删除，请刷新后重试')
  snapshot.database.projectProposals = snapshot.database.projectProposals!.filter(
    (row) => row.id !== id
  )
  recordProposalDeletion(snapshot, proposal)
}
export function confirmLiveProposal(
  id: string,
  version: number,
  decision: 'accept' | 'return',
  reason: string,
  requestId: string
) {
  return apiRequest<LiveWriteResult>(`/project-proposals/${id}/confirm`, {
    method: 'POST',
    body: { version, decision, ...(decision === 'return' ? { reason } : {}), requestId }
  })
}
export function resubmitLiveProposal(id: string, version: number, input: ProjectInput) {
  return apiRequest<LiveWriteResult>(`/project-proposals/${id}/resubmit`, {
    method: 'POST',
    body: { ...projectDto(input), version }
  })
}
export function deleteLiveProposal(id: string, version: number, requestId: string) {
  return apiRequest<LiveWriteResult>(`/project-proposals/${id}`, {
    method: 'DELETE',
    body: { version, requestId }
  })
}
