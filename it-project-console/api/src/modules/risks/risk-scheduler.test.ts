import { beforeEach, expect, it, vi } from 'vitest'
import { startRiskScheduler } from './risk-scheduler.js'
const state = vi.hoisted(() => ({
  tick: undefined as undefined | (() => Promise<void>),
  destroy: vi.fn()
}))
vi.mock('node-cron', () => ({
  default: {
    schedule: vi.fn((_expression: string, callback: () => Promise<void>) => {
      state.tick = callback
      return { destroy: state.destroy }
    })
  }
}))
beforeEach(() => {
  vi.clearAllMocks()
})
it('启动立即扫描且在任务尚未完成时不重叠，停止等待在途任务', async () => {
  let release!: () => void
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  const scan = vi.fn(() => pending),
    log = { error: vi.fn() }
  const stop = startRiskScheduler(scan, '* * * * *', log)
  const overlap = state.tick!()
  expect(scan).toHaveBeenCalledTimes(1)
  let stopped = false
  const closing = stop().then(() => {
    stopped = true
  })
  await Promise.resolve()
  expect(stopped).toBe(false)
  release()
  await overlap
  await closing
  expect(state.destroy).toHaveBeenCalledTimes(1)
  expect(log.error).not.toHaveBeenCalled()
})
it('扫描失败只记录脱敏错误，下一周期可重试', async () => {
  const scan = vi
    .fn()
    .mockRejectedValueOnce(new Error('private connection'))
    .mockResolvedValue(undefined)
  const log = { error: vi.fn() }
  const stop = startRiskScheduler(scan, '* * * * *', log)
  await state.tick!()
  expect(log.error).toHaveBeenCalledWith('风险扫描失败，下次周期重试')
  await state.tick!()
  expect(scan).toHaveBeenCalledTimes(2)
  await stop()
})
