import type { Prisma, PrismaClient, ProjectProposal } from '../../generated/prisma/client.js'
import { assertProjectApprover, projectApproverRecipients } from '../../lib/project-approver.js'
import type { Actor } from '../../plugins/auth.js'
import { AppError } from '../../lib/errors.js'
import { assertManager, command } from '../../lib/business-command.js'
import { commandSchema } from '../demands/demand-schemas.js'
import { proposalConfirmSchema, proposalResubmitSchema, type ProjectInput } from './project-schemas.js'
import { createProject, validateProjectMembers } from './project-service.js'
import { lifecycleEvent } from '../notifications/lifecycle-event-service.js'

function proposalSnapshot(row: ProjectProposal) {
  return { version: row.version, name: row.name, department: row.department,
    primaryOwnerId: row.primaryOwnerId, collaboratorIds: row.collaboratorIds.join(','),
    priority: row.priority, approvedLaunchDate: row.approvedLaunchDate.toISOString().slice(0, 10),
    status: row.status, reviewReason: row.reviewReason, projectId: row.projectId ?? '' }
}
export async function auditProposal(tx: Prisma.TransactionClient, actor: Actor, row: ProjectProposal,
  action: string, reason = '', previous?: ProjectProposal | null) {
  const before = previous ? proposalSnapshot(previous) : {}
  const after = action === 'delete' ? { deleted: true } : proposalSnapshot(row)
  await tx.lifecycleEvent.create({ data: { entityType: 'proposal', entityId: row.id, authorId: actor.id,
    action: ['create', 'resubmit'].includes(action) ? 'submit' : action, reason, before, after } })
  await tx.auditLog.create({ data: { actorId: actor.id, entityType: 'project-proposal', entityId: row.id,
    action, payload: { before, after, reason } } })
}
export async function clearProposalNotifications(tx: Prisma.TransactionClient, proposalId: string) {
  // Coordinate with delivery so a claimed old-owner message cannot be sent after reassignment.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(current_schema() || ':notification-flush', 0))::text`
  const rows = await tx.notificationOutbox.findMany({ where: { payload: { path: ['proposalId'], equals: proposalId }, status: { not: 'SENT' } }, include: { deliveryLog: true } })
  for (const row of rows) {
    await tx.notificationLog.upsert({ where: { outboxId: row.id }, create: { outboxId: row.id, state: 'SKIPPED', safeError: '接单记录状态或指派已改变，不再发送或重试' }, update: { state: 'SKIPPED', safeError: '接单记录状态或指派已改变，不再发送或重试；已有回执保留' } })
    await tx.notificationOutbox.update({ where: { id: row.id }, data: { status: 'FAILED' } })
  }
}
export async function saveProposal(tx: Prisma.TransactionClient, actor: Actor, input: ProjectInput, demandId?: string) {
  await validateProjectMembers(tx, input)
  const old = demandId ? await tx.projectProposal.findUnique({ where: { demandId } }) : null
  if (old && old.status !== 'returned') throw new AppError(409, 'INVALID_STATE', '接单记录当前不可重提')
  if (old) await clearProposalNotifications(tx, old.id)
  const data = { name: input.name, department: input.department, priority: input.priority,
    primaryOwnerId: input.primaryOwnerId, collaboratorIds: input.collaboratorIds,
    approvedLaunchDate: new Date(input.approvedLaunchDate), status: 'pending', reviewReason: '' }
  const row = old ? await tx.projectProposal.update({ where: { id: old.id }, data: { ...data, version: { increment: 1 } } }) :
    await tx.projectProposal.create({ data: { ...data, requestId: input.requestId, demandId, createdBy: actor.id } })
  await auditProposal(tx, actor, row, old ? 'resubmit' : 'create', '', old)
  await lifecycleEvent(tx, { eventType: 'PROPOSAL_ASSIGNED', requestId: `${actor.id}:${input.requestId}`, proposalId: row.id,
    demandId, name: row.name, recipientIds: [row.primaryOwnerId] })
  return { id: row.id, proposalId: row.id, version: row.version, status: row.status }
}
async function lockedProposal(tx: Prisma.TransactionClient, id: string, version: number) {
  // Same global and demand-first lock order as demand deletion and approval.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(current_schema() || ':notification-flush', 0))::text`
  const candidate = await tx.projectProposal.findUnique({ where: { id } })
  if (candidate?.demandId) await tx.$queryRaw`SELECT id FROM demands WHERE id = ${candidate.demandId} FOR UPDATE`
  await tx.$queryRaw`SELECT id FROM project_proposals WHERE id = ${id} FOR UPDATE`
  const row = await tx.projectProposal.findUnique({ where: { id } })
  if (!row) throw new AppError(404, 'PROPOSAL_NOT_FOUND', '接单记录不存在')
  if (row.version !== version) throw new AppError(409, 'VERSION_CONFLICT', '记录已更新，请刷新后重试')
  return row
}
export class ProposalService {
  constructor(private readonly db: PrismaClient, private readonly approverId = '') {}
  async confirm(actor: Actor, id: string, body: unknown) {
    const input = proposalConfirmSchema.parse(body)
    return command(this.db, actor, input.requestId, { operation: 'confirm-proposal', id, input }, async tx => {
      const row = await lockedProposal(tx, id, input.version)
      if (row.primaryOwnerId !== actor.id) throw new AppError(403, 'FORBIDDEN', '仅指定主负责工程师可以确认接单')
      if (row.status !== 'pending') throw new AppError(409, 'INVALID_STATE', '仅待确认记录可以接单或退回')
      await validateProjectMembers(tx, { primaryOwnerId: row.primaryOwnerId, collaboratorIds: [] })
      await clearProposalNotifications(tx, id)
      if (row.demandId) {
        const demand = await tx.demand.findUniqueOrThrow({ where: { id: row.demandId }, include: { project: true } })
        if (demand.status !== 'AWAITING_ENGINEER' || demand.project) throw new AppError(409, 'INVALID_STATE', '需求已不在等待接单状态')
      }
      let projectId: string | null = null
      if (input.decision === 'accept') {
        const project = await createProject(tx, { ...row, requestId: row.requestId, priority: row.priority as ProjectInput['priority'], approvedLaunchDate: row.approvedLaunchDate.toISOString().slice(0, 10) }, row.demandId ?? undefined)
        projectId = project.id
        if (row.demandId) await tx.demand.update({ where: { id: row.demandId }, data: { status: 'APPROVED', version: { increment: 1 } } })
        const demand = row.demandId ? await tx.demand.findUniqueOrThrow({ where: { id: row.demandId } }) : null
        await lifecycleEvent(tx, { eventType: demand ? 'DEMAND_APPROVED' : 'PROJECT_ASSIGNED', requestId: `${actor.id}:${input.requestId}`,
          demandId: row.demandId ?? undefined, projectId, recipientIds: [...(demand ? [demand.ownerId] : []), row.primaryOwnerId, ...row.collaboratorIds] })
      } else {
        if (row.demandId) await tx.demand.update({ where: { id: row.demandId }, data: { status: 'PENDING', reviewReason: `工程师退回管理评估：${input.reason}`, reviewedBy: actor.id, reviewedAt: new Date(), version: { increment: 1 } } })
        const recipients = await projectApproverRecipients(tx, this.approverId)
        await lifecycleEvent(tx, { eventType: 'PROPOSAL_RETURNED', requestId: `${actor.id}:${input.requestId}`, proposalId: id,
          demandId: row.demandId ?? undefined, name: row.name, reason: input.reason, recipientIds: recipients })
      }
      const updated = await tx.projectProposal.update({ where: { id }, data: { status: input.decision === 'accept' ? 'confirmed' : 'returned', projectId,
        reviewReason: input.decision === 'return' ? input.reason : '', version: { increment: 1 } } })
      await auditProposal(tx, actor, updated, input.decision, updated.reviewReason, row)
      return { id, proposalId: id, projectId, version: updated.version, status: updated.status }
    })
  }
  async resubmit(actor: Actor, id: string, body: unknown) {
    await assertProjectApprover(this.db, actor, this.approverId)
    const input = proposalResubmitSchema.parse(body)
    return command(this.db, actor, input.requestId, { operation: 'resubmit-proposal', id, input }, async tx => {
      await assertProjectApprover(tx, actor, this.approverId)
      const row = await lockedProposal(tx, id, input.version)
      if (!['pending', 'returned'].includes(row.status)) throw new AppError(409, 'INVALID_STATE', '已接单记录不可重提')
      await validateProjectMembers(tx, input)
      await clearProposalNotifications(tx, id)
      if (row.demandId) {
        const demand = await tx.demand.findUniqueOrThrow({ where: { id: row.demandId } })
        if (!['PENDING', 'AWAITING_ENGINEER'].includes(demand.status)) throw new AppError(409, 'INVALID_STATE', '需求已撤回或退回业务，需重新评估')
        await tx.demand.update({ where: { id: row.demandId }, data: { status: 'AWAITING_ENGINEER', reviewReason: null, reviewedBy: actor.id, reviewedAt: new Date(), version: { increment: 1 } } })
      }
      const updated = await tx.projectProposal.update({ where: { id }, data: { name: input.name, department: input.department,
        priority: input.priority, primaryOwnerId: input.primaryOwnerId, collaboratorIds: input.collaboratorIds,
        approvedLaunchDate: new Date(input.approvedLaunchDate), status: 'pending', reviewReason: '', version: { increment: 1 } } })
      await auditProposal(tx, actor, updated, 'resubmit', '', row)
      await lifecycleEvent(tx, { eventType: 'PROPOSAL_ASSIGNED', requestId: `${actor.id}:${input.requestId}`, proposalId: id,
        demandId: row.demandId ?? undefined, name: updated.name, recipientIds: [updated.primaryOwnerId] })
      return { id, proposalId: id, version: updated.version, status: updated.status }
    })
  }
  async delete(actor: Actor, id: string, body: unknown) {
    assertManager(actor)
    const input = commandSchema.parse(body)
    return command(this.db, actor, input.requestId, { operation: 'delete-proposal', id, input }, async tx => {
      const row = await lockedProposal(tx, id, input.version)
      if (row.demandId || row.status === 'confirmed') throw new AppError(409, 'INVALID_STATE', '请通过关联需求或正式项目删除')
      await clearProposalNotifications(tx, id)
      await auditProposal(tx, actor, row, 'delete', '', row)
      await tx.projectProposal.delete({ where: { id } })
      return { id, version: row.version + 1, deleted: true }
    })
  }
}
