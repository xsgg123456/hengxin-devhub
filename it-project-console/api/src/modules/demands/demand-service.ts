import { randomUUID } from 'node:crypto'
import type { PrismaClient, Demand } from '../../generated/prisma/client.js'
import type { Actor } from '../../plugins/auth.js'
import { AppError } from '../../lib/errors.js'
import { command, lockedDemand } from '../../lib/business-command.js'
import { demandSchema, demandUpdateSchema, commandSchema } from './demand-schemas.js'
import { demandData, queueAttachmentDeletion } from './demand-materials.js'

function assertOwner(actor: Actor, demand: Demand) {
  if (demand.ownerId !== actor.id) throw new AppError(403, 'FORBIDDEN', '只有提交人可以维护需求')
  if (!['DRAFT', 'PENDING', 'RETURNED', 'WITHDRAWN'].includes(demand.status))
    throw new AppError(409, 'READ_ONLY', '当前需求不可编辑')
}
export class DemandService {
  constructor(private readonly db: PrismaClient) {}
  async create(actor: Actor, body: unknown) {
    const input = demandSchema.parse(body)
    return command(this.db, actor, input.requestId, { operation: 'create-demand', input }, async tx => {
      const id = randomUUID()
      const data = await demandData(tx, id, input)
      const row = await tx.demand.create({ data: {
        ...data, id, ownerId: actor.id, department: actor.department, requestId: input.requestId,
        status: input.submit ? 'PENDING' : 'DRAFT', submittedAt: input.submit ? new Date() : null
      } })
      return { id: row.id, version: row.version, status: row.status }
    })
  }
  async save(actor: Actor, id: string, body: unknown) {
    const input = demandUpdateSchema.parse(body)
    return command(this.db, actor, input.requestId, { operation: 'save-demand', id, input }, async tx => {
      const old = await lockedDemand(tx, id, input.version)
      assertOwner(actor, old)
      if (old.project) throw new AppError(409, 'READ_ONLY', '已关联项目的需求不可编辑')
      const data = await demandData(tx, id, { ...input, submit: input.submit || old.status === 'PENDING' }, old)
      const row = await tx.demand.update({ where: { id }, data: {
        ...data, status: input.submit ? 'PENDING' : old.status === 'PENDING' ? 'PENDING' : old.status,
        submittedAt: input.submit ? new Date() : old.submittedAt,
        reviewReason: input.submit ? null : old.reviewReason, version: { increment: 1 }
      } })
      const kept = data.attachmentIds
      const removed = [...new Set([...old.attachmentIds, old.prdAttachmentId, old.prototypeAttachmentId])].filter((item): item is string => !!item && !kept.includes(item))
      await queueAttachmentDeletion(tx, removed)
      return { id: row.id, version: row.version, status: row.status }
    })
  }
  async withdraw(actor: Actor, id: string, body: unknown) {
    const input = commandSchema.parse(body)
    return command(this.db, actor, input.requestId, { operation: 'withdraw-demand', id, input }, async tx => {
      const old = await lockedDemand(tx, id, input.version)
      assertOwner(actor, old)
      if (!['PENDING', 'RETURNED'].includes(old.status) || old.project)
        throw new AppError(409, 'INVALID_STATE', '仅待评估或退回补充需求可撤回')
      const row = await tx.demand.update({ where: { id }, data: { status: 'WITHDRAWN', version: { increment: 1 } } })
      return { id: row.id, version: row.version, status: row.status }
    })
  }
}
