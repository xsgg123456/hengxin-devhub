import type { DemoProject, PrototypeDatabase } from '@/domain/prototype'
import { shanghaiDay } from '@/services/workflow-validation'

export const projectCode = (project: Pick<DemoProject, 'id' | 'code'>) => project.code || project.id

export function nextProjectCode(database: PrototypeDatabase, createdAt: string, optimization = false): string {
  const year = shanghaiDay(createdAt).slice(0, 4)
  database.projectCodeCounters ??= {}
  database.optimizationCodeCounters ??= {}
  const counters = optimization ? database.optimizationCodeCounters : database.projectCodeCounters
  const next = (counters[year] ?? 0) + 1
  if (!Number.isSafeInteger(next)) throw new Error('项目编号超出范围')
  counters[year] = next
  return `${optimization ? 'YH' : 'XM'}-${year}-${String(next).padStart(4, '0')}`
}

export function backfillProjectCodes(database: PrototypeDatabase): void {
  database.projectCodeCounters ??= {}
  database.optimizationCodeCounters ??= {}
  for (const value of [...Object.values(database.projectCodeCounters), ...Object.values(database.optimizationCodeCounters)]) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error('项目编号计数无效')
  }
  const used = new Set<string>()
  for (const project of database.projects) {
    if (project.legacyCode) {
      const legacy = /^XM-(\d{4})-(\d{4,})$/.exec(project.legacyCode)
      if (!legacy || !Number.isSafeInteger(Number(legacy[2])) || Number(legacy[2]) < 1) throw new Error('历史项目编号无效')
      database.projectCodeCounters[legacy[1]] = Math.max(database.projectCodeCounters[legacy[1]] ?? 0, Number(legacy[2]))
    }
    if (!project.code) continue
    const match = /^(?:XM|YH)-(\d{4})-(\d{4,})$/.exec(project.code)
    if (!match || used.has(project.code)) throw new Error('项目编号无效或重复')
    used.add(project.code)
    const serial = Number(match[2])
    if (!Number.isSafeInteger(serial) || serial < 1) throw new Error('项目编号无效')
    const counters = project.code.startsWith('YH-') ? database.optimizationCodeCounters : database.projectCodeCounters
    counters[match[1]] = Math.max(
      counters[match[1]] ?? 0,
      serial
    )
  }
  const ordered = [...database.projects].sort(
    (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id)
  )
  for (const project of ordered) {
    if (project.parentProjectId && project.code?.startsWith('XM-')) {
      project.legacyCode = project.code
      project.code = nextProjectCode(database, project.createdAt, true)
    }
    project.code ||= nextProjectCode(database, project.createdAt, !!project.parentProjectId)
  }
}
