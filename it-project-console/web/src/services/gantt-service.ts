import type { DemoProject, DemoScheduleChange } from '@/domain/prototype'
import { computeProjectRisks } from './risk-service'
import { shanghaiDay } from './workflow-validation'

const DAY = 86400000
export interface GanttFilters {
  department?: string
  ownerId?: string
  risk?: string
  includeArchived?: boolean
}
export interface GanttRow {
  project: DemoProject
  risks: string[]
  start: string
  left: number
  width: number
  progressWidth: number
  originalMarker: number | null
  clipped: boolean
  outside: boolean
}
export function monthDays(month: string): number {
  const [year, value] = month.split('-').map(Number)
  return new Date(Date.UTC(year, value, 0)).getUTCDate()
}
export function shiftMonth(month: string, delta: number): string {
  const [year, value] = month.split('-').map(Number)
  return new Date(Date.UTC(year, value - 1 + delta, 1)).toISOString().slice(0, 7)
}
export function buildGanttRows(
  projects: DemoProject[],
  month: string,
  filters: GanttFilters = {},
  changes: DemoScheduleChange[] = [],
  now = new Date().toISOString()
): GanttRow[] {
  const first = Date.parse(`${month}-01`) / DAY
  const last = first + monthDays(month)
  return projects.flatMap((project): GanttRow[] => {
    if (!filters.includeArchived && (project.archived || project.status === 'cancelled')) return []
    if (filters.department && project.department !== filters.department) return []
    if (filters.ownerId && project.primaryOwnerId !== filters.ownerId) return []
    const risks =
      project.riskVersion !== undefined ? project.risks : computeProjectRisks(project, changes, now)
    if (filters.risk === 'any' && !risks.length) return []
    if (filters.risk === 'delayed' && !risks.some((risk) => risk.includes('延期'))) return []
    if (filters.risk === 'stale' && !risks.some((risk) => risk.includes('未更新'))) return []
    if (filters.risk === 'blocked' && project.simpleStatus !== 'blocked') return []
    if (!project.expectedDeliveryDate) return []
    const start = shanghaiDay(project.createdAt)
    const begin = Date.parse(start) / DAY
    const end = Date.parse(project.expectedDeliveryDate) / DAY + 1
    if (begin >= last || end <= first) return []
    const visibleStart = Math.max(begin, first)
    const visibleEnd = Math.min(end, last)
    const original = Date.parse(project.originalDeliveryDate) / DAY + 0.5 - first
    return [
      {
        project,
        risks,
        start,
        left: visibleStart - first,
        width: visibleEnd - visibleStart,
        progressWidth: 0,
        originalMarker: original >= 0 && original < last - first ? original : null,
        clipped: begin < first || end > last,
        outside: original < 0 || original >= last - first
      }
    ]
  })
}
