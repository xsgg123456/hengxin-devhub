import type { DemoProject, DemoScheduleChange } from '@/domain/prototype'
import { shanghaiDay } from './workflow-validation'
const DAY = 86400000
export function workdaysBetween(start: string, end: string) {
  let count = 0
  for (let day = Date.parse(start) + DAY; day <= Date.parse(end); day += DAY) {
    const weekday = new Date(day).getUTCDay()
    if (weekday !== 0 && weekday !== 6) count++
  }
  return count
}
export function computeProjectRisks(
  project: DemoProject,
  changes: DemoScheduleChange[] = [],
  now = new Date().toISOString()
): string[] {
  if (project.status !== 'active' || project.archived) return []
  const today = shanghaiDay(now)
  const days = (date: string) => Math.round((Date.parse(today) - Date.parse(date)) / DAY)
  let next = Date.parse(today) + DAY
  while ([0, 6].includes(new Date(next).getUTCDay())) next += DAY
  const risks: string[] = []
  if (project.simpleStatus !== 'completed') {
    if (project.stageExpectedDate === new Date(next).toISOString().slice(0, 10))
      risks.push('环节临期：下一个工作日到期')
    if (days(project.stageExpectedDate) > 0)
      risks.push(`环节延期 ${days(project.stageExpectedDate)} 天`)
  }
  if (days(project.expectedDeliveryDate) > 0)
    risks.push(`项目延期 ${days(project.expectedDeliveryDate)} 天`)
  else if (project.expectedDeliveryDate > project.originalDeliveryDate)
    risks.push(
      `有风险：交付计划较原定晚 ${Math.round((Date.parse(project.expectedDeliveryDate) - Date.parse(project.originalDeliveryDate)) / DAY)} 天`
    )
  if (changes.some((change) => change.projectId === project.id))
    risks.push('计划有变：存在日期调整历史')
  const staleDays = workdaysBetween(
    shanghaiDay(project.lastOverallUpdatedAt || project.createdAt),
    today
  )
  if (staleDays >= 3) risks.push(`已有 ${staleDays} 个工作日未更新整体进度`)
  if (project.simpleStatus === 'blocked')
    risks.push(`当前已阻塞${project.blocker ? `：${project.blocker}` : ''}`)
  return risks
}
