import type { PrismaClient } from '../../generated/prisma/client.js'
import type { Actor } from '../../plugins/auth.js'
import { assertManager, command } from '../../lib/business-command.js'
import { AppError } from '../../lib/errors.js'
import { deleteProjectGroup } from '../demands/demand-deletion.js'
import { lifecycleEvent } from '../notifications/lifecycle-event-service.js'
import { actionSchema, correctionSchema, STAGES } from '../progress/progress-schemas.js'
import { enterStage, invalid, lockedProject, projectState, scheduleChanges, unchanged, writable, type ProjectChanged } from '../progress/progress-state.js'
export class ProjectAdminService {
  constructor(private readonly db: PrismaClient, private readonly onProjectChanged: ProjectChanged = unchanged) {}
  async action(actor: Actor, id: string, body: unknown) {
    const input = actionSchema.parse(body)
    if (input.action !== 'complete' && input.action !== 'delete') assertManager(actor)
    return command(this.db, actor, input.requestId, { operation: 'project-action', id, input }, async tx => {
      if (input.action === 'delete') return deleteProjectGroup(tx, actor, id, input.version, input.reason)
      // Completing enqueues a demand-linked notification: use the same lock order as deletion.
      if (input.action === 'complete') {
        const source = await tx.project.findUnique({ where: { id }, select: { demandId: true } })
        if (source?.demandId) await tx.$queryRaw`SELECT id FROM demands WHERE id = ${source.demandId} FOR UPDATE`
      }
      const project = await lockedProject(tx, id, input.version)
      const before = projectState(project), now = new Date()
      if (input.action === 'complete') {
        if (actor.id !== project.primaryOwnerId) throw new AppError(403, 'FORBIDDEN', '只有主负责人可以完成项目')
        writable(project)
        if (project.stage !== '验收交付' || project.simpleStatus !== 'completed') invalid('须先完成验收交付阶段')
      }
      if (input.action === 'cancel') {
        writable(project)
        if (!input.reason) invalid('请填写取消原因')
      }
      if (input.action === 'archive' && project.archived) invalid('项目已经归档')
      if (input.action === 'reopen' && project.status === 'ACTIVE' && !project.archived) invalid('项目已经处于进行中')
      if (input.action === 'reopen') {
        const open = await tx.stageHistory.findFirst({ where: { projectId: id, stage: project.stage,
          enteredAt: { not: null }, completedAt: null, interruptedAt: null } })
        if (!open) await enterStage(tx, id, project.stage, now, project.stageExpectedDate)
      }
      const changed = await tx.project.update({ where: { id }, data: {
        ...(input.action === 'complete' ? { status: 'COMPLETED', archived: true } : {}),
        ...(input.action === 'cancel' ? { status: 'CANCELLED' } : {}),
        ...(input.action === 'archive' ? { archived: true } : {}),
        ...(input.action === 'reopen' ? { status: 'ACTIVE', archived: false, simpleStatus: 'in-progress' } : {}),
        version: { increment: 1 }, updatedAt: now
      } })
      await tx.lifecycleEvent.create({ data: { entityType: 'project', entityId: id, authorId: actor.id,
        action: input.action, reason: input.reason ?? '', before, after: projectState(changed) } })
      if (input.action === 'complete' && project.demandId) {
        const demand = await tx.demand.findUniqueOrThrow({ where: { id: project.demandId } })
        await lifecycleEvent(tx, { eventType: 'PROJECT_COMPLETED', requestId: `${actor.id}:${input.requestId}`,
          demandId: demand.id, projectId: id, recipientIds: [demand.ownerId] })
      }
      await this.onProjectChanged(tx, id)
      return { id, version: changed.version }
    })
  }
  async correct(actor: Actor, id: string, body: unknown) {
    assertManager(actor)
    const input = correctionSchema.parse(body)
    return command(this.db, actor, input.requestId, { operation: 'project-correct', id, input }, async tx => {
      const project = await lockedProject(tx, id, input.version)
      writable(project)
      const index = STAGES.indexOf(input.stage), oldIndex = STAGES.indexOf(project.stage as typeof STAGES[number])
      if (index > oldIndex + 1) invalid('不得跳过固定阶段')
      if (index > oldIndex && project.simpleStatus !== 'completed') invalid('须先完成当前阶段')
      if (index < oldIndex && !await tx.stageHistory.count({ where: { projectId: id, stage: input.stage, enteredAt: { not: null } } }))
        invalid('只能纠正到已走过的阶段')
      const status = input.status ?? 'in-progress', blocker = input.blocker ?? project.blocker
      if (status === 'blocked' && !blocker) invalid('请填写阻塞说明')
      if (status === 'completed' && input.stage !== '验收交付') invalid('请通过进度更新完成当前阶段并设置下一阶段日期')
      const dates = await scheduleChanges(tx, project, input, actor.id), now = new Date()
      if (project.stage !== input.stage || (project.simpleStatus === 'completed' && status !== 'completed')) {
        await tx.stageHistory.updateMany({ where: { projectId: id, enteredAt: { not: null }, completedAt: null,
          interruptedAt: null }, data: { interruptedAt: now, status: 'interrupted' } })
        await enterStage(tx, id, input.stage, now, input.stageExpectedDate ? new Date(input.stageExpectedDate) : project.stageExpectedDate)
      }
      if (status === 'completed') await tx.stageHistory.updateMany({ where: { projectId: id, stage: input.stage,
        enteredAt: { not: null }, completedAt: null, interruptedAt: null }, data: { completedAt: now, status: 'completed', progress: 100 } })
      const changed = await tx.project.update({ where: { id }, data: { ...dates, stage: input.stage,
        overallProgress: input.overallProgress, simpleStatus: status, blocker: status === 'blocked' ? blocker : '',
        lastOverallUpdatedAt: now, version: { increment: 1 } } })
      await tx.progressUpdate.create({ data: { projectId: id, authorId: actor.id, kind: 'overall', stage: input.stage,
        status, summary: input.reason, blocker: changed.blocker, overallProgress: input.overallProgress } })
      await tx.lifecycleEvent.create({ data: { entityType: 'project', entityId: id, authorId: actor.id,
        action: 'correct', reason: input.reason, before: projectState(project), after: projectState(changed) } })
      await this.onProjectChanged(tx, id)
      return { id, version: changed.version }
    })
  }
}
