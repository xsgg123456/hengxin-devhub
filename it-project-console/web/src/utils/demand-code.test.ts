import { describe, expect, it } from 'vitest'
import { fresh, demandInput } from '@/services/workflow-fixtures'
import { saveDemand } from '@/services/demand-service'
import { actionDemand } from '@/services/lifecycle-service'
import { migratePrototypeSnapshot } from '@/repositories/prototype-migration'
import { backfillDemandCodes, demandCode, nextDemandCode } from './demand-code'

describe('需求公开编号', () => {
  it('草稿首次取号，跨年提交和编辑不改号，重复请求不消耗编号', () => {
    const s = fresh()
    const draft = saveDemand(s, { ...demandInput, submit: false, now: '2026-12-31T15:59:59Z' })
    expect(draft.code).toMatch(/^XQ-2026-\d{4}$/)
    const before = structuredClone(s.database.demandCodeCounters)
    expect(saveDemand(s, { ...demandInput })).toBe(draft)
    expect(s.database.demandCodeCounters).toEqual(before)
    const updated = saveDemand(s, { ...demandInput, id: draft.id, expectedLaunchDate: '2099-01-01', now: '2026-12-31T16:00:00Z' })
    expect(updated.code).toBe(draft.code)
    expect(updated.createdAt).toBe('2026-12-31T15:59:59Z')
    expect(s.database.demandCodeCounters).toEqual(before)
  })
  it('删除并重新加载后不会复用编号，上海跨年和超过四位正常', () => {
    const s = fresh()
    const d = saveDemand(s, demandInput)
    const code = d.code!
    actionDemand(s, { demandId: d.id, action: 'delete' })
    const reloaded = migratePrototypeSnapshot(s)
    const next = saveDemand(reloaded, { ...demandInput, requestId: 'new' })
    expect(Number(next.code!.split('-')[2])).toBe(Number(code.split('-')[2]) + 1)
    expect(nextDemandCode(reloaded.database, '2026-12-31T16:00:00Z')).toBe('XQ-2027-0001')
    reloaded.database.demandCodeCounters!['2027'] = 9999
    expect(nextDemandCode(reloaded.database, '2027-01-01T00:00:00Z')).toBe('XQ-2027-10000')
  })
  it('旧需求稳定回填，缺时间草稿有固定基准，迁移幂等且不改内部关联', () => {
    const s = fresh()
    const source = s.database.demands[0]
    s.database.demands = ['b', 'a', 'c'].map(id => ({ ...source, code: undefined, createdAt: undefined, id, submittedAt: id === 'c' ? '' : '2026-01-02T00:00:00Z' }))
    delete s.database.demandCodeCounters
    const migrated = migratePrototypeSnapshot(s)
    expect(migrated.database.demands.map(d => [d.id, d.code])).toEqual([
      ['b', 'XQ-2026-0003'], ['a', 'XQ-2026-0002'], ['c', 'XQ-2026-0001']
    ])
    expect(migrated.database.projects).toEqual(s.database.projects)
    expect(migratePrototypeSnapshot(migrated)).toEqual(migrated)
  })
  it('缺号显示待同步，重复编号和无效计数不静默接受', () => {
    expect(demandCode({})).toBe('编号待同步')
    const s = fresh()
    s.database.demands[1].code = s.database.demands[0].code
    expect(() => backfillDemandCodes(s.database)).toThrow('需求编号无效或重复')
    s.database.demandCodeCounters = { '2026': -1 }
    expect(() => backfillDemandCodes(s.database)).toThrow('需求编号计数无效')
  })
})
