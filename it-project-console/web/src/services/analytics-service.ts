import type { DemoDemand, DemoProject, DemoUser } from '@/domain/prototype'
import { PROJECT_STAGES } from '@/domain/prototype'
import { shanghaiDay } from './workflow-validation'

export const CHART_COLORS = ['#5d87ff', '#49beff', '#13b99a', '#f59b18', '#fa896b', '#8b75d7']

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
  project: DemoProject,
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

export function projectDistribution(projects: DemoProject[]) {
  const active = projects.filter((p) => !p.archived && p.status === 'active')
  return [
    { key: 'active', name: '在手项目', color: '#5d87ff', projects: active },
    {
      key: 'doing',
      name: '进行中',
      color: '#64748b',
      projects: active.filter(
        (p) => p.simpleStatus === 'in-progress' || p.simpleStatus === 'nearly-done'
      )
    },
    {
      key: 'delayed',
      name: '已延期',
      color: '#ff4d4f',
      projects: active.filter((p) => p.risks.some((r) => r.includes('延期')))
    },
    {
      key: 'stale',
      name: '超期未更新',
      color: '#f59b18',
      projects: active.filter((p) => p.risks.some((r) => r.includes('未更新')))
    },
    {
      key: 'done',
      name: '已完成',
      color: '#13b99a',
      projects: projects.filter((p) => p.status === 'completed')
    }
  ]
}

function maximumOverlap(projects: DemoProject[], month: string) {
  const { start, end } = monthBounds(month)
  const events = projects
    .flatMap((p) => {
      const from = shanghaiDay(p.createdAt) > start ? shanghaiDay(p.createdAt) : start
      const to = p.expectedDeliveryDate < end ? p.expectedDeliveryDate : end
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
  projects: DemoProject[],
  users: DemoUser[],
  month: string,
  today?: string
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
        overlap: maximumOverlap(primary, month),
        stages: PROJECT_STAGES.map((stage) => ({
          stage,
          count: assigned.filter((p) => p.stage === stage).length
        })).filter((s) => s.count),
        delayed: assigned.filter((p) => p.risks.some((r) => r.includes('延期'))),
        blocked: assigned.filter((p) => p.simpleStatus === 'blocked'),
        stale: assigned.filter((p) => p.risks.some((r) => r.includes('未更新')))
      }
    })
}

export function demandDistribution(
  demands: DemoDemand[],
  users: DemoUser[],
  by: 'submitter' | 'department'
) {
  const groups = new Map<
    string,
    { key: string; name: string; value: number; demands: DemoDemand[] }
  >()
  demands.forEach((demand) => {
    const key = by === 'department' ? demand.department : demand.submitterId
    const name =
      by === 'department'
        ? demand.department
        : users.find((u) => u.id === key)?.name || '未知提出人'
    const group = groups.get(key) || { key, name, value: 0, demands: [] }
    group.demands.push(demand)
    group.value++
    groups.set(key, group)
  })
  return [...groups.values()]
}

export function demandMonthlyTrend(demands: DemoDemand[]) {
  const valid = demands.filter((d) => d.submittedAt && Number.isFinite(Date.parse(d.submittedAt)))
  const dates = valid.map((d) => shanghaiDay(d.submittedAt).slice(0, 7)).sort()
  const months: string[] = []
  if (dates.length) {
    for (let month = dates[0]; month <= dates[dates.length - 1]; month = shiftMonth(month, 1))
      months.push(month)
  }
  return {
    months,
    departments: [...new Set(valid.map((d) => d.department))].map((name) => ({
      name,
      data: months.map(
        (month) =>
          valid.filter((d) => d.department === name && shanghaiDay(d.submittedAt).startsWith(month))
            .length
      )
    }))
  }
}
