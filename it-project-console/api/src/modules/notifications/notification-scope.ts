import { createHash } from 'node:crypto'
import type { Prisma, PrismaClient } from '../../generated/prisma/client.js'

export type NotificationScope = { startAt?: Date; recipientUserIds?: string[] }
export function recipientScope(scope: NotificationScope): Prisma.UserWhereInput {
  return scope.recipientUserIds ? { dingUserId: { in: scope.recipientUserIds } } : {}
}
export function scopeKey(scope: NotificationScope) {
  if (!scope.startAt && !scope.recipientUserIds) return ''
  return ':' + createHash('sha256').update(JSON.stringify({
    start: scope.startAt?.toISOString(), users: scope.recipientUserIds ? [...scope.recipientUserIds].sort() : null
  })).digest('hex').slice(0, 24)
}

// Bounded cleanup under the same lock as sending/deletion. Never cancel an in-flight receipt.
export async function skipHistoricalNotifications(db: PrismaClient, scope: NotificationScope) {
  if (!scope.startAt) return
  await db.$transaction(async tx => {
    const [lock] = await tx.$queryRaw<Array<{ acquired: boolean }>>
      `SELECT pg_try_advisory_xact_lock(hashtextextended(current_schema() || ':notification-flush', 0)) AS acquired`
    if (!lock?.acquired) return
    const items = await tx.notificationOutbox.findMany({ where: {
      createdAt: { lt: scope.startAt }, status: 'PENDING', attempts: 0, deliveryLog: null,
      recipient: recipientScope(scope)
    }, select: { id: true }, take: 100, orderBy: { createdAt: 'asc' } })
    for (const item of items) {
      await tx.notificationLog.create({ data: { outboxId: item.id, state: 'SKIPPED', channel: 'robot', safeError: '早于机器人启用时间，历史通知不补发' } })
    }
    await tx.notificationOutbox.updateMany({ where: { id: { in: items.map(item => item.id) } }, data: { status: 'FAILED' } })
  })
}
