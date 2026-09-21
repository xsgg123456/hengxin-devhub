import type { Prisma } from '../../generated/prisma/client.js'
import { mapDemand, mapUser, type ReadDemand, type ReadUser } from '../workspace/read-model.js'
import { shiftMonth } from '../workload/workload-service.js'
import type { DemandQuery } from './query-schemas.js'
import { businessDate } from '../calendar/workday.js'
import { demandCompletion } from './demand-completion.js'
import { projectTypeCounts } from './dashboard-service.js'
const shanghaiDay = (value: string) => businessDate(new Date(value))
export async function demandStatistics(
  tx: Prisma.TransactionClient,
  q: DemandQuery,
  actorId: string
) {
  const [rows, userRows, revisionRows] = await Promise.all([
    tx.demand.findMany({
      include: { project: true, proposals: true },
      orderBy: [{ submittedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }]
    }),
    tx.user.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
    tx.$queryRaw<Array<{ revision: string }>>`SELECT revision::text FROM workspace_revision WHERE id = 1`
  ])
  const filtered = rows.filter(
    (d) =>
      (!q.projectType || !!d.parentProjectId === (q.projectType === 'optimization')) &&
      (q.scope !== 'mine' || (d.project ? d.project.businessOwnerId === actorId : d.ownerId === actorId)) &&
      (!q.submitterId || (d.project ? d.project.businessOwnerId === q.submitterId : d.ownerId === q.submitterId)) &&
      (!q.department || (d.project?.department ?? d.department) === q.department) &&
      (!q.from || (!!d.submittedAt && businessDate(d.submittedAt) >= q.from)) &&
      (!q.to || (!!d.submittedAt && businessDate(d.submittedAt) <= q.to)) &&
      (!q.completion || demandCompletion(d.project).completionStatus === q.completion) &&
      (!q.status ||
        q.status === 'all' ||
        (q.status === 'pre_establishment'
          ? ['PENDING', 'AWAITING_ENGINEER'].includes(d.status)
          : q.status === 'returned_management'
          ? d.status === 'PENDING' && d.proposals.some(row => row.status === 'returned')
          : (d.status === 'APPROVED' ? 'established' : d.status.toLowerCase()) === q.status)) &&
      (!q.keyword || `${d.name} ${d.code} ${d.project?.code ?? ''} ${d.project?.legacyCode ?? ''}`.toLowerCase().includes(q.keyword.toLowerCase()))
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
    workspaceRevision: revisionRows[0]?.revision ?? '',
    demands,
    typeCounts: projectTypeCounts(filtered),
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
    const key = by === 'department' ? demand.department : demand.currentOwnerId ?? ''
    const name =
      by === 'department'
        ? demand.department
        : users.find((u) => u.id === key)?.name || '未设置业务负责人'
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
