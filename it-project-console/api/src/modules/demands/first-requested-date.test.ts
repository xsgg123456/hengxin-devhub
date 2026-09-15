import { describe, expect, it, vi } from 'vitest'
import { demandSchema, demandUpdateSchema, firstRequestedDateSchema } from './demand-schemas.js'
import { automaticFirstRequestedOn } from './demand-materials.js'

describe('独立需求首次提出日期', () => {
  it('有效日历、上海今天和未来日期边界', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-14T16:01:00Z'))
    try {
      for (const date of ['2026-02-29', '2026-09-16', '2026-9-15', 'garbage'])
        expect(firstRequestedDateSchema.safeParse(date).success).toBe(false)
      expect(firstRequestedDateSchema.parse('2026-09-15')).toBe('2026-09-15')
      expect(firstRequestedDateSchema.parse('2024-02-29')).toBe('2024-02-29')
      for (const firstRequestedOn of ['', null, undefined, '2024-02-29']) {
        expect(demandSchema.safeParse({ requestId: 'draft', name: '', submit: false, firstRequestedOn }).success).toBe(false)
        expect(demandUpdateSchema.safeParse({ requestId: 'draft', name: '', submit: false, version: 1, firstRequestedOn }).success).toBe(false)
      }
    } finally { vi.useRealTimers() }
  })

  it('草稿不记日期，首次提交按上海日期记录，重提与历史补录值保留', () => {
    const now = new Date('2026-09-14T16:01:00Z')
    expect(automaticFirstRequestedOn(undefined, false, now)).toBeNull()
    expect(automaticFirstRequestedOn(undefined, true, now)?.toISOString()).toBe('2026-09-15T00:00:00.000Z')
    const old = { firstRequestedOn: new Date('2024-02-29T00:00:00Z'), submittedAt: new Date('2026-09-14T16:01:00Z'), status:'RETURNED' as const }
    expect(automaticFirstRequestedOn(old, true, now)).toEqual(old.firstRequestedOn)
    expect(automaticFirstRequestedOn(old, false, now)).toEqual(old.firstRequestedOn)
    expect(automaticFirstRequestedOn({firstRequestedOn:null,submittedAt:new Date('2026-09-01T16:01:00Z'),status:'RETURNED'},true,now)?.toISOString()).toBe('2026-09-02T00:00:00.000Z')
    const draft={...old,submittedAt:null,status:'DRAFT' as const}
    expect(automaticFirstRequestedOn(draft,false,now)).toBeNull()
    expect(automaticFirstRequestedOn(draft,true,now)?.toISOString()).toBe('2026-09-15T00:00:00.000Z')
  })
})
