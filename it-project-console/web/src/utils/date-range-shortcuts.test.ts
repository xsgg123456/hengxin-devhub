import { describe, expect, it, vi } from 'vitest'
import { businessDateRange, dateRangeShortcuts } from './date-range-shortcuts'

describe('业务日期快捷筛选', () => {
  it('上海午夜切日，不依赖浏览器时区', () => {
    expect(businessDateRange('今日', new Date('2026-12-31T15:59:59Z'))).toEqual([
      '2026-12-31',
      '2026-12-31'
    ])
    expect(businessDateRange('今日', new Date('2026-12-31T16:00:00Z'))).toEqual([
      '2027-01-01',
      '2027-01-01'
    ])
    expect(businessDateRange('昨日', new Date('2026-12-31T16:00:00Z'))).toEqual([
      '2026-12-31',
      '2026-12-31'
    ])
  })
  it('最近N天含今日并正确跨年', () => {
    const now = new Date('2027-01-02T00:00:00+08:00')
    expect(businessDateRange('最近7天', now)).toEqual(['2026-12-27', '2027-01-02'])
    expect(businessDateRange('最近14天', now)).toEqual(['2026-12-20', '2027-01-02'])
    expect(businessDateRange('最近30天', now)).toEqual(['2026-12-04', '2027-01-02'])
  })
  it('完整自然月年包括闰日', () => {
    const now = new Date('2024-03-15T00:00:00+08:00')
    expect(businessDateRange('上月', now)).toEqual(['2024-02-01', '2024-02-29'])
    expect(businessDateRange('本月', now)).toEqual(['2024-03-01', '2024-03-31'])
    expect(businessDateRange('本年', now)).toEqual(['2024-01-01', '2024-12-31'])
    expect(businessDateRange('去年', now)).toEqual(['2023-01-01', '2023-12-31'])
    expect(businessDateRange('上月', new Date('2027-01-15T00:00:00+08:00'))).toEqual([
      '2026-12-01',
      '2026-12-31'
    ])
  })
  it('九个快捷项点击时重新计算并给日期组件本地日历值', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-12-31T16:00:00Z'))
      expect(dateRangeShortcuts).toHaveLength(9)
      const value = dateRangeShortcuts[0].value()[0]
      expect([value.getFullYear(), value.getMonth() + 1, value.getDate()]).toEqual([2027, 1, 1])
      vi.setSystemTime(new Date('2027-01-01T16:00:00Z'))
      expect(dateRangeShortcuts[0].value()[0].getDate()).toBe(2)
    } finally {
      vi.useRealTimers()
    }
  })
})
