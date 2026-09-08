import type { ReadProject, ReadUser } from '../workspace/read-model.js'
import { STAGES } from '../progress/progress-schemas.js'
import { businessDate } from '../calendar/workday.js'
const shanghaiDay = (value: string) => businessDate(new Date(value))
export function monthBounds(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('月份格式应为 YYYY-MM')
  const [year, index] = month.split('-').map(Number)
  return {
    start: `${month}-01`,
    end: new Date(Date.UTC(year, index, 0)).toISOString().slice(0, 10)
  }
}

export function shiftMonth(month: string, offset: number) {
  monthBounds(month)
  const [year, index] = month.split('-').map(Number)
  return new Date(Date.UTC(year, index - 1 + offset, 1)).toISOString().slice(0, 7)
}

export function projectIntersectsMonth(
  project: ReadProject,
  month: string,
  today = shanghaiDay(new Date().toISOString())
) {
  const { start, end } = monthBounds(month)
  // 进行中的延期项目仍占用人力，计划终点不能把它从当月负载中抹掉。
  const finish =
    project.status === 'active' && !project.archived && project.expectedDeliveryDate < today
      ? today
      : project.expectedDeliveryDate
  return project.status !== 'cancelled' && shanghaiDay(project.createdAt) <= end && finish >= start
}

function maximumOverlap(projects: ReadProject[], month: string, today: string) {
  const { start, end } = monthBounds(month)
  const events = projects
    .flatMap((p) => {
      const from = shanghaiDay(p.createdAt) > start ? shanghaiDay(p.createdAt) : start
      const finish =
        p.status === 'active' && !p.archived && p.expectedDeliveryDate < today
          ? today
          : p.expectedDeliveryDate
      const to = finish < end ? finish : end
      return from > to
        ? []
        : [
            { day: from, change: 1 },
            { day: to, change: -1 }
          ]
    })
    .sort((a, b) => a.day.localeCompare(b.day) || b.change - a.change)
  let running = 0
  let maximum = 0
  events.forEach(({ change }) => {
    running += change
    maximum = Math.max(maximum, running)
  })
  return maximum > 1 ? maximum : 0
}

export function personWorkload(
  projects: ReadProject[],
  users: ReadUser[],
  month: string,
  today = shanghaiDay(new Date().toISOString())
) {
  const scoped = [
    ...new Map(
      projects.filter((p) => projectIntersectsMonth(p, month, today)).map((p) => [p.id, p])
    ).values()
  ]
  return users
    .filter((u) =>
      scoped.some((p) => p.primaryOwnerId === u.id || p.collaboratorIds.includes(u.id))
    )
    .map((user) => {
      const primary = scoped.filter((p) => p.primaryOwnerId === user.id)
      const collaboration = scoped.filter(
        (p) => p.primaryOwnerId !== user.id && p.collaboratorIds.includes(user.id)
      )
      const assigned = [...primary, ...collaboration]
      return {
        user,
        primary,
        collaboration,
        projects: assigned,
        overlap: maximumOverlap(primary, month, today),
        stages: STAGES.map((stage) => ({
          stage,
          count: assigned.filter((p) => p.stage === stage).length
        })).filter((s) => s.count),
        delayed: assigned.filter((p) => p.risks.some((r) => r.includes('延期'))),
        blocked: assigned.filter((p) => p.simpleStatus === 'blocked'),
        stale: assigned.filter((p) => p.risks.some((r) => r.includes('未更新')))
      }
    })
}
