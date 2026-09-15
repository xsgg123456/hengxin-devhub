import type { DemoProject, DemoStageHistory, StagePlan } from '@/domain/prototype'
import { remainingStages } from './stage-plan-service'
import { shanghaiDay } from './workflow-validation'

const DAY = 86400000
export function nextWorkday(day: string): string {
  let next = Date.parse(day) + DAY
  while ([0, 6].includes(new Date(next).getUTCDay())) next += DAY
  return new Date(next).toISOString().slice(0, 10)
}

/** Populate the form only. Existing dates are never replaced or propagated. */
export function defaultStagePlans(
  project: DemoProject,
  histories: DemoStageHistory[],
  now = new Date().toISOString()
): { plans: StagePlan[]; notice: string } {
  const stages = remainingStages(project)
  if (project.stagePlans?.some(plan => plan.startDate || plan.endDate)) {
    return {
      plans: stages.map(stage => {
        const old = project.stagePlans?.find(plan => plan.stage === stage)
        return { stage, startDate: old?.startDate ?? '', endDate: old?.endDate ?? '' }
      }),
      notice: ''
    }
  }
  const review = histories
    .filter(history => history.projectId === project.id && history.stage === '立项评审' &&
      history.completedAt && !history.interruptedAt && Number.isFinite(Date.parse(history.completedAt)))
    .map(history => history.completedAt!)
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0]
  const anchor = shanghaiDay(review ?? now)
  let start = nextWorkday(anchor)
  const plans = stages.map(stage => {
    const end = nextWorkday(nextWorkday(start))
    const plan = { stage, startDate: start, endDate: end }
    start = nextWorkday(end)
    return plan
  })
  return {
    plans,
    notice: `${review ? `根据立项评审完成日 ${anchor}` : `历史立项评审完成日缺失，暂以今天 ${anchor} 为基准`}，从下一工作日开始，每环节预填3个工作日（跳过周末）。可修改，保存后生效。`
  }
}
