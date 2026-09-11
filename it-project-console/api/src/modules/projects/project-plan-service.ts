import type { PrismaClient } from '../../generated/prisma/client.js'
import type { Actor } from '../../plugins/auth.js'
import { command } from '../../lib/business-command.js'
import { AppError } from '../../lib/errors.js'
import { invalid, lockedProject, unchanged, writable, type ProjectChanged } from '../progress/progress-state.js'
import { PLAN_STAGES, planSchema, readStagePlans, remainingStages, validatePlanOrder } from './project-plan-state.js'

export class ProjectPlanService {
  constructor(private readonly db: PrismaClient, private readonly onProjectChanged: ProjectChanged = unchanged) {}
  async save(actor: Actor, id: string, body: unknown) {
    const input = planSchema.parse(body)
    return command(this.db, actor, input.requestId, { operation: 'project-plan', id, input }, async tx => {
      const project = await lockedProject(tx, id, input.version)
      writable(project)
      if (actor.role !== 'MANAGER' && actor.id !== project.primaryOwnerId) throw new AppError(403, 'FORBIDDEN', '只有主负责人或管理人员可以排期')
      const required = remainingStages(project.stage), old = readStagePlans(project.stagePlans)
      if (input.plans.length !== required.length || input.plans.some((plan, index) => plan.stage !== required[index]))
        invalid('须按顺序一次提交当前和全部后续阶段；已完成阶段不可改写')
      const changes: { stage: string; field: 'startDate' | 'endDate'; oldValue: string; newValue: string }[] = []
      const updated = input.plans.map(plan => {
        const previous = old.find(item => item.stage === plan.stage)
        for (const field of ['startDate', 'endDate'] as const) {
          if (previous && previous[field] !== plan[field]) changes.push({ stage: plan.stage, field, oldValue: previous[field], newValue: plan[field] })
        }
        return { ...plan, originalStartDate: previous?.originalStartDate ?? plan.startDate,
          originalEndDate: previous?.originalEndDate ?? plan.endDate }
      })
      const plans = [...old.filter(item => !required.includes(item.stage)), ...updated]
        .sort((a, b) => PLAN_STAGES.indexOf(a.stage) - PLAN_STAGES.indexOf(b.stage))
      validatePlanOrder(plans)
      if (changes.length && (!input.changeReason || !input.changeDescription)) invalid('调整排期须填写原因和说明')
      for (const change of changes) await tx.scheduleChange.create({ data: {
        projectId: id, authorId: actor.id, field: `stage:${change.stage}:${change.field}`,
        oldValue: change.oldValue, newValue: change.newValue, reason: input.changeReason!, description: input.changeDescription!
      } })
      const launch = plans.find(plan => plan.stage === '上线部署'), delivery = plans.find(plan => plan.stage === '验收交付')
      const expectedDate = new Date(updated[0]!.endDate)
      const changed = await tx.project.update({ where: { id }, data: {
        stagePlans: plans, stageExpectedDate: expectedDate,
        ...(launch ? { currentLaunchDate: new Date(launch.endDate), originalLaunchDate: project.originalLaunchDate ?? new Date(launch.originalEndDate) } : {}),
        ...(delivery ? { currentDeliveryDate: new Date(delivery.endDate), originalDeliveryDate: project.originalDeliveryDate ?? new Date(delivery.originalEndDate) } : {}),
        version: { increment: 1 }
      } })
      await tx.stageHistory.updateMany({ where: { projectId: id, stage: project.stage, enteredAt: { not: null }, completedAt: null, interruptedAt: null }, data: { expectedDate } })
      await tx.lifecycleEvent.create({ data: { entityType: 'project', entityId: id, authorId: actor.id,
        action: 'plan', reason: input.changeDescription ?? (old.length ? '保存排期' : '首次排期'),
        before: { stagePlans: old.map(plan => `${plan.stage} ${plan.startDate} → ${plan.endDate}`).join('；') || '尚未排期' },
        after: { stagePlans: plans.map(plan => `${plan.stage} ${plan.startDate} → ${plan.endDate}`).join('；') } } })
      await this.onProjectChanged(tx, id)
      return { id, version: changed.version }
    })
  }
}
