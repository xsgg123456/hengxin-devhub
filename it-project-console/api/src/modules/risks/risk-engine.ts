import { DAY, businessDate, nextWorkday, workdaysBetween } from '../calendar/workday.js'
export interface RiskPolicy {
  staleWorkdays: number
  weekdays: number[]
}
export const defaultRiskPolicy: RiskPolicy = { staleWorkdays: 3, weekdays: [1, 2, 3, 4, 5] }
export interface RiskProject {
  status: string
  archived: boolean
  simpleStatus: string
  stageExpectedDate: Date | null
  currentDeliveryDate: Date | null
  originalDeliveryDate: Date | null
  lastOverallUpdatedAt: Date
  createdAt: Date
  blocker: string
}
export function computeRisks(
  project: RiskProject,
  hasScheduleChanges: boolean,
  now: Date,
  policy = defaultRiskPolicy
): string[] {
  if (project.status !== 'ACTIVE' || project.archived) return []
  const today = businessDate(now),
    risks: string[] = []
  const label = (date: Date | null) => date?.toISOString().slice(0, 10) ?? ''
  const daysLate = (date: Date | null) =>
    date ? Math.round((Date.parse(today) - Date.parse(label(date))) / DAY) : 0
  if (project.simpleStatus !== 'completed') {
    if (label(project.stageExpectedDate) === nextWorkday(today, policy.weekdays))
      risks.push('环节临期：下一个工作日到期')
    if (daysLate(project.stageExpectedDate) > 0)
      risks.push(`环节延期 ${daysLate(project.stageExpectedDate)} 天`)
  }
  if (daysLate(project.currentDeliveryDate) > 0)
    risks.push(`项目延期 ${daysLate(project.currentDeliveryDate)} 天`)
  else if (
    project.currentDeliveryDate &&
    project.originalDeliveryDate &&
    project.currentDeliveryDate > project.originalDeliveryDate
  )
    risks.push(
      `有风险：交付计划较原定晚 ${Math.round((project.currentDeliveryDate.getTime() - project.originalDeliveryDate.getTime()) / DAY)} 天`
    )
  if (hasScheduleChanges) risks.push('计划有变：存在日期调整历史')
  const stale = workdaysBetween(
    businessDate(project.lastOverallUpdatedAt ?? project.createdAt),
    today,
    policy.weekdays
  )
  if (stale >= policy.staleWorkdays) risks.push(`已有 ${stale} 个工作日未更新整体进度`)
  if (project.simpleStatus === 'blocked')
    risks.push(`当前已阻塞${project.blocker ? `：${project.blocker}` : ''}`)
  return risks
}
