type Cleanup = {
  cleanupExpired(): Promise<{ cleaned: number; failed: string[] }>
}
type Log = {
  warn(data: object, message: string): void
  error(message: string): void
}
export async function runAttachmentCleanup(service: Cleanup, log: Log): Promise<void> {
  try {
    const result = await service.cleanupExpired()
    if (result.failed.length)
      log.warn({ failedCount: result.failed.length }, '部分过期附件清理失败，下次周期重试')
  } catch {
    log.error('过期附件清理失败，将在下次周期重试')
  }
}
