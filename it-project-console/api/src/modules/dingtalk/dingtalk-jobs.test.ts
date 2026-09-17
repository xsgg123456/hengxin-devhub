import type { FastifyBaseLogger } from 'fastify'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { DingtalkDirectory } from './dingtalk-directory.js'
import type { NotificationService } from '../notifications/notification-service.js'

vi.mock('../notifications/notification-job.js', () => ({
  flushNotifications: vi.fn(async () => ({ ok: true }))
}))

import { startDingTalkJobs } from './dingtalk-jobs.js'
import { flushNotifications } from '../notifications/notification-job.js'

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.useRealTimers()
})

it('启动时同步一次，之后每天同步一次而不是每15分钟同步', async () => {
  vi.useFakeTimers()
  const sync = vi.fn(async () => ({ managerMissing: false }))
  const directory = { sync } as unknown as DingtalkDirectory
  const notifications = {} as NotificationService
  const log = { warn: vi.fn(), error: vi.fn() } as unknown as FastifyBaseLogger
  const stop = startDingTalkJobs(directory, notifications, true, log)

  await Promise.resolve()
  expect(sync).toHaveBeenCalledTimes(1)

  await vi.advanceTimersByTimeAsync(15 * 60 * 1000)
  expect(sync).toHaveBeenCalledTimes(1)

  await vi.advanceTimersByTimeAsync(23 * 60 * 60 * 1000 + 45 * 60 * 1000)
  expect(sync).toHaveBeenCalledTimes(2)

  await stop()
})

it('通知投递仍按每60秒执行', async () => {
  vi.useFakeTimers()
  const directory = { sync: vi.fn(async () => ({ managerMissing: false })) } as unknown as DingtalkDirectory
  const notifications = {} as NotificationService
  const log = { warn: vi.fn(), error: vi.fn() } as unknown as FastifyBaseLogger
  const stop = startDingTalkJobs(directory, notifications, true, log)

  await vi.advanceTimersByTimeAsync(59 * 1000)
  expect(flushNotifications).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(1000)
  expect(flushNotifications).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(60 * 1000)
  expect(flushNotifications).toHaveBeenCalledTimes(2)

  await stop()
})
