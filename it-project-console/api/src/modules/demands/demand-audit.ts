import type { Demand, Prisma } from '../../generated/prisma/client.js'
import type { Actor } from '../../plugins/auth.js'

function snapshot(row: Demand) {
  return { status: row.status, version: row.version, reviewReason: row.reviewReason ?? '',
    firstRequestedOn: row.firstRequestedOn?.toISOString().slice(0, 10) ?? '',
    submittedAt: row.submittedAt?.toISOString() ?? '' }
}

export async function auditDemand(tx: Prisma.TransactionClient, actor: Actor, row: Demand,
  action: 'submit' | 'resubmit' | 'return' | 'reject' | 'withdraw', reason: string, previous?: Demand) {
  await tx.lifecycleEvent.create({ data: {
    entityType: 'demand', entityId: row.id, authorId: actor.id, action, reason,
    before: previous ? snapshot(previous) : {}, after: snapshot(row)
  } })
}
