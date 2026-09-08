import type { Prisma } from '../../generated/prisma/client.js'
export async function lifecycleEvent(
  tx: Prisma.TransactionClient,
  input: { eventType: string; requestId: string; recipientIds: string[]; demandId?: string; projectId?: string; reason?: string }
) {
  const { recipientIds, requestId, eventType, demandId, projectId, reason } = input
  await tx.notificationOutbox.createMany({ data: [...new Set(recipientIds)].map(recipientId => ({
    recipientId, eventType, demandId, projectId,
    idempotencyKey: `${requestId}:${eventType}:${recipientId}`,
    payload: { eventType, demandId: demandId ?? null, projectId: projectId ?? null, reason: reason ?? null }
  })) })
}
