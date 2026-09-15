import { cancelAcceptanceNotifications } from '../notifications/acceptance-notifications.js'
import type { Prisma, PrismaClient } from '../../generated/prisma/client.js'
import type { Actor } from '../../plugins/auth.js'
import { command } from '../../lib/business-command.js'
import { AppError } from '../../lib/errors.js'
import { isEngineerEligible } from '../../lib/it-department.js'
import { lockedProject, writable, invalid, projectState } from '../progress/progress-state.js'
import { lifecycleEvent } from '../notifications/lifecycle-event-service.js'
import { refreshProjectRisks } from '../risks/risk-scan-job.js'
import { assertScheduled } from './project-plan-state.js'
import { acceptanceSchema } from './acceptance-schemas.js'
import { acceptanceHistory, finishAcceptanceStage, notificationLock, validAcceptanceOwner } from './acceptance-state.js'
export class AcceptanceService {
  constructor(private readonly db: PrismaClient) {}
  async act(actor: Actor, id: string, body: unknown) {
    const input = acceptanceSchema.parse(body)
    return command(this.db, actor, input.requestId, { operation: 'project-acceptance', id, input }, async tx => {
      await notificationLock(tx)
      const source = await tx.project.findUnique({ where: { id }, select: { demandId: true } })
      if (source?.demandId) await tx.$queryRaw`SELECT id FROM demands WHERE id = ${source.demandId} FOR UPDATE`
      const project = await lockedProject(tx, id, input.version)
      writable(project)
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${actor.id} FOR SHARE`
      const currentActor = await tx.user.findUnique({ where: { id: actor.id } })
      if (!currentActor?.active) throw new AppError(403, 'FORBIDDEN', '账号已停用')
      const { action } = input, now = new Date(), summary = input.summary ?? ''
      if (action === 'assign') {
        if (currentActor.role !== 'MANAGER') throw new AppError(403, 'FORBIDDEN', '只有管理人员可改派验收人')
        await validAcceptanceOwner(tx, input.ownerId)
        if (input.ownerId === project.acceptanceOwnerId) invalid('验收负责人未变化')
      } else {
        if (action === 'submit' || action === 'withdraw') {
          if (actor.id !== project.primaryOwnerId || currentActor.role !== 'ENGINEER' || !isEngineerEligible(currentActor))
            throw new AppError(403, 'FORBIDDEN', '仅主负责工程师可提交或撤回验收')
        } else {
          if (actor.id !== project.acceptanceOwnerId)
            throw new AppError(403, 'FORBIDDEN', '仅指定业务验收人可通过或退回')
          await validAcceptanceOwner(tx, project.acceptanceOwnerId)
        }
        if (project.stage !== '验收交付') invalid(project.parentProjectId ? '请在优化完成验收节点操作验收' : '仅验收交付阶段可操作验收')
        if (action === 'submit') {
          if (project.acceptanceStatus === 'pending') invalid('已提交验收，请等待业务确认或撤回')
          await validAcceptanceOwner(tx, project.acceptanceOwnerId)
          assertScheduled(project.stage, project.stagePlans, !!project.parentProjectId)
        } else if (project.acceptanceStatus !== 'pending') invalid('当前没有待业务验收的提交')
      }
      const round = project.acceptanceRound + (action === 'submit' ? 1 : 0)
      const ownerId = action === 'assign' ? input.ownerId : project.acceptanceOwnerId
      const url = action === 'submit' ? input.url ?? '' : ''
      const data: Prisma.ProjectUpdateInput = {
        acceptanceHistory: acceptanceHistory(project, action, actor.id, now, summary, ownerId, round, url),
        version: { increment: 1 }, updatedAt: now
      }
      if (action === 'assign') data.acceptanceOwnerId = ownerId
      if (action === 'submit') Object.assign(data, { acceptanceStatus: 'pending', acceptanceRound: round,
        acceptanceSubmittedAt: now, acceptanceSummary: summary, acceptanceUrl: url, simpleStatus: 'in-progress', blocker: '' })
      if (action === 'return' || action === 'withdraw') Object.assign(data, {
        acceptanceStatus: action === 'return' ? 'returned' : 'none', simpleStatus: 'in-progress', lastOverallUpdatedAt: now
      })
      if (action === 'accept') {
        const plan = assertScheduled(project.stage, project.stagePlans, !!project.parentProjectId).find(row => row.stage === project.stage)!
        await finishAcceptanceStage(tx, project, now, plan)
        Object.assign(data, { acceptanceStatus: 'accepted', status: 'COMPLETED', simpleStatus: 'completed', actualCompletedAt: now })
      }
      if (action !== 'assign' || project.acceptanceStatus === 'pending') await cancelAcceptanceNotifications(tx, id)
      const changed = await tx.project.update({ where: { id }, data })
      await tx.auditLog.create({ data: { actorId: actor.id, action: `acceptance-${action}`, entityType: 'project', entityId: id,
        payload: { round, ownerId, summary, url } } })
      const event = { requestId: `${actor.id}:${input.requestId}`, projectId: id, demandId: project.demandId ?? undefined, acceptanceRound: round, reason: summary }
      if (action === 'submit' || (action === 'assign' && project.acceptanceStatus === 'pending'))
        await lifecycleEvent(tx, { ...event, eventType: 'ACCEPTANCE_SUBMITTED', recipientIds: [ownerId!] })
      if (action === 'return') await lifecycleEvent(tx, { ...event, eventType: 'ACCEPTANCE_RETURNED', recipientIds: [project.primaryOwnerId] })
      if (action === 'accept') {
        await lifecycleEvent(tx, { ...event, eventType: 'PROJECT_COMPLETED',
          recipientIds: [project.primaryOwnerId, ...project.members.map(member => member.userId), ...(project.businessOwnerId ? [project.businessOwnerId] : [])] })
        await tx.lifecycleEvent.create({ data: { entityType: 'project', entityId: id, authorId: actor.id, action: 'complete',
          reason: summary, before: projectState(project), after: projectState(changed), createdAt: now } })
      }
      await refreshProjectRisks(tx, id, now)
      return { id, version: changed.version }
    })
  }
}
