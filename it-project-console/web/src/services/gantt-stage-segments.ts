import type { DemoProject, DemoStageHistory } from '@/domain/prototype'
import { stageExecutions, type StageExecution } from './stage-execution'
import { monthDays } from './gantt-service'

export interface GanttSegment extends StageExecution {
  left: number
  width: number
  lane: number
}
export function ganttStageSegments(
  project: DemoProject,
  histories: DemoStageHistory[],
  month: string,
  today?: string
): GanttSegment[] {
  const first = Date.parse(`${month}-01T00:00:00Z`) / 86400000
  const last = first + monthDays(month)
  const laneEnds: number[] = []
  return stageExecutions(project, histories, today).flatMap((item): GanttSegment[] => {
    if (item.index < 2 || !item.plan) return []
    const begin = Math.max(first, Date.parse(`${item.plan.startDate}T00:00:00Z`) / 86400000)
    const end = Math.min(last, Date.parse(`${item.plan.endDate}T00:00:00Z`) / 86400000 + 1)
    if (end <= begin) return []
    let lane = laneEnds.findIndex((previous) => previous <= begin)
    if (lane < 0) lane = laneEnds.length
    laneEnds[lane] = end
    return [{ ...item, left: begin - first, width: end - begin, lane }]
  })
}
