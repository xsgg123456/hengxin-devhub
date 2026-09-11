import type { PrismaClient } from '../../generated/prisma/client.js'
import type { Actor } from '../../plugins/auth.js'
import { command } from '../../lib/business-command.js'
import { AppError } from '../../lib/errors.js'
import { lifecycleEvent } from '../notifications/lifecycle-event-service.js'
import { assertScheduled } from '../projects/project-plan-state.js'
import { progressSchema, STAGES } from './progress-schemas.js'
import { enterStage, invalid, lockedProject, projectState, unchanged, writable, type ProjectChanged } from './progress-state.js'
export class ProgressService {
  constructor(private readonly db: PrismaClient, private readonly onProjectChanged: ProjectChanged = unchanged) {}
  async update(actor: Actor, id: string, body: unknown) {
    const input = progressSchema.parse(body)
    return command(this.db, actor, input.requestId, { operation: 'progress', id, input }, async tx => {
      // Completion creates a demand-linked outbox record; preserve demand -> project lock order.
      const source = await tx.project.findUnique({ where: { id }, select: { demandId: true } })
      if (source?.demandId) await tx.$queryRaw`SELECT id FROM demands WHERE id = ${source.demandId} FOR UPDATE`
      const project = await lockedProject(tx, id, input.version)
      writable(project)
      const overall = actor.role === 'MANAGER' || actor.id === project.primaryOwnerId
      if ((input.kind === 'overall' && !overall) ||
        (input.kind === 'personal' && !overall && !project.members.some(m => m.userId === actor.id)))
        throw new AppError(403, 'FORBIDDEN', '只有主负责人或管理人员能修改整体进度，项目成员可提交个人进展')
      const now = new Date(), status = input.status ?? 'in-progress', blocker = input.blocker ?? ''
      if (status === 'blocked' && !blocker) invalid('请填写阻塞说明')
      if (input.kind === 'overall') {
        const plans = assertScheduled(project.stage, project.stagePlans)
        const next = STAGES[STAGES.indexOf(project.stage as typeof STAGES[number]) + 1]
        await tx.project.update({ where: { id }, data: {
          simpleStatus: status, blocker: status === 'blocked' ? blocker : '', lastOverallUpdatedAt: now
        } })
        if (status === 'completed') {
          const plan = plans.find(plan => plan.stage === project.stage)!
          const snapshot = { plannedStartDate: new Date(plan.startDate), plannedEndDate: new Date(plan.endDate) }
          const finished = await tx.stageHistory.updateMany({ where: { projectId: id, stage: project.stage, enteredAt: { not: null },
            completedAt: null, interruptedAt: null }, data: { completedAt: now, status: 'completed', ...snapshot } })
          if (!finished.count) {
            // A legacy stage may have no start evidence. Record only the observed completion.
            const future = await tx.stageHistory.findFirst({ where: { projectId: id, stage: project.stage, status: 'future', enteredAt: null } })
            const data = { completedAt: now, status: 'completed', expectedDate: project.stageExpectedDate, ...snapshot }
            if (future) await tx.stageHistory.update({ where: { id: future.id }, data })
            else await tx.stageHistory.create({ data: { projectId: id, stage: project.stage, ...data } })
          }
          if (next) {
            const expectedDate = new Date(plans.find(plan => plan.stage === next)!.endDate)
            await enterStage(tx, id, next, now, expectedDate)
            await tx.project.update({ where: { id }, data: { stage: next, simpleStatus: 'not-started', stageExpectedDate: expectedDate } })
          } else {
            const completed = await tx.project.update({ where: { id }, data: { status: 'COMPLETED', actualCompletedAt: now } })
            await tx.lifecycleEvent.create({ data: { entityType: 'project', entityId: id, authorId: actor.id,
              action: 'complete', reason: input.summary, before: projectState(project), after: projectState(completed), createdAt: now } })
            if (project.demandId) {
              const demand = await tx.demand.findUniqueOrThrow({ where: { id: project.demandId } })
              await lifecycleEvent(tx, { eventType: 'PROJECT_COMPLETED', requestId: `${actor.id}:${input.requestId}`,
                demandId: demand.id, projectId: id, recipientIds: [demand.ownerId] })
            }
          }
        }
      }
      const update = await tx.progressUpdate.create({ data: { projectId: id, authorId: actor.id, kind: input.kind,
        stage: project.stage, status, summary: input.summary, blocker, createdAt: now } })
      const changed = await tx.project.update({ where: { id }, data: { version: { increment: 1 }, updatedAt: now } })
      await this.onProjectChanged(tx, id)
      return { id: update.id, projectId: id, version: changed.version }
    })
  }
}
