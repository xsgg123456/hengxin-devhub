import type { DemoDemand, DemoProject } from '@/domain/prototype'
import type { DemandRow } from './demand-completion'
import type {
  demandDistribution,
  demandMonthlyTrend,
  personWorkload,
  projectDistribution
} from './analytics-service'
import type { GanttRow } from './gantt-service'
export interface DashboardResult {
  revision: string
  projects: DemoProject[]
  items: DemoProject[]
  total: number
  typeCounts?: { formal: number; optimization: number; total: number }
  metrics: { label: string; key: string; value: number }[]
  distribution: ReturnType<typeof projectDistribution>
  attention: DemoProject[]
  attentionDays: Record<string, number>
}
export interface DemandStatistics {
  workspaceRevision: string
  demands: DemandRow[]
  activeProjectCount: number
  submitters: ReturnType<typeof demandDistribution>
  departments: ReturnType<typeof demandDistribution>
  trend: ReturnType<typeof demandMonthlyTrend>
}
export interface WorkloadResult {
  workspaceRevision: string
  rows: ReturnType<typeof personWorkload>
}
export interface GanttResult {
  workspaceRevision: string
  rows: GanttRow[]
}
