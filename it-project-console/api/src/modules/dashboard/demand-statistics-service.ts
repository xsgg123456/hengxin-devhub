import type { Prisma } from '../../generated/prisma/client.js'
import { mapDemand, mapUser, type ReadDemand, type ReadUser } from '../workspace/read-model.js'
import { shiftMonth } from '../workload/workload-service.js'
import type { DemandQuery } from './query-schemas.js'
import { businessDate } from '../calendar/workday.js'
import { demandCompletion } from './demand-completion.js'
const shanghaiDay = (value: string) => businessDate(new Date(value))
export async function demandStatistics(
  tx: Prisma.TransactionClient,
  q: DemandQuery,
  actorId: string
) {
  const [rows, userRows] = await Promise.all([
    tx.demand.findMany({
      include: { project: true },
      orderBy: [{ submittedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }]
    }),
    tx.user.findMany({ where: { active: true }, orderBy: { name: 'asc' } })
  ])
  const filtered = rows.filter(
    (d) =>
      (q.scope !== 'mine' || d.ownerId === actorId) &&
      (!q.submitterId || d.ownerId === q.submitterId) &&
      (!q.department || d.department === q.department) &&
      (!q.from || (!!d.submittedAt && businessDate(d.submittedAt) >= q.from)) &&
      (!q.to || (!!d.submittedAt && businessDate(d.submittedAt) <= q.to)) &&
      (!q.completion || demandCompletion(d.project).completionStatus === q.completion) &&
      (!q.status ||
        q.status === 'all' ||
        (d.status === 'APPROVED' ? 'established' : d.status.toLowerCase()) === q.status) &&
      (!q.keyword || `${d.name} ${d.id}`.toLowerCase().includes(q.keyword.toLowerCase()))
  )
  const attachmentIds = filtered
    .flatMap((d) => [...d.attachmentIds, d.prdAttachmentId, d.prototypeAttachmentId])
    .filter((id): id is string => !!id)
  const attachments = attachmentIds.length
    ? await tx.attachment.findMany({ where: { id: { in: attachmentIds }, status: 'READY' } })
    : []
  const demands = filtered.map((d) => ({
    ...mapDemand({ ...d, attachments: attachments.filter((a) => a.demandId === d.id) }),
    ...demandCompletion(d.project)
  }))
  const users = userRows.map(mapUser)
  return {
    demands,
    activeProjectCount: filtered.filter(d => d.project?.status === 'ACTIVE' && !d.project.archived).length,
    submitters: demandDistribution(demands, users, 'submitter'),
    departments: demandDistribution(demands, users, 'department'),
    trend: demandMonthlyTrend(demands, q)
  }
}
export function demandDistribution(
  demands: ReadDemand[],
  users: ReadUser[],
  by: 'submitter' | 'department'
) {
  const groups = new Map<
    string,
    { key: string; name: string; value: number; demands: ReadDemand[] }
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

export function demandMonthlyTrend(demands: ReadDemand[], range: { from?: string; to?: string } = {}, now = new Date()) {
  const valid = demands.filter((d) => d.submittedAt && Number.isFinite(Date.parse(d.submittedAt)))
  const months: string[] = []
  const current = businessDate(now).slice(0, 7)
  const from = range.from?.slice(0, 7) ?? shiftMonth(range.to?.slice(0, 7) ?? current, -5)
  const to = range.to?.slice(0, 7) ?? (from > current ? from : current)
  for (let month = from; month <= to; month = shiftMonth(month, 1)) months.push(month)
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
