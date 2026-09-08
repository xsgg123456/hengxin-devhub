// Adapted from itpd-main/lib/workday.ts: Shanghai calendar days; no legacy DB/cache dependency.
export const DAY = 86400000
export function businessDate(value: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(value)
}
export function workdaysBetween(start: string, end: string, weekdays = [1, 2, 3, 4, 5]): number {
  let total = 0
  for (let day = Date.parse(start) + DAY; day <= Date.parse(end); day += DAY)
    if (weekdays.includes(new Date(day).getUTCDay())) total++
  return total
}
export function nextWorkday(today: string, weekdays = [1, 2, 3, 4, 5]): string {
  let next = Date.parse(today) + DAY
  for (let offset = 0; offset < 7; offset++, next += DAY)
    if (weekdays.includes(new Date(next).getUTCDay()))
      return new Date(next).toISOString().slice(0, 10)
  throw new Error('工作日配置不能为空')
}
