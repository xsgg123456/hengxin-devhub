import { z } from 'zod'
import type { PrismaClient } from '../../generated/prisma/client.js'
import type { Actor } from '../../plugins/auth.js'
import { command } from '../../lib/business-command.js'
import { AppError } from '../../lib/errors.js'
import { canApproveProjects } from '../../lib/project-approver.js'
import { isEngineerEligible } from '../../lib/it-department.js'
import { commandSchema, dateSchema } from '../demands/demand-schemas.js'
import { lockedProject, writable, invalid } from '../progress/progress-state.js'
import { acceptanceHistory, notificationLock } from './acceptance-state.js'
import { cancelAcceptanceNotifications } from '../notifications/acceptance-notifications.js'
import { refreshProjectRisks } from '../risks/risk-scan-job.js'
import { mapProject } from '../workspace/read-model.js'
import { readStagePlans } from './project-plan-state.js'

export const historicalDeliverySchema = commandSchema.extend({
  deliveredOn: dateSchema.refine(value => value <= new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date()), '实际交付日期不能晚于今天'),
  reason: z.string().trim().min(1).max(300)
}).strict()

export class HistoricalDeliveryService {
  constructor(private readonly db: PrismaClient, private readonly approverId: string) {}
  async complete(actor: Actor, id: string, body: unknown) {
    const input = historicalDeliverySchema.parse(body)
    return command(this.db, actor, input.requestId, { operation: 'historical-delivery', id, input }, async tx => {
      await notificationLock(tx)
      const project = await lockedProject(tx, id, input.version)
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${actor.id} FOR SHARE`
      const user = await tx.user.findUnique({ where: { id: actor.id } })
      if (!user?.active || !(canApproveProjects(user, this.approverId) ||
        (user.role === 'ENGINEER' && isEngineerEligible(user) && user.id === project.primaryOwnerId && !project.migrationVerified)))
        throw new AppError(403, 'PROJECT_EDIT_FORBIDDEN', '仅指定管理员或待核实项目的主负责工程师可登记历史交付')
      writable(project)
      if (project.firstRequestedOn && input.deliveredOn < project.firstRequestedOn.toISOString().slice(0, 10))
        invalid('实际交付日期不能早于需求首次提出日期')
      const now = new Date(), deliveredAt = new Date(`${input.deliveredOn}T00:00:00.000Z`)
      const deliveryPlan = readStagePlans(project.stagePlans).find(plan => plan.stage === '验收交付')
      // Preserve past episodes. Only the known delivery date is recorded; earlier stage dates stay unknown.
      await tx.stageHistory.updateMany({ where: { projectId: id, enteredAt: { not: null }, completedAt: null, interruptedAt: null },
        data: { interruptedAt: now, status: 'interrupted' } })
      await tx.stageHistory.create({ data: { projectId: id, stage: '验收交付', status: 'completed', completedAt: deliveredAt, progress: 100,
        plannedStartDate: deliveryPlan ? new Date(deliveryPlan.startDate) : null,
        plannedEndDate: deliveryPlan ? new Date(deliveryPlan.endDate) : null } })
      await cancelAcceptanceNotifications(tx, id)
      const changed = await tx.project.update({ where: { id }, data: {
        name: project.name.replace(/^【迁移待核实】\s*/, '') || project.name,
        migrationVerified: true, status: 'COMPLETED', stage: '验收交付', simpleStatus: 'completed', overallProgress: 100,
        actualCompletedAt: deliveredAt, blocker: '', acceptanceStatus: 'none', acceptanceSubmittedAt: null,
        stageExpectedDate: deliveryPlan ? new Date(deliveryPlan.endDate) : project.stage === '验收交付' ? project.stageExpectedDate : null,
        acceptanceHistory: acceptanceHistory(project, 'invalidate', actor.id, now, `历史交付补录：${input.reason}`),
        lastOverallUpdatedAt: now, updatedAt: now, version: { increment: 1 }
      }, include: { members: true } })
      await refreshProjectRisks(tx, id, now)
      const after = await tx.project.findUniqueOrThrow({ where: { id }, include: { members: true } })
      await tx.lifecycleEvent.create({ data: { entityType: 'project', entityId: id, authorId: actor.id, action: 'historical-complete',
        reason: input.reason, before: { details: JSON.stringify(mapProject(project)) }, after: { details: JSON.stringify(mapProject(after)) }, createdAt: now } })
      await tx.auditLog.create({ data: { entityType: 'project', entityId: id, actorId: actor.id, action: 'historical-complete',
        payload: { deliveredOn: input.deliveredOn, reason: input.reason } } })
      // Historical registration must not queue a new completion/acceptance notification.
      return { id, version: changed.version }
    })
  }
}
