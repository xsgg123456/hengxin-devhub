import type { DemoDemand, DemoProject } from '@/domain/prototype'
import type {
  demandDistribution,
  demandMonthlyTrend,
  personWorkload,
  projectDistribution
} from './analytics-service'
export interface DashboardResult {
  projects: DemoProject[]
  items: DemoProject[]
  total: number
  metrics: { label: string; key: string; value: number }[]
  distribution: ReturnType<typeof projectDistribution>
  attention: DemoProject[]
  attentionDays: Record<string, number>
}
export interface DemandStatistics {
  demands: DemoDemand[]
  submitters: ReturnType<typeof demandDistribution>
  departments: ReturnType<typeof demandDistribution>
  trend: ReturnType<typeof demandMonthlyTrend>
}
export type WorkloadResult = ReturnType<typeof personWorkload>
