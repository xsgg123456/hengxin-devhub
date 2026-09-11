import type { PrismaClient } from '../../generated/prisma/client.js'
import type { Actor } from '../../plugins/auth.js'
import { assertManager, command } from '../../lib/business-command.js'
import { deleteProjectGroup } from '../demands/demand-deletion.js'
import { actionSchema, correctionSchema, STAGES } from '../progress/progress-schemas.js'
import { enterStage, invalid, lockedProject, projectState, unchanged, writable, type ProjectChanged } from '../progress/progress-state.js'
import { readStagePlans } from './project-plan-state.js'
export class ProjectAdminService {
  constructor(private readonly db: PrismaClient, private readonly onProjectChanged: ProjectChanged = unchanged) {}
  async action(actor: Actor, id: string, body: unknown) {
    const input = actionSchema.parse(body)
    if (input.action === 'complete') invalid('请通过验收交付阶段更新完成项目')
    if (input.action !== 'delete') assertManager(actor)
    return command(this.db, actor, input.requestId, { operation: 'project-action', id, input }, async tx => {
      if (input.action === 'delete') return deleteProjectGroup(tx, actor, id, input.version, input.reason)
      const project = await lockedProject(tx, id, input.version)
      const before = projectState(project), now = new Date()
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
        ...(input.action === 'cancel' ? { status: 'CANCELLED' } : {}),
        ...(input.action === 'archive' ? { archived: true } : {}),
        ...(input.action === 'reopen' ? { status: 'ACTIVE', archived: false, simpleStatus: 'in-progress', actualCompletedAt: null } : {}),
        version: { increment: 1 }, updatedAt: now
      } })
      await tx.lifecycleEvent.create({ data: { entityType: 'project', entityId: id, authorId: actor.id,
        action: input.action, reason: input.reason ?? '', before, after: projectState(changed) } })
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
      if (index < 2) invalid('受理与立项由系统记录，不能纠正为工程执行阶段')
      if (index > oldIndex + 1) invalid('不得跳过固定阶段')
      if (index > oldIndex && project.simpleStatus !== 'completed') invalid('须先完成当前阶段')
      if (index < oldIndex && !await tx.stageHistory.count({ where: { projectId: id, stage: input.stage,
        OR: [{ enteredAt: { not: null } }, { completedAt: { not: null } }, { interruptedAt: { not: null } }] } }))
        invalid('只能纠正到已走过的阶段')
      const status = input.status ?? 'in-progress', blocker = input.blocker ?? project.blocker
      if (status === 'blocked' && !blocker) invalid('请填写阻塞说明')
      if (status === 'completed') invalid('请通过进度更新完成当前阶段')
      const now = new Date(), plan = readStagePlans(project.stagePlans).find(plan => plan.stage === input.stage)
      const expectedDate = plan ? new Date(plan.endDate) : project.stage === input.stage ? project.stageExpectedDate : null
      if (project.stage !== input.stage || project.simpleStatus === 'completed') {
        await tx.stageHistory.updateMany({ where: { projectId: id, enteredAt: { not: null }, completedAt: null,
          interruptedAt: null }, data: { interruptedAt: now, status: 'interrupted' } })
        await enterStage(tx, id, input.stage, now, expectedDate)
      }
      const changed = await tx.project.update({ where: { id }, data: { stage: input.stage,
        simpleStatus: status, blocker: status === 'blocked' ? blocker : '', stageExpectedDate: expectedDate,
        actualCompletedAt: null, lastOverallUpdatedAt: now, version: { increment: 1 } } })
      await tx.progressUpdate.create({ data: { projectId: id, authorId: actor.id, kind: 'overall', stage: input.stage,
        status, summary: input.reason, blocker: changed.blocker } })
      await tx.lifecycleEvent.create({ data: { entityType: 'project', entityId: id, authorId: actor.id,
        action: 'correct', reason: input.reason, before: projectState(project), after: projectState(changed) } })
      await this.onProjectChanged(tx, id)
      return { id, version: changed.version }
    })
  }
}
