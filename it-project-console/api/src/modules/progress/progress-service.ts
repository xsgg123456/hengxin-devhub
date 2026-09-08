import type { PrismaClient } from '../../generated/prisma/client.js'
import type { Actor } from '../../plugins/auth.js'
import { command } from '../../lib/business-command.js'
import { AppError } from '../../lib/errors.js'
import { progressSchema, STAGES } from './progress-schemas.js'
import { enterStage, invalid, lockedProject, scheduleChanges, unchanged, writable, type ProjectChanged } from './progress-state.js'
export class ProgressService {
  constructor(private readonly db: PrismaClient, private readonly onProjectChanged: ProjectChanged = unchanged) {}
  async update(actor: Actor, id: string, body: unknown) {
    const input = progressSchema.parse(body)
    return command(this.db, actor, input.requestId, { operation: 'progress', id, input }, async tx => {
      const project = await lockedProject(tx, id, input.version)
      writable(project)
      const overall = actor.role === 'MANAGER' || actor.id === project.primaryOwnerId
      if ((input.kind === 'overall' && !overall) ||
        (input.kind === 'personal' && !overall && !project.members.some(m => m.userId === actor.id)))
        throw new AppError(403, 'FORBIDDEN', '只有主负责人或管理人员能修改整体进度，项目成员可提交个人进展')
      const globalFields = ['overallProgress', 'stageExpectedDate', 'expectedLaunchDate', 'expectedDeliveryDate',
        'nextStageExpectedDate', 'changeReason', 'changeDescription'] as const
      if (input.kind === 'personal' && globalFields.some(field => input[field] !== undefined)) invalid('个人进展不能修改项目整体字段')
      const now = new Date(), status = input.status ?? project.simpleStatus, blocker = input.blocker ?? ''
      if (status === 'blocked' && !blocker) invalid('请填写阻塞说明')
      if (input.kind === 'overall') {
        if (input.overallProgress === undefined) invalid('整体进度须为 0～100%')
        const next = STAGES[STAGES.indexOf(project.stage as typeof STAGES[number]) + 1]
        if (status === 'completed' && next && !input.nextStageExpectedDate) invalid('请填写下一阶段预计完成日期')
        const dates = await scheduleChanges(tx, project, input, actor.id)
        if (project.simpleStatus === 'completed' && status !== 'completed')
          await enterStage(tx, id, project.stage, now, input.stageExpectedDate ? new Date(input.stageExpectedDate) : project.stageExpectedDate)
        if (input.stageExpectedDate) await tx.stageHistory.updateMany({ where: { projectId: id, stage: project.stage,
          enteredAt: { not: null }, completedAt: null, interruptedAt: null }, data: { expectedDate: new Date(input.stageExpectedDate) } })
        await tx.project.update({ where: { id }, data: { ...dates, overallProgress: input.overallProgress,
          simpleStatus: status, blocker: status === 'blocked' ? blocker : '', lastOverallUpdatedAt: now } })
        if (status === 'completed') {
          await tx.stageHistory.updateMany({ where: { projectId: id, stage: project.stage, enteredAt: { not: null },
            completedAt: null, interruptedAt: null }, data: { completedAt: now, status: 'completed', progress: 100 } })
          if (next) {
            const expectedDate = new Date(input.nextStageExpectedDate!)
            await enterStage(tx, id, next, now, expectedDate)
            await tx.project.update({ where: { id }, data: { stage: next, simpleStatus: 'not-started', stageExpectedDate: expectedDate } })
          }
        }
      }
      const update = await tx.progressUpdate.create({ data: { projectId: id, authorId: actor.id, kind: input.kind,
        stage: project.stage, status, summary: input.summary, blocker,
        overallProgress: input.kind === 'overall' ? input.overallProgress : null, createdAt: now } })
      const changed = await tx.project.update({ where: { id }, data: { version: { increment: 1 }, updatedAt: now } })
      await this.onProjectChanged(tx, id)
      return { id: update.id, projectId: id, version: changed.version }
    })
  }
}
