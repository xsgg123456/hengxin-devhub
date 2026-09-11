import type { DemoDemand, PrototypeDatabase } from '@/domain/prototype'
import { shanghaiDay } from '@/services/workflow-validation'

export const demandCode = (demand: Pick<DemoDemand, 'code'>) => demand.code || '编号待同步'

export function nextDemandCode(database: PrototypeDatabase, createdAt: string): string {
  const year = shanghaiDay(createdAt).slice(0, 4)
  database.demandCodeCounters ??= {}
  const next = (database.demandCodeCounters[year] ?? 0) + 1
  if (!Number.isSafeInteger(next)) throw new Error('需求编号超出范围')
  database.demandCodeCounters[year] = next
  return `XQ-${year}-${String(next).padStart(4, '0')}`
}

export function backfillDemandCodes(database: PrototypeDatabase): void {
  database.demandCodeCounters ??= {}
  for (const value of Object.values(database.demandCodeCounters)) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error('需求编号计数无效')
  }
  const used = new Set<string>()
  for (const demand of database.demands) {
    // Old prototype drafts may have neither timestamp. A fixed baseline keeps reloads stable.
    demand.createdAt ||= demand.submittedAt || '2026-01-01T00:00:00+08:00'
    if (!demand.code) continue
    const match = /^XQ-(\d{4})-(\d{4,})$/.exec(demand.code)
    if (!match || used.has(demand.code)) throw new Error('需求编号无效或重复')
    used.add(demand.code)
    const serial = Number(match[2])
    if (!Number.isSafeInteger(serial) || serial < 1) throw new Error('需求编号无效')
    database.demandCodeCounters[match[1]] = Math.max(
      database.demandCodeCounters[match[1]] ?? 0, serial
    )
  }
  const ordered = [...database.demands].sort(
    (a, b) => Date.parse(a.createdAt!) - Date.parse(b.createdAt!) || a.id.localeCompare(b.id)
  )
  for (const demand of ordered) demand.code ||= nextDemandCode(database, demand.createdAt!)
}
