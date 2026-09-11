import type { DemoProject, PrototypeDatabase } from '@/domain/prototype'
import { shanghaiDay } from '@/services/workflow-validation'

export const projectCode = (project: Pick<DemoProject, 'id' | 'code'>) => project.code || project.id

export function nextProjectCode(database: PrototypeDatabase, createdAt: string): string {
  const year = shanghaiDay(createdAt).slice(0, 4)
  database.projectCodeCounters ??= {}
  const next = (database.projectCodeCounters[year] ?? 0) + 1
  if (!Number.isSafeInteger(next)) throw new Error('项目编号超出范围')
  database.projectCodeCounters[year] = next
  return `XM-${year}-${String(next).padStart(4, '0')}`
}

export function backfillProjectCodes(database: PrototypeDatabase): void {
  database.projectCodeCounters ??= {}
  for (const value of Object.values(database.projectCodeCounters)) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error('项目编号计数无效')
  }
  const used = new Set<string>()
  for (const project of database.projects) {
    if (!project.code) continue
    const match = /^XM-(\d{4})-(\d{4,})$/.exec(project.code)
    if (!match || used.has(project.code)) throw new Error('项目编号无效或重复')
    used.add(project.code)
    const serial = Number(match[2])
    if (!Number.isSafeInteger(serial) || serial < 1) throw new Error('项目编号无效')
    database.projectCodeCounters[match[1]] = Math.max(
      database.projectCodeCounters[match[1]] ?? 0,
      serial
    )
  }
  const ordered = [...database.projects].sort(
    (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id)
  )
  for (const project of ordered) {
    project.code ||= nextProjectCode(database, project.createdAt)
  }
}
