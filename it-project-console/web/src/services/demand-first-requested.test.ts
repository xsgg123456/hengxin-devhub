import { describe, expect, it, vi } from 'vitest'
import { saveDemand } from './demand-service'
import { saveLiveDemand } from './live-demand-service'
import { apiRequest } from './api-client'
import { fresh, demandInput } from './workflow-fixtures'
vi.mock('./api-client', () => ({ apiRequest: vi.fn() }))
describe('需求首次提出日期自动记录', () => {
  it('保存草稿无提交时间，首次提交按上海日期记录', () => {
    const snapshot = fresh()
    const demand = saveDemand(snapshot, { ...demandInput, submit: false })
    expect(demand.firstRequestedOn).toBe('')
    expect(demand.submittedAt).toBe('')
    saveDemand(snapshot, { ...demandInput, id: demand.id, now: '2026-09-09T16:00:00Z' })
    expect(demand.firstRequestedOn).toBe('2026-09-10')
  })
  it.each(['returned', 'withdrawn', 'pending'] as const)('%s重提和资料保存保留首次日期', status => {
    const snapshot = fresh()
    const demand = saveDemand(snapshot, demandInput)
    demand.status = status
    saveDemand(snapshot, { ...demandInput, id: demand.id, requestId: 'resubmit', now: '2026-09-09T16:00:00Z' })
    expect(demand.firstRequestedOn).toBe('2026-09-08')
    saveDemand(snapshot, { ...demandInput, id: demand.id, requestId: 'edit', submit: false })
    expect(demand.firstRequestedOn).toBe('2026-09-08')
    expect(demand.status).toBe('pending')
    saveDemand(snapshot, { ...demandInput, id: demand.id, requestId: 'again', now: '2026-09-11T00:00:00Z' })
    expect(demand.firstRequestedOn).toBe('2026-09-08')
  })
  it('历史补录日期保留，运行时多余字段不能改写或清空', () => {
    const snapshot = fresh()
    const demand = saveDemand(snapshot, demandInput)
    demand.firstRequestedOn = '2026-07-15'
    for (const firstRequestedOn of ['2026-09-09', null, '']) {
      const input = { ...demandInput, id: demand.id, firstRequestedOn }
      saveDemand(snapshot, input)
      expect(demand.firstRequestedOn).toBe('2026-07-15')
    }
  })
  it.each(['returned', 'withdrawn', 'pending'] as const)('旧%s缺日期重提采用旧提交时间的上海日期', status => {
    const snapshot = fresh()
    const demand = saveDemand(snapshot, demandInput)
    demand.status = status
    demand.firstRequestedOn = ''
    demand.submittedAt = '2026-08-01T16:00:00Z'
    saveDemand(snapshot, { ...demandInput, id: demand.id, now: '2026-09-10T00:00:00Z' })
    expect(demand.firstRequestedOn).toBe('2026-08-02')
  })
  it('旧草稿伪提交时间不影响首次实际提交日', () => {
    const snapshot = fresh()
    const demand = saveDemand(snapshot, { ...demandInput, submit: false })
    demand.submittedAt = '2026-08-01T16:00:00Z'
    saveDemand(snapshot, { ...demandInput, id: demand.id, now: '2026-09-10T00:00:00Z' })
    expect(demand.firstRequestedOn).toBe('2026-09-10')
  })
  it('旧草稿手填日期在保存时清空，首次实际提交自动记录', () => {
    const snapshot = fresh()
    const demand = saveDemand(snapshot, { ...demandInput, submit: false })
    demand.firstRequestedOn = '2026-07-15'
    demand.submittedAt = '2026-08-01T16:00:00Z'
    saveDemand(snapshot, { ...demandInput, id: demand.id, submit: false })
    expect(demand.firstRequestedOn).toBe('')
    demand.firstRequestedOn = '2026-07-15'
    saveDemand(snapshot, { ...demandInput, id: demand.id, now: '2026-09-10T00:00:00Z' })
    expect(demand.firstRequestedOn).toBe('2026-09-10')
  })
  it('失败提交不写日期，重复创建请求保留原日期', () => {
    const snapshot = fresh()
    const draft = saveDemand(snapshot, { ...demandInput, submit: false })
    expect(() => saveDemand(snapshot, { ...demandInput, id: draft.id, description: '' })).toThrow()
    expect(draft.firstRequestedOn).toBe('')
    const submitted = saveDemand(snapshot, { ...demandInput, id: draft.id })
    expect(saveDemand(snapshot, { ...demandInput, now: '2026-09-10T00:00:00Z' })).toBe(submitted)
    expect(submitted.firstRequestedOn).toBe('2026-09-08')
  })
  it.each(['2026-08-01', '', null])('正式创建及编辑白名单剔除运行时日期 %s', async firstRequestedOn => {
    for (const id of [undefined, 'demand-id']) {
      const input = { ...demandInput, firstRequestedOn, prototype: null, injected: 'ignored' }
      await saveLiveDemand(input, 'request-key', true, id, 4)
      const [url, options] = vi.mocked(apiRequest).mock.calls.at(-1)!
      expect(url).toBe(id ? '/demands/' + id : '/demands')
      expect(Object.keys(options!.body as object).sort()).toEqual([
        'name', 'description', 'parentProjectId', 'optimizationOutcome', 'expectedLaunchDate', 'prd', 'prototype', 'requestId', 'submit', ...(id ? ['version'] : [])
      ].sort())
    }
  })
})
