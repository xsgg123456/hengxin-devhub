import type { PrismaClient } from '../../generated/prisma/client.js'
import type { Actor } from '../../plugins/auth.js'
import { AppError } from '../../lib/errors.js'
import { assertManager, command, lockedDemand } from '../../lib/business-command.js'
import { reviewSchema } from '../projects/project-schemas.js'
import { createProject } from '../projects/project-service.js'
import { demandData } from '../demands/demand-materials.js'
import { lifecycleEvent } from '../notifications/lifecycle-event-service.js'

export class ApprovalService {
  constructor(private readonly db: PrismaClient) {}
  async review(actor: Actor, id: string, body: unknown) {
    assertManager(actor)
    const input = reviewSchema.parse(body)
    return command(this.db, actor, input.requestId, { operation: 'review-demand', id, input }, async tx => {
      const demand = await lockedDemand(tx, id, input.version)
      if (demand.status !== 'PENDING' || demand.project) throw new AppError(409, 'INVALID_STATE', '仅待评估需求可处理')
      const reviewedAt = new Date()
      if (input.decision === 'approve') {
        // Revalidate persisted materials, but the original submission date may now be in the past.
        if (!demand.name || !demand.description || !demand.expectedLaunchDate ||
          !(demand.prdUrl || demand.prdAttachmentId) || !(demand.prototypeUrl || demand.prototypeAttachmentId))
          throw new AppError(400, 'MISSING_FIELDS', '需求材料不完整')
        await demandData(tx, id, {
          requestId: input.requestId, name: demand.name, description: demand.description, submit: false,
          expectedLaunchDate: demand.expectedLaunchDate.toISOString().slice(0, 10),
          prd: demand.prdAttachmentId ? { kind: 'file', attachmentId: demand.prdAttachmentId } : { kind: 'link', url: demand.prdUrl! },
          prototype: demand.prototypeAttachmentId ? { kind: 'file', attachmentId: demand.prototypeAttachmentId } : { kind: 'link', url: demand.prototypeUrl! }
        })
        const project = await createProject(tx, { ...input, name: demand.name, department: demand.department }, id)
        const updated = await tx.demand.update({ where: { id }, data: {
          status: 'APPROVED', reviewedAt, reviewedBy: actor.id, reviewReason: null, version: { increment: 1 }
        } })
        await lifecycleEvent(tx, { eventType: 'DEMAND_APPROVED', requestId: `${actor.id}:${input.requestId}`,
          demandId: id, projectId: project.id, recipientIds: [demand.ownerId, input.primaryOwnerId, ...input.collaboratorIds] })
        return { id, version: updated.version, projectId: project.id, status: updated.status }
      }
      const updated = await tx.demand.update({ where: { id }, data: {
        status: input.decision === 'return' ? 'RETURNED' : 'REJECTED', reviewReason: input.reason,
        reviewedAt, reviewedBy: actor.id, version: { increment: 1 }
      } })
      await lifecycleEvent(tx, { eventType: input.decision === 'return' ? 'DEMAND_RETURNED' : 'DEMAND_REJECTED',
        requestId: `${actor.id}:${input.requestId}`, demandId: id, reason: input.reason, recipientIds: [demand.ownerId] })
      return { id, version: updated.version, status: updated.status }
    })
  }
}
