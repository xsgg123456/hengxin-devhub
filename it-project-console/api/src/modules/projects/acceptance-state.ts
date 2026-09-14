import { randomUUID } from 'node:crypto'
import type { Prisma, Project } from '../../generated/prisma/client.js'
import { AppError } from '../../lib/errors.js'
export function acceptanceHistory(project: Project, action: string, actorId: string, now: Date, summary: string, ownerId = project.acceptanceOwnerId, round = project.acceptanceRound, url = ''): Prisma.InputJsonArray {
  const previous = Array.isArray(project.acceptanceHistory) ? project.acceptanceHistory : []
  return [...previous, { id: randomUUID(), action, actorId, createdAt: now.toISOString(), round, summary, url, ownerId }] as Prisma.InputJsonArray
}
export async function notificationLock(tx: Prisma.TransactionClient) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(current_schema() || ':notification-flush', 0))::text`
}
export async function validBusiness(tx: Prisma.TransactionClient, id: string | null) {
  if (!id) throw new AppError(400, 'ACCEPTANCE_OWNER_REQUIRED', '请先指定有效业务验收负责人')
  await tx.$queryRaw`SELECT id FROM users WHERE id = ${id} FOR SHARE`
  const user = await tx.user.findUnique({ where: { id } })
  if (!user?.active || user.role !== 'BUSINESS') throw new AppError(400, 'INVALID_ACCEPTANCE_OWNER', '验收负责人必须是有效业务人员')
  return user
}
export function invalidateAcceptance(project: Project, actorId: string, now: Date, reason: string): Prisma.ProjectUpdateInput {
  if (project.acceptanceStatus === 'none' && !project.acceptanceSubmittedAt && !project.acceptanceSummary && !project.acceptanceUrl) return {}
  return { acceptanceStatus: 'none', acceptanceSubmittedAt: null, acceptanceSummary: '', acceptanceUrl: '',
    acceptanceHistory: acceptanceHistory(project, 'invalidate', actorId, now, reason) }
}
export async function finishAcceptanceStage(tx: Prisma.TransactionClient, project: Project, now: Date, plan: { startDate: string; endDate: string }) {
  const data = { completedAt: now, status: 'completed', plannedStartDate: new Date(plan.startDate), plannedEndDate: new Date(plan.endDate) }
  const finished = await tx.stageHistory.updateMany({ where: { projectId: project.id, stage: project.stage, enteredAt: { not: null }, completedAt: null, interruptedAt: null }, data })
  if (!finished.count) {
    const future = await tx.stageHistory.findFirst({ where: { projectId: project.id, stage: project.stage, status: 'future', enteredAt: null } })
    if (future) await tx.stageHistory.update({ where: { id: future.id }, data })
    else await tx.stageHistory.create({ data: { projectId: project.id, stage: project.stage, ...data } })
  }
}
