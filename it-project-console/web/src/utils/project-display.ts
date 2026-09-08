import type { SimpleStatus } from '@/domain/prototype'

export const statusLabel: Record<SimpleStatus, string> = {
  'not-started': '刚开始',
  'in-progress': '进行中',
  'nearly-done': '接近完成',
  completed: '已完成',
  blocked: '已阻塞'
}

export function displayTime(value: string | null | undefined): string {
  if (!value) return '—'
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(new Date(value))
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')}`
}

export function currentDate(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(new Date())
}
