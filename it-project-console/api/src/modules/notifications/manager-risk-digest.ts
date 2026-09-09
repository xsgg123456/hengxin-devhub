import type { PrismaClient } from '../../generated/prisma/client.js'

const samples = new Set(['user-manager-chen', 'user-business-li', 'user-engineer-wang', 'user-engineer-zhao', 'project-demo', 'demand-demo-owned'])
export const isSampleNotificationId = (id: string | null) => !!id && (samples.has(id) || id.startsWith('sample-'))

/** Shanghai has no daylight saving: use the local calendar, independently of the server timezone. */
export async function prepareManagerRiskDigest(db: PrismaClient, now: Date, time = '09:00') {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('管理人员汇总时间必须为HH:mm')
  const local = new Date(now.getTime() + 8 * 60 * 60_000)
  const day = local.toISOString().slice(0, 10)
  if ([0, 6].includes(local.getUTCDay()) || local.toISOString().slice(11, 16) < time) return 0
  return db.$transaction(async tx => {
    const [lock] = await tx.$queryRaw<Array<{ acquired: boolean }>>
      `SELECT pg_try_advisory_xact_lock(hashtextextended(current_schema() || ':notification-flush', 0)) AS acquired`
    if (!lock?.acquired) return 0
    const key = `manager-risk-digest:${day}`
    if (await tx.systemSetting.findUnique({ where: { key } })) return 0
    const sources = await tx.notificationOutbox.findMany({
      where: { eventType: 'PROJECT_RISKS_CHANGED', recipient: { role: 'MANAGER' },
        status: 'PENDING', attempts: 0, deliveryLog: null, availableAt: { lte: now }, createdAt: { lte: now } },
      include: { recipient: true, project: { include: { primaryOwner: true } } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
    })
    const grouped = new Map<string, typeof sources>()
    for (const item of sources) {
      const items = grouped.get(item.recipientId) ?? []
      items.push(item)
      grouped.set(item.recipientId, items)
    }
    let count = 0
    for (const [recipientId, items] of grouped) {
      const projects = new Map<string, { projectId: string; name: string; owner: string; risks: string[]; path: string }>()
      for (const item of items) {
        const project = item.project
        if (!project || !item.recipient.active || !item.recipient.dingUserId ||
          [recipientId, item.projectId, item.demandId, project.primaryOwnerId].some(isSampleNotificationId)) continue
        const risks = Array.isArray(project.risks) ? project.risks.filter((risk): risk is string => typeof risk === 'string') : []
        // Resolved projects have no current exception and do not belong in the digest.
        if (!risks.length) continue
        projects.set(project.id, { projectId: project.id, name: project.name, owner: project.primaryOwner.name,
          risks, path: `/#/project-overview?projectId=${encodeURIComponent(project.id)}` })
      }
      const digest = projects.size ? await tx.notificationOutbox.create({ data: {
        recipientId, eventType: 'MANAGER_RISK_DIGEST', idempotencyKey: `${key}:${recipientId}`,
        payload: { day, sourceIds: items.map(item => item.id), projects: [...projects.values()] },
        createdAt: now, availableAt: now
      } }) : null
      for (const item of items) {
        await tx.notificationLog.create({ data: { outboxId: item.id, state: 'SKIPPED',
          safeError: digest ? `已归入管理人员汇总：${digest.id}` : '当前无风险或目标不可投递' } })
      }
      await tx.notificationOutbox.updateMany({ where: { id: { in: items.map(item => item.id) } }, data: { status: 'FAILED' } })
      if (digest) count++
    }
    // Record even an empty run: changes after today's window wait until the next working day.
    await tx.systemSetting.create({ data: { key, value: { checkedAt: now.toISOString(), count } } })
    return count
  }, { timeout: 60_000 })
}
