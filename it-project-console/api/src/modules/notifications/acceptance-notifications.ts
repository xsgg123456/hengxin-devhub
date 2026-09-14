import type { Prisma } from '../../generated/prisma/client.js'
// Caller holds notification-flush lock. Accepted/sending messages retain receipt handling.
export async function cancelAcceptanceNotifications(tx: Prisma.TransactionClient, projectId: string) {
  const items = await tx.notificationOutbox.findMany({ where: { projectId,
    eventType: { in: ['ACCEPTANCE_SUBMITTED', 'ACCEPTANCE_RETURNED'] }, status: { not: 'SENT' },
    OR: [{ deliveryLog: null }, { deliveryLog: { taskId: null, state: { in: ['CLAIMED', 'RETRY'] } } }]
  }, select: { id: true } })
  for (const item of items) {
    await tx.notificationLog.upsert({ where: { outboxId: item.id },
      create: { outboxId: item.id, state: 'SKIPPED', safeError: '验收状态已变化，旧待办通知失效' },
      update: { state: 'SKIPPED', safeError: '验收状态已变化，旧待办通知失效' } })
  }
  await tx.notificationOutbox.updateMany({ where: { id: { in: items.map(item => item.id) } }, data: { status: 'FAILED' } })
}
