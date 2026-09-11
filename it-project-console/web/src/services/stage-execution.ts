import {
  PROJECT_STAGES,
  type DemoProject,
  type DemoStageHistory,
  type StagePlan
} from '@/domain/prototype'
import { shanghaiDay } from './workflow-validation'

export type StageState =
  'done' | 'current' | 'future' | 'late' | 'late-done' | 'unknown' | 'unplanned'
export const stageStateLabel: Record<StageState, string> = {
  done: '按时完成',
  current: '进行中',
  future: '未开始',
  late: '已延期',
  'late-done': '延期完成',
  unknown: '待核实',
  unplanned: '待排期'
}
export interface StageExecution {
  stage: (typeof PROJECT_STAGES)[number]
  index: number
  plan?: StagePlan
  completedAt: string | null
  current: boolean
  completed: boolean
  state: StageState
  label: string
  lateDays: number
}
const dayNumber = (day: string) => Date.parse(`${day}T00:00:00Z`) / 86400000
const validDay = (day?: string | null): day is string =>
  !!day && /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(dayNumber(day))

// Only the latest visit to a stage is authoritative after a correction or reopening.
export function stageExecutions(
  project: DemoProject,
  histories: DemoStageHistory[],
  today = shanghaiDay(new Date().toISOString())
): StageExecution[] {
  const currentIndex = PROJECT_STAGES.indexOf(project.stage)
  return PROJECT_STAGES.map((stage, index) => {
    const history = histories.filter((h) => h.projectId === project.id && h.stage === stage).at(-1)
    const isPast =
      index < currentIndex || (index === currentIndex && project.status === 'completed')
    const completedAt =
      isPast &&
      !history?.interruptedAt &&
      history?.completedAt &&
      Number.isFinite(Date.parse(history.completedAt))
        ? history.completedAt
        : null
    const completed = completedAt !== null
    const current = index === currentIndex && project.status === 'active'
    const storedPlan = project.stagePlans?.find((p) => p.stage === stage)
    // Completed visits use their frozen plan. Do not infer a deadline from today's plan.
    const plan = completed
      ? validDay(history?.plannedStartDate) && validDay(history?.plannedEndDate)
        ? { stage, startDate: history.plannedStartDate, endDate: history.plannedEndDate }
        : undefined
      : storedPlan &&
          validDay(storedPlan.startDate) &&
          validDay(storedPlan.endDate) &&
          storedPlan.startDate <= storedPlan.endDate
        ? storedPlan
        : undefined
    const lateDays =
      plan && (completedAt || (!isPast && project.status === 'active'))
        ? Math.max(
            0,
            Math.round(
              dayNumber(completedAt ? shanghaiDay(completedAt) : today) - dayNumber(plan.endDate)
            )
          )
        : 0
    let state: StageState
    if (completed) state = index < 2 ? 'done' : !plan ? 'unknown' : lateDays ? 'late-done' : 'done'
    else if (isPast || project.status === 'completed') state = 'unknown'
    else if (!plan) state = current ? 'unplanned' : 'future'
    else if (lateDays) state = 'late'
    else state = current && project.simpleStatus !== 'not-started' ? 'current' : 'future'
    return {
      stage,
      index,
      plan,
      completedAt,
      completed,
      current,
      state,
      lateDays,
      label: completed && index < 2 ? '已完成' : stageStateLabel[state]
    }
  })
}

export function stageExplanation(item: StageExecution): string {
  const plan = item.plan ? `计划 ${item.plan.startDate} → ${item.plan.endDate}` : '无可靠计划日期'
  const actual = item.completedAt ? `实际完成 ${shanghaiDay(item.completedAt)}` : '尚无实际完成记录'
  return `${item.stage} · ${item.label} · ${plan} · ${actual}${item.lateDays ? ` · 延期 ${item.lateDays} 天` : ''}`
}
