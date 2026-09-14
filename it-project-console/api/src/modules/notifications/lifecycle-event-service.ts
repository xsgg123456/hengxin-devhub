import type { Prisma } from '../../generated/prisma/client.js'
export async function lifecycleEvent(
  tx: Prisma.TransactionClient,
  input: { eventType: string; requestId: string; recipientIds: string[]; demandId?: string; projectId?: string; reason?: string; proposalId?: string; name?: string; acceptanceRound?: number }
) {
  const { recipientIds, requestId, eventType, demandId, projectId, reason, proposalId, name, acceptanceRound } = input
  await tx.notificationOutbox.createMany({ data: [...new Set(recipientIds)].map(recipientId => ({
    recipientId, eventType, demandId, projectId,
    idempotencyKey: `${requestId}:${eventType}:${recipientId}`,
    payload: { acceptanceRound: acceptanceRound ?? null, proposalId: proposalId ?? null, name: name ?? null, eventType, demandId: demandId ?? null, projectId: projectId ?? null, reason: reason ?? null }
  })) })
}
