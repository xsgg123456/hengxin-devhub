import type { ReadProject } from '../workspace/read-model.js'
import { businessDate } from '../calendar/workday.js'
const shanghaiDay = (value: string) => businessDate(new Date(value))
const DAY = 86400000
export interface GanttFilters {
  department?: string
  ownerId?: string
  risk?: string
  includeArchived?: boolean
}
export interface GanttRow {
  project: ReadProject
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
  projects: ReadProject[],
  month: string,
  filters: GanttFilters = {}
): GanttRow[] {
  const first = Date.parse(`${month}-01`) / DAY
  const last = first + monthDays(month)
  return projects.flatMap((project): GanttRow[] => {
    if (!filters.includeArchived && (project.archived || project.status === 'cancelled')) return []
    if (filters.department && project.department !== filters.department) return []
    if (filters.ownerId && project.primaryOwnerId !== filters.ownerId) return []
    const risks = project.risks
    if (filters.risk === 'any' && !risks.length) return []
    if (filters.risk === 'delayed' && !risks.some((risk) => risk.includes('延期'))) return []
    if (filters.risk === 'stale' && !risks.some((risk) => risk.includes('未更新'))) return []
    if (filters.risk === 'blocked' && project.simpleStatus !== 'blocked') return []
    const start = shanghaiDay(project.createdAt)
    const begin = Date.parse(start) / DAY
    const end = Date.parse(project.expectedDeliveryDate) / DAY + 1
    if (begin >= last || end <= first) return []
    const visibleStart = Math.max(begin, first)
    const visibleEnd = Math.min(end, last)
    const completeEnd = begin + ((end - begin) * project.overallProgress) / 100
    const original = Date.parse(project.originalDeliveryDate) / DAY + 0.5 - first
    return [
      {
        project,
        risks,
        start,
        left: visibleStart - first,
        width: visibleEnd - visibleStart,
        progressWidth: Math.max(0, Math.min(completeEnd, visibleEnd) - visibleStart),
        originalMarker: original >= 0 && original < last - first ? original : null,
        clipped: begin < first || end > last,
        outside: original < 0 || original >= last - first
      }
    ]
  })
}
