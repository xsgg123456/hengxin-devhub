import { expect, it, vi } from 'vitest'
import { apiRequest } from './api-client'
import { registerLiveHistoricalDelivery } from './historical-delivery-service'
import { liveOperationKey } from './live-demand-service'
vi.mock('./api-client', () => ({ apiRequest: vi.fn() }))
it('独立历史交付接口只传实际日期原因版本和稳定请求编号，断网原样重试', async () => {
  const payload = { projectId: 'p1', version: 4, deliveredOn: '2026-09-01', reason: '核对旧记录' }
  const key = liveOperationKey()
  const api = vi.mocked(apiRequest)
  api.mockRejectedValueOnce(new Error('断网'))
  await expect(registerLiveHistoricalDelivery({ ...payload, requestId: key(payload) })).rejects.toThrow('断网')
  api.mockResolvedValueOnce({ id: 'p1', version: 5 })
  await expect(registerLiveHistoricalDelivery({ ...payload, requestId: key(payload) })).resolves.toEqual({ id: 'p1', version: 5 })
  expect(api.mock.calls[0]).toEqual(api.mock.calls[1])
  expect(api).toHaveBeenLastCalledWith('/projects/p1/historical-delivery', { method: 'POST', body: { version: 4, deliveredOn: '2026-09-01', reason: '核对旧记录', requestId: key(payload) } })
})
