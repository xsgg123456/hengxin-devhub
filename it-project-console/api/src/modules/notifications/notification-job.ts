import type { NotificationService } from './notification-service.js'

/** Scheduling failures must remain separate from lifecycle business transactions. */
export async function flushNotifications(service: NotificationService) {
  try { return { ok: true as const, ...await service.flush() } }
  catch { return { ok: false as const, error: '通知投递任务失败，请检查脱敏投递记录' } }
}
