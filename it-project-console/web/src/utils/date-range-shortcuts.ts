import { shanghaiDay } from '@/services/workflow-validation'

export const DATE_RANGE_LABELS = [
  '今日',
  '昨日',
  '最近7天',
  '最近14天',
  '最近30天',
  '本月',
  '上月',
  '本年',
  '去年'
] as const
export type DateRangeLabel = (typeof DATE_RANGE_LABELS)[number]

export function businessDateRange(label: DateRangeLabel, now = new Date()): [string, string] {
  const today = shanghaiDay(now.toISOString())
  const [year, month, day] = today.split('-').map(Number)
  const date = (y: number, m: number, d: number) =>
    new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10)
  if (label === '今日') return [today, today]
  if (label === '昨日') return [date(year, month, day - 1), date(year, month, day - 1)]
  const recentDays: Partial<Record<DateRangeLabel, number>> = {
    最近7天: 7,
    最近14天: 14,
    最近30天: 30
  }
  const days = recentDays[label]
  if (days) return [date(year, month, day - days + 1), today]
  if (label === '本月') return [date(year, month, 1), date(year, month + 1, 0)]
  if (label === '上月') return [date(year, month - 1, 1), date(year, month, 0)]
  const selectedYear = label === '去年' ? year - 1 : year
  return [date(selectedYear, 1, 1), date(selectedYear, 12, 31)]
}

export const dateRangeShortcuts = DATE_RANGE_LABELS.map((text) => ({
  text,
  value: () =>
    businessDateRange(text).map((day) => {
      // DatePicker reads browser-local calendar fields; preserve the Shanghai date label.
      const [year, month, date] = day.split('-').map(Number)
      return new Date(year, month - 1, date, 12)
    })
}))
