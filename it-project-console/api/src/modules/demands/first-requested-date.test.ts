import { describe, expect, it, vi } from 'vitest'
import type { Demand, Prisma } from '../../generated/prisma/client.js'
import { demandSchema, firstRequestedDateSchema } from './demand-schemas.js'
import { demandData } from './demand-materials.js'

describe('独立需求首次提出日期', () => {
  it('有效日历、上海今天和未来日期边界', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-14T16:01:00Z'))
    try {
      for (const date of ['2026-02-29', '2026-09-16', '2026-9-15', 'garbage'])
        expect(firstRequestedDateSchema.safeParse(date).success).toBe(false)
      expect(firstRequestedDateSchema.parse('2026-09-15')).toBe('2026-09-15')
      expect(firstRequestedDateSchema.parse('2024-02-29')).toBe('2024-02-29')
      for (const firstRequestedOn of ['', null, undefined])
        expect(demandSchema.safeParse({ requestId: 'draft', name: '', submit: false, firstRequestedOn }).success).toBe(true)
    } finally { vi.useRealTimers() }
  })

  it('不从创建或提交时间补值，省略保留旧值，显式空值可清除', async () => {
    const tx = {} as Prisma.TransactionClient
    const input = demandSchema.parse({ requestId: 'draft', name: '', submit: false })
    const old = { firstRequestedOn: new Date('2024-02-29T00:00:00Z'), attachmentIds: [] } as unknown as Demand
    expect((await demandData(tx, 'id', input)).firstRequestedOn).toBeNull()
    expect((await demandData(tx, 'id', input, old)).firstRequestedOn).toEqual(old.firstRequestedOn)
    for (const firstRequestedOn of ['', null])
      expect((await demandData(tx, 'id', { ...input, firstRequestedOn }, old)).firstRequestedOn).toBeNull()
    expect((await demandData(tx, 'id', { ...input, firstRequestedOn: '2024-02-28' }, old)).firstRequestedOn)
      .toEqual(new Date('2024-02-28T00:00:00Z'))
  })
})
