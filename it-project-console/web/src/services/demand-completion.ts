import type { DemoDemand, DemoProject } from '@/domain/prototype'
import { shanghaiDay } from './workflow-validation'

export interface DemandCompletion {
  plannedCompletionDate: string
  actualCompletedAt: string
  completionStatus: 'normal' | 'late' | 'unfinished' | 'unknown'
}
export type DemandRow = DemoDemand & DemandCompletion
export const completionLabels: Record<DemandCompletion['completionStatus'], string> = {
  normal: '正常完成',
  late: '延期完成',
  unfinished: '未完成',
  unknown: '—'
}
export function demandCompletion(project?: DemoProject): DemandCompletion {
  const plannedCompletionDate = project?.expectedDeliveryDate ?? ''
  const actualCompletedAt = project?.status === 'completed' ? (project.actualCompletedAt ?? '') : ''
  const completionStatus =
    project?.status !== 'completed'
      ? 'unfinished'
      : !plannedCompletionDate || !actualCompletedAt
        ? 'unknown'
        : shanghaiDay(actualCompletedAt) > plannedCompletionDate
          ? 'late'
          : 'normal'
  return { plannedCompletionDate, actualCompletedAt, completionStatus }
}
