import { describe, expect, it, vi } from 'vitest'
import { saveDemand } from './demand-service'
import { saveLiveDemand } from './live-demand-service'
import { apiRequest } from './api-client'
import { fresh, demandInput } from './workflow-fixtures'
vi.mock('./api-client', () => ({ apiRequest: vi.fn() }))
describe('需求首次提出日期录入', () => {
  it('未知不自动填，重提保留原日期，显式空值清空', () => {
    const snapshot = fresh()
    const demand = saveDemand(snapshot, { ...demandInput, firstRequestedOn: '2026-08-01' })
    saveDemand(snapshot, { ...demandInput, id: demand.id, requestId: 'resubmit', now: '2026-09-09T00:00:00Z' })
    expect(demand.firstRequestedOn).toBe('2026-08-01')
    saveDemand(snapshot, { ...demandInput, id: demand.id, requestId: 'clear', firstRequestedOn: null })
    expect(demand.firstRequestedOn).toBe('')
    expect(saveDemand(fresh(), demandInput).firstRequestedOn).toBe('')
  })
  it.each(['2026-09-09', '2026-02-30'])('拒绝未来或无效日期 %s', firstRequestedOn => {
    expect(() => saveDemand(fresh(), { ...demandInput, firstRequestedOn })).toThrow('日期')
  })
  it.each(['2026-08-01', '', null])('正式创建及编辑传递真实可空日期 %s', async firstRequestedOn => {
    for (const id of [undefined, 'demand-id']) {
      await saveLiveDemand({ ...demandInput, firstRequestedOn, prototype: null }, 'request-key', true, id, 4)
      expect(apiRequest).toHaveBeenLastCalledWith(id ? '/demands/' + id : '/demands', expect.objectContaining({ body: expect.objectContaining({ firstRequestedOn }) }))
    }
  })
})
