import { businessDate } from '../calendar/workday.js'

export function demandCompletion(project: {
  status: string
  currentDeliveryDate: Date | null
  actualCompletedAt: Date | null
} | null) {
  const plannedCompletionDate = project?.currentDeliveryDate
    ? businessDate(project.currentDeliveryDate) : ''
  const actualCompletedAt = project?.status === 'COMPLETED'
    ? project.actualCompletedAt?.toISOString() ?? '' : ''
  const completionStatus = project?.status !== 'COMPLETED' ? 'unfinished'
    : !plannedCompletionDate || !actualCompletedAt ? 'unknown'
      : businessDate(new Date(actualCompletedAt)) > plannedCompletionDate ? 'late' : 'normal'
  return { plannedCompletionDate, actualCompletedAt, completionStatus }
}
