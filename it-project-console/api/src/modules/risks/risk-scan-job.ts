import { z } from 'zod'
import type { Prisma, PrismaClient } from '../../generated/prisma/client.js'
import { computeRisks, defaultRiskPolicy, type RiskPolicy } from './risk-engine.js'
const policySchema = z
  .object({
    staleWorkdays: z.number().int().min(1).max(90),
    weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7)
  })
  .strict()
async function loadPolicy(tx: Prisma.TransactionClient): Promise<RiskPolicy> {
  const setting = await tx.systemSetting.findUnique({ where: { key: 'risk-policy' } })
  return setting ? policySchema.parse(setting.value) : defaultRiskPolicy
}
export async function refreshProjectRisks(
  tx: Prisma.TransactionClient,
  id: string,
  now = new Date(),
  policy?: RiskPolicy
) {
  await tx.$queryRaw`SELECT id FROM projects WHERE id = ${id} FOR UPDATE`
  const project = await tx.project.findUnique({ where: { id } })
  if (!project) return false
  const risks = computeRisks(
    project,
    (await tx.scheduleChange.count({ where: { projectId: id } })) > 0,
    now,
    policy ?? (await loadPolicy(tx))
  )
  if (JSON.stringify(project.risks) === JSON.stringify(risks)) return false
  const version = project.riskVersion + 1
  await tx.project.update({ where: { id }, data: { risks, riskVersion: version } })
  await tx.riskSnapshot.create({ data: { projectId: id, version, risks } })
  if (!risks.length) return true
  const managers = await tx.user.findMany({
    where: { role: 'MANAGER', active: true },
    select: { id: true }
  })
  const recipients = new Set(managers.map((user) => user.id))
  const ownerAlerts = risks.filter((risk) => /临期|延期|未更新|阻塞/.test(risk))
  const previousAlerts = Array.isArray(project.risks)
    ? project.risks.filter(
        (risk): risk is string => typeof risk === 'string' && /临期|延期|未更新|阻塞/.test(risk)
      )
    : []
  const owner = await tx.user.findUnique({ where: { id: project.primaryOwnerId } })
  if (
    owner?.active &&
    owner.role === 'ENGINEER' &&
    ownerAlerts.length &&
    JSON.stringify(previousAlerts) !== JSON.stringify(ownerAlerts)
  )
    recipients.add(owner.id)
  await tx.notificationOutbox.createMany({
    data: [...recipients].map((recipientId) => ({
      recipientId,
      projectId: id,
      eventType: 'PROJECT_RISKS_CHANGED',
      idempotencyKey: `risk:${id}:${version}:${recipientId}`,
      payload: {
        projectId: id,
        projectName: project.name,
        version,
        risks: managers.some((manager) => manager.id === recipientId) ? risks : ownerAlerts,
        path: `/#/project-overview?projectId=${encodeURIComponent(id)}`
      }
    }))
  })
  return true
}
export async function scanProjectRisks(db: PrismaClient, now = new Date()) {
  return db.$transaction(
    async (tx) => {
      const [lock] = await tx.$queryRaw<
        Array<{ acquired: boolean }>
      >`SELECT pg_try_advisory_xact_lock(hashtextextended(current_schema() || ':project-risk-scan', 0)) AS acquired`
      if (!lock?.acquired) return { skipped: true, changed: 0 }
      const policy = await loadPolicy(tx)
      const projects = await tx.project.findMany({ select: { id: true }, orderBy: { id: 'asc' } })
      let changed = 0
      for (const project of projects)
        if (await refreshProjectRisks(tx, project.id, now, policy)) changed++
      return { skipped: false, changed }
    },
    { timeout: 60000 }
  )
}
