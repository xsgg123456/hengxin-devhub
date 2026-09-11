import type { Prisma } from '../../generated/prisma/client.js'
import { mapProject, mapUser, type ReadProject, type ReadUser } from '../workspace/read-model.js'
import type { DashboardQuery } from './query-schemas.js'
import { businessDate, DAY } from '../calendar/workday.js'

export async function readProjects(tx: Prisma.TransactionClient) {
  const [projects, users] = await Promise.all([
    tx.project.findMany({ include: { members: true }, orderBy: { createdAt: 'desc' } }),
    tx.user.findMany({ where: { active: true }, orderBy: { name: 'asc' } })
  ])
  return { projects: projects.map(mapProject), users: users.map(mapUser) }
}
export const assigned = (p: ReadProject, id: string) =>
  p.primaryOwnerId === id || p.collaboratorIds.includes(id)
export function matchesRisk(p: ReadProject, risk: string) {
  if (risk === 'any') return p.risks.length > 0
  if (risk === 'delayed') return p.risks.some((r) => r.includes('延期'))
  if (risk === 'stale') return p.risks.some((r) => r.includes('未更新'))
  if (risk === 'blocked')
    return p.status === 'active' && !p.archived && p.simpleStatus === 'blocked'
  return true
}
export function filterProjects(
  projects: ReadProject[],
  users: ReadUser[],
  q: DashboardQuery,
  actorId: string
) {
  return projects
    .filter((p) => {
      if (!q.includeArchived && p.archived) return false
      if (q.scope === 'mine' && !assigned(p, actorId)) return false
      if (q.person && !assigned(p, q.person)) return false
      if (q.status !== 'all' && p.status !== q.status) return false
      if (q.department && p.department !== q.department) return false
      if (q.stage && p.stage !== q.stage) return false
      if ((q.from && p.expectedDeliveryDate < q.from) || (q.to && p.expectedDeliveryDate > q.to))
        return false
      const owner = users.find((u) => u.id === p.primaryOwnerId)?.name ?? ''
      if (
        q.keyword &&
        !`${p.name} ${p.code} ${owner} ${p.department}`
          .toLowerCase()
          .includes(q.keyword.toLowerCase())
      )
        return false
      return matchesRisk(p, q.risk)
    })
    .sort(
      (a, b) =>
        Number(matchesRisk(b, 'delayed')) - Number(matchesRisk(a, 'delayed')) ||
        b.risks.length - a.risks.length ||
        b.updatedAt.localeCompare(a.updatedAt)
    )
}
function attentionRank(p: ReadProject, blockedDays: Record<string, number>) {
  const pattern = matchesRisk(p, 'delayed')
    ? '延期'
    : matchesRisk(p, 'blocked')
      ? '阻塞'
      : matchesRisk(p, 'stale')
        ? '未更新'
        : p.risks.some((r) => r.includes('临期'))
          ? '临期'
          : '其他'
  const days =
    pattern === '阻塞'
      ? (blockedDays[p.id] ?? 0)
      : Math.max(
          0,
          ...p.risks.filter((r) => r.includes(pattern)).map((r) => Number(r.match(/\d+/)?.[0] ?? 0))
        )
  return { priority: ['延期', '阻塞', '未更新', '临期', '其他'].indexOf(pattern), days }
}
async function blockedDurations(tx: Prisma.TransactionClient, projects: ReadProject[]) {
  const blocked = projects.filter((p) => matchesRisk(p, 'blocked'))
  const reopened = blocked.length
    ? await tx.lifecycleEvent.groupBy({
        by: ['entityId'],
        where: {
          entityType: 'project',
          entityId: { in: blocked.map((p) => p.id) },
          action: 'reopen'
        },
        _max: { createdAt: true }
      })
    : []
  const cutoffs = new Map(reopened.map((row) => [row.entityId, row._max.createdAt!]))
  const history = blocked.length
    ? await tx.progressUpdate.findMany({
        where: { projectId: { in: blocked.map((p) => p.id) }, kind: 'overall' },
        select: { projectId: true, status: true, createdAt: true },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
      })
    : []
  const starts = new Map<string, Date>()
  for (const row of history) {
    const cutoff = cutoffs.get(row.projectId)
    if (cutoff && row.createdAt <= cutoff) continue
    if (row.status !== 'blocked') starts.delete(row.projectId)
    else if (!starts.has(row.projectId)) starts.set(row.projectId, row.createdAt)
  }
  const today = Date.parse(businessDate(new Date()))
  return Object.fromEntries(
    blocked.map((p) => [
      p.id,
      Math.max(
        0,
        (today -
          Date.parse(
            businessDate(starts.get(p.id) ?? cutoffs.get(p.id) ?? new Date(p.createdAt))
          )) /
          DAY
      )
    ])
  )
}
export async function dashboard(tx: Prisma.TransactionClient, q: DashboardQuery, actorId: string) {
  const model = await readProjects(tx)
  const projects = filterProjects(model.projects, model.users, q, actorId)
  const blockedDays = await blockedDurations(tx, projects)
  const attentionDays = Object.fromEntries(
    projects.map((p) => [p.id, attentionRank(p, blockedDays).days])
  )
  const pending = await tx.demand.count({
    where: {
      status: 'PENDING',
      ...(q.department ? { department: q.department } : {}),
      ...(q.scope === 'mine' ? { ownerId: actorId } : {})
    }
  })
  const metrics = [
    {
      label: '在手项目',
      key: 'active',
      value: projects.filter((p) => p.status === 'active' && !p.archived).length
    },
    ...[
      ['已延期', 'delayed'],
      ['超期未更新', 'stale'],
      ['已阻塞', 'blocked']
    ].map(([label, key]) => ({
      label,
      key,
      value: projects.filter((p) => matchesRisk(p, key!)).length
    })),
    { label: '待立项', key: 'pending', value: pending }
  ]
  const attention = projects
    .filter(
      (p) =>
        p.status === 'active' && !p.archived && (p.risks.length || p.simpleStatus === 'blocked')
    )
    .sort((a, b) => {
      const x = attentionRank(a, blockedDays),
        y = attentionRank(b, blockedDays)
      return x.priority - y.priority || y.days - x.days || b.updatedAt.localeCompare(a.updatedAt)
    })
  return {
    projects,
    distribution: projectDistribution(projects),
    items: projects.slice((q.page - 1) * q.pageSize, q.page * q.pageSize),
    total: projects.length,
    metrics,
    attention,
    attentionDays
  }
}

export function projectDistribution(projects: ReadProject[]) {
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
