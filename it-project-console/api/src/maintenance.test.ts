import { expect, it, vi } from 'vitest'
import { runAttachmentCleanup } from './maintenance.js'
it('逐项清理失败记录脱敏数量，整批失败记录可重试日志', async () => {
  const log = { warn: vi.fn(), error: vi.fn() }
  await runAttachmentCleanup(
    { cleanupExpired: async () => ({ cleaned: 1, failed: ['private-id'] }) },
    log
  )
  expect(log.warn).toHaveBeenCalledWith({ failedCount: 1 }, expect.stringContaining('重试'))
  expect(JSON.stringify(log.warn.mock.calls)).not.toContain('private-id')
  await runAttachmentCleanup(
    {
      cleanupExpired: async () => {
        throw new Error('private connection string')
      }
    },
    log
  )
  expect(log.error).toHaveBeenCalledWith(expect.stringContaining('重试'))
  expect(JSON.stringify(log.error.mock.calls)).not.toContain('connection')
})
