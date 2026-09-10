import type { Prisma } from '../../generated/prisma/client.js'
import { mapDemand, mapUser, type ReadDemand, type ReadUser } from '../workspace/read-model.js'
import { shiftMonth } from '../workload/workload-service.js'
import type { DemandQuery } from './query-schemas.js'
import { businessDate } from '../calendar/workday.js'
const shanghaiDay = (value: string) => businessDate(new Date(value))
export async function demandStatistics(
  tx: Prisma.TransactionClient,
  q: DemandQuery,
  actorId: string
) {
  const [rows, userRows] = await Promise.all([
    tx.demand.findMany({
      orderBy: [{ submittedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }]
    }),
    tx.user.findMany({ where: { active: true }, orderBy: { name: 'asc' } })
  ])
  const filtered = rows.filter(
    (d) =>
      (q.scope !== 'mine' || d.ownerId === actorId) &&
      (!q.submitterId || d.ownerId === q.submitterId) &&
      (!q.department || d.department === q.department) &&
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
  const demands = filtered.map((d) =>
    mapDemand({ ...d, attachments: attachments.filter((a) => a.demandId === d.id) })
  )
  const users = userRows.map(mapUser)
  return {
    demands,
    submitters: demandDistribution(demands, users, 'submitter'),
    departments: demandDistribution(demands, users, 'department'),
    trend: demandMonthlyTrend(demands)
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

export function demandMonthlyTrend(demands: ReadDemand[]) {
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
