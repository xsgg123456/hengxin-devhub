import type { Prisma, PrismaClient } from '../../generated/prisma/client.js'
import type { Actor } from '../../plugins/auth.js'
import { command, lockedDemand } from '../../lib/business-command.js'
import { AppError } from '../../lib/errors.js'
import { lockedProject } from '../progress/progress-state.js'
import { commandSchema } from './demand-schemas.js'
import { queueAttachmentDeletion } from './demand-materials.js'

function assertDelete(actor: Actor, ownerId?: string) {
  if (actor.role !== 'MANAGER' && !(actor.role === 'BUSINESS' && actor.id === ownerId))
    throw new AppError(403, 'FORBIDDEN', '只有管理人员或需求本人业务提交人可以删除')
}
function cancellable(row: { status: string; deliveryLog: { state: string; taskId: string | null } | null }) {
  return row.status !== 'SENT' && !row.deliveryLog?.taskId &&
    (!row.deliveryLog || ['CLAIMED', 'RETRY', 'FAILED', 'SKIPPED'].includes(row.deliveryLog.state))
}
async function cancelNotification(tx: Prisma.TransactionClient, id: string) {
  await tx.notificationLog.upsert({ where: { outboxId: id },
    create: { outboxId: id, state: 'SKIPPED', safeError: '需求或项目已删除，取消待发送通知' },
    update: { state: 'SKIPPED', safeError: '需求或项目已删除，取消待发送通知' } })
  await tx.notificationOutbox.update({ where: { id }, data: { status: 'FAILED' } })
}
async function deleteGroup(tx: Prisma.TransactionClient, actor: Actor, demandId: string | null,
  projectId: string | null, reason: string) {
  const references = [...(demandId ? [{ demandId }] : []), ...(projectId ? [{ projectId }] : [])]
  const notifications = await tx.notificationOutbox.findMany({ where: { OR: references }, include: { deliveryLog: true } })
  for (const row of notifications) {
    if (cancellable(row)) await cancelNotification(tx, row.id)
  }
  await tx.notificationOutbox.updateMany({ where: { OR: references }, data: { demandId: null, projectId: null } })
  // A pending digest embeds IDs instead of FK relations: remove only the deleted project.
  if (projectId) {
    const digests = await tx.notificationOutbox.findMany({ where: { eventType: 'MANAGER_RISK_DIGEST', status: { not: 'SENT' } }, include: { deliveryLog: true } })
    for (const digest of digests) {
      const payload = digest.payload
      if (!payload || typeof payload !== 'object' || Array.isArray(payload) || !Array.isArray(payload.projects)) continue
      const projects = payload.projects.filter(row => !row || typeof row !== 'object' || Array.isArray(row) || row.projectId !== projectId)
      if (projects.length === payload.projects.length) continue
      await tx.notificationOutbox.update({ where: { id: digest.id }, data: { payload: { ...payload, projects } as Prisma.InputJsonObject } })
      if (!projects.length && cancellable(digest)) await cancelNotification(tx, digest.id)
    }
  }
  if (demandId) {
    const attachments = await tx.attachment.findMany({ where: { demandId }, select: { id: true } })
    await queueAttachmentDeletion(tx, attachments.map(row => row.id))
  }
  if (projectId) await tx.project.delete({ where: { id: projectId } })
  if (demandId) await tx.demand.delete({ where: { id: demandId } })
  for (const [entityType, entityId] of [['demand', demandId], ['project', projectId]] as const) {
    if (!entityId) continue
    await tx.lifecycleEvent.create({ data: { entityType, entityId, authorId: actor.id, action: 'delete', reason,
      before: { demandId, projectId }, after: { deleted: true } } })
    await tx.auditLog.create({ data: { actorId: actor.id, action: 'delete', entityType, entityId,
      payload: { demandId, projectId, reason } } })
  }
}
export async function deleteDemand(db: PrismaClient, actor: Actor, id: string, body: unknown) {
  const input = commandSchema.parse(body)
  return command(db, actor, input.requestId, { operation: 'delete-demand', id, input }, async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(current_schema() || ':notification-flush', 0))::text`
    const demand = await lockedDemand(tx, id, input.version)
    assertDelete(actor, demand.ownerId)
    if (demand.project) await tx.$queryRaw`SELECT id FROM projects WHERE id = ${demand.project.id} FOR UPDATE`
    await deleteGroup(tx, actor, id, demand.project?.id ?? null, '')
    return { id, version: demand.version + 1, deleted: true }
  })
}
/** Always lock the demand before its project, matching approval and demand deletion. */
export async function deleteProjectGroup(tx: Prisma.TransactionClient, actor: Actor, id: string, version: number, reason = '') {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(current_schema() || ':notification-flush', 0))::text`
  const candidate = await tx.project.findUnique({ where: { id }, select: { demandId: true } })
  if (!candidate) throw new AppError(404, 'PROJECT_NOT_FOUND', '项目不存在')
  if (candidate.demandId) await tx.$queryRaw`SELECT id FROM demands WHERE id = ${candidate.demandId} FOR UPDATE`
  const project = await lockedProject(tx, id, version)
  const demand = project.demandId ? await tx.demand.findUnique({ where: { id: project.demandId } }) : null
  assertDelete(actor, demand?.ownerId)
  await deleteGroup(tx, actor, project.demandId, id, reason)
  return { id, deleted: true, version: project.version + 1 }
}
