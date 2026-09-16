import type { Prisma, PrismaClient } from '../../generated/prisma/client.js'
import type { Actor } from '../../plugins/auth.js'
import { command } from '../../lib/business-command.js'
import { canApproveProjects } from '../../lib/project-approver.js'
import { isEngineerEligible } from '../../lib/it-department.js'
import { AppError } from '../../lib/errors.js'
import { STAGES } from '../progress/progress-schemas.js'
import { enterStage, invalid, lockedProject } from '../progress/progress-state.js'
import { validateProjectMembers } from './project-service.js'
import { readStagePlans, validatePlanOrder } from './project-plan-state.js'
import { acceptanceHistory, notificationLock, validAcceptanceOwner } from './acceptance-state.js'
import { cancelAcceptanceNotifications } from '../notifications/acceptance-notifications.js'
import { lifecycleEvent } from '../notifications/lifecycle-event-service.js'
import { refreshProjectRisks } from '../risks/risk-scan-job.js'
import { mapProject } from '../workspace/read-model.js'
import { projectEditSchema } from './project-edit-schemas.js'

const date = (value: string | null) => value ? new Date(`${value}T00:00:00.000Z`) : null
const state = (project: Parameters<typeof mapProject>[0]) => ({ details: JSON.stringify(mapProject(project)) })

export class ProjectEditService {
  constructor(private readonly db: PrismaClient, private readonly approverId: string) {}
  async save(actor: Actor, id: string, body: unknown) {
    const input = projectEditSchema.parse(body)
    return command(this.db, actor, input.requestId, { operation: 'project-edit', id, input }, async tx => {
      await notificationLock(tx)
      // Same demand -> project lock order as acceptance and demand workflows.
      const source = await tx.project.findUnique({ where: { id }, select: { demandId: true } })
      if (source?.demandId) await tx.$queryRaw`SELECT id FROM demands WHERE id = ${source.demandId} FOR UPDATE`
      const project = await lockedProject(tx, id, input.version)
      const ids = [...new Set([actor.id, input.primaryOwnerId, ...input.collaboratorIds,
        input.businessOwnerId, input.acceptanceOwnerId].filter((id): id is string => !!id))].sort()
      for (const userId of ids) await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR SHARE`
      const currentActor = await tx.user.findUnique({ where: { id: actor.id } })
      if (!currentActor?.active || !(canApproveProjects(currentActor, this.approverId) ||
        (currentActor.role === 'ENGINEER' && isEngineerEligible(currentActor) &&
          currentActor.id === project.primaryOwnerId && !project.migrationVerified)))
        throw new AppError(403, 'PROJECT_EDIT_FORBIDDEN', '仅指定管理员或待核实项目的主负责工程师可完整编辑')
      await validateProjectMembers(tx, input)
      if (input.businessOwnerId && !await tx.user.count({ where: { id: input.businessOwnerId, active: true } })) invalid('业务负责人无效')
      if (input.acceptanceOwnerId) await validAcceptanceOwner(tx, input.acceptanceOwnerId)
      if (input.verify && project.migrationVerified) invalid('项目已核实，请使用保存修改')
      if (input.verify && (!input.firstRequestedOn || !input.businessOwnerId || !input.acceptanceOwnerId ||
        !input.expectedLaunchDate || !input.expectedDeliveryDate)) invalid('完成核实前请补齐首次提出日期、业务人员及预计上线交付日期')
      if (input.simpleStatus === 'blocked' && !input.blocker) invalid('请填写阻塞说明')
      if (project.parentProjectId && (input.stage !== '验收交付' || input.stagePlans.some(p => p.stage !== '验收交付')))
        invalid('项目优化只有优化完成验收节点')
      if (project.parentProjectId && (input.expectedLaunchDate !== input.expectedDeliveryDate || input.originalLaunchDate !== input.originalDeliveryDate))
        invalid('优化上线和交付日期须保持一致')
      if (project.acceptanceStatus === 'pending' && JSON.stringify(input.stagePlans) !== JSON.stringify(readStagePlans(project.stagePlans).map(({ stage, startDate, endDate }) => ({ stage, startDate, endDate }))))
        invalid('待验收期间请先撤回验收再调整排期')
      const stageChanged = input.stage !== project.stage
      const progressChanged = stageChanged || input.simpleStatus !== project.simpleStatus || input.blocker !== project.blocker
      if (input.simpleStatus === 'completed' && (stageChanged || project.simpleStatus !== 'completed')) invalid('请通过原进度与业务验收流程完成阶段')
      if ((project.status !== 'ACTIVE' || project.archived) && progressChanged) invalid('已关闭项目须先重新打开才能调整阶段进度')
      if (project.acceptanceStatus === 'pending' && (progressChanged || input.acceptanceUrl !== project.acceptanceUrl ||
        input.acceptanceSummary !== project.acceptanceSummary || !input.acceptanceOwnerId)) invalid('待验收期间请先撤回验收再修改阶段、状态或交付资料')
      for (const [start, end] of [[input.expectedLaunchDate, input.expectedDeliveryDate], [input.originalLaunchDate, input.originalDeliveryDate]])
        if (start && end && start > end) invalid('交付日期不得早于上线日期')
      if (new Set(input.stagePlans.map(p => p.stage)).size !== input.stagePlans.length) invalid('环节计划不能重复')
      const oldPlans = readStagePlans(project.stagePlans)
      const plans = input.stagePlans.map(plan => {
        const old = oldPlans.find(p => p.stage === plan.stage)
        return { ...plan, originalStartDate: old?.originalStartDate ?? plan.startDate, originalEndDate: old?.originalEndDate ?? plan.endDate }
      }).sort((a, b) => STAGES.indexOf(a.stage) - STAGES.indexOf(b.stage))
      if (project.parentProjectId && (oldPlans.length || progressChanged) && plans.length !== 1)
        invalid('项目优化开始执行后必须保留优化完成验收排期')
      validatePlanOrder(plans)
      const launch = plans.find(p => p.stage === (project.parentProjectId ? '验收交付' : '上线部署')), delivery = plans.find(p => p.stage === '验收交付')
      if ((launch && input.expectedLaunchDate !== launch.endDate) || (delivery && input.expectedDeliveryDate !== delivery.endDate))
        invalid('预计上线/交付日期须与对应环节计划结束日期一致')
      const now = new Date(), oldBusiness = project.businessOwnerId
      const ownerChanged = project.primaryOwnerId !== input.primaryOwnerId
      const acceptanceChanged = project.acceptanceOwnerId !== input.acceptanceOwnerId
      const currentPlan = plans.find(plan => plan.stage === input.stage)
      const stageExpectedDate = currentPlan ? date(currentPlan.endDate) :
        !stageChanged && !oldPlans.some(plan => plan.stage === input.stage) ? project.stageExpectedDate : null
      const before = state(project)
      const data: Prisma.ProjectUncheckedUpdateInput = {
        name: input.verify ? input.name.replace(/^【迁移待核实】/, '').trim() : input.name,
        description: input.description, department: input.department, priority: input.priority,
        firstRequestedOn: date(input.firstRequestedOn), businessOwnerId: input.businessOwnerId,
        primaryOwnerId: input.primaryOwnerId, acceptanceOwnerId: input.acceptanceOwnerId,
        stage: input.stage, simpleStatus: input.simpleStatus, blocker: input.simpleStatus === 'blocked' ? input.blocker : '',
        approvedLaunchDate: date(input.approvedLaunchDate), originalLaunchDate: date(input.originalLaunchDate),
        originalDeliveryDate: date(input.originalDeliveryDate), currentLaunchDate: date(input.expectedLaunchDate),
        currentDeliveryDate: date(input.expectedDeliveryDate), stagePlans: plans, stageExpectedDate,
        acceptanceUrl: input.acceptanceUrl, acceptanceSummary: input.acceptanceSummary,
        migrationVerified: input.verify ? true : project.migrationVerified, version: { increment: 1 },
        ...(progressChanged ? { lastOverallUpdatedAt: now } : {}),
        ...(acceptanceChanged ? { acceptanceHistory: acceptanceHistory(project, 'assign', actor.id, now, input.reason, input.acceptanceOwnerId) } : {})
      }
      if (!data.name) invalid('项目名称不能为空')
      // Renaming a pending project cannot silently remove the visible verification reminder.
      if (!project.migrationVerified && !input.verify && !input.name.startsWith('【迁移待核实】')) data.name = `【迁移待核实】${input.name}`
      if (stageChanged) {
        await tx.stageHistory.updateMany({ where: { projectId: id, enteredAt: { not: null }, completedAt: null, interruptedAt: null },
          data: { interruptedAt: now, status: 'interrupted' } })
        await enterStage(tx, id, input.stage, now, stageExpectedDate)
      } else await tx.stageHistory.updateMany({ where: { projectId: id, stage: project.stage, enteredAt: { not: null }, completedAt: null, interruptedAt: null }, data: { expectedDate: stageExpectedDate } })
      if (progressChanged) await tx.progressUpdate.create({ data: { projectId: id, authorId: actor.id, kind: 'overall',
        stage: input.stage, status: input.simpleStatus, summary: input.reason, blocker: input.simpleStatus === 'blocked' ? input.blocker : '' } })
      for (const [field, oldValue, newValue] of [
        ['approvedLaunchDate', project.approvedLaunchDate?.toISOString().slice(0, 10) ?? '', input.approvedLaunchDate ?? ''],
        ['expectedLaunchDate', project.currentLaunchDate?.toISOString().slice(0, 10) ?? '', input.expectedLaunchDate ?? ''],
        ['expectedDeliveryDate', project.currentDeliveryDate?.toISOString().slice(0, 10) ?? '', input.expectedDeliveryDate ?? ''],
        ...STAGES.flatMap(stage => (['startDate', 'endDate'] as const).map(field => [
          `stage:${stage}:${field}`, oldPlans.find(p => p.stage === stage)?.[field] ?? '', plans.find(p => p.stage === stage)?.[field] ?? ''
        ]))
      ]) if (oldValue !== newValue) await tx.scheduleChange.create({ data: { projectId: id, authorId: actor.id,
        field: field!, oldValue: oldValue!, newValue: newValue!, reason: '其他', description: input.reason } })
      await tx.projectMember.deleteMany({ where: { projectId: id } })
      await tx.projectMember.createMany({ data: input.collaboratorIds.map(userId => ({ projectId: id, userId })) })
      const changed = await tx.project.update({ where: { id }, data, include: { members: true } })
      if (project.demandId) {
        const demand = await tx.demand.findUniqueOrThrow({ where: { id: project.demandId } })
        if (demand.name !== changed.name || demand.firstRequestedOn?.getTime() !== changed.firstRequestedOn?.getTime()) {
          await tx.demand.update({ where: { id: demand.id }, data: { name: changed.name, firstRequestedOn: changed.firstRequestedOn, version: { increment: 1 } } })
          await tx.lifecycleEvent.create({ data: { entityType: 'demand', entityId: demand.id, authorId: actor.id, action: 'edit', reason: input.reason,
            before: { name: demand.name, firstRequestedOn: demand.firstRequestedOn?.toISOString().slice(0, 10) ?? '', version: demand.version },
            after: { name: changed.name, firstRequestedOn: changed.firstRequestedOn?.toISOString().slice(0, 10) ?? '', version: demand.version + 1 } } })
        }
      }
      if (acceptanceChanged || ownerChanged) {
        await cancelAcceptanceNotifications(tx, id)
        const pending = changed.acceptanceStatus === 'pending', returned = changed.acceptanceStatus === 'returned'
        if (pending || returned) await lifecycleEvent(tx, { eventType: pending ? 'ACCEPTANCE_SUBMITTED' : 'ACCEPTANCE_RETURNED',
          requestId: `${actor.id}:${input.requestId}`, projectId: id, demandId: changed.demandId ?? undefined,
          recipientIds: [pending ? changed.acceptanceOwnerId! : changed.primaryOwnerId], acceptanceRound: changed.acceptanceRound, reason: input.reason })
      }
      const newMembers = [changed.primaryOwnerId, ...input.collaboratorIds, ...(changed.businessOwnerId ? [changed.businessOwnerId] : [])]
      const oldMembers = new Set([project.primaryOwnerId, ...project.members.map(m => m.userId), ...(oldBusiness ? [oldBusiness] : [])])
      await lifecycleEvent(tx, { eventType: 'PROJECT_ASSIGNED', requestId: `${actor.id}:${input.requestId}`, projectId: id,
        demandId: project.demandId ?? undefined, recipientIds: newMembers.filter(userId => !oldMembers.has(userId)), reason: input.reason })
      await tx.lifecycleEvent.create({ data: { entityType: 'project', entityId: id, authorId: actor.id,
        action: input.verify ? 'verify' : 'edit', reason: input.reason, before, after: state(changed) } })
      await refreshProjectRisks(tx, id, now)
      return { id, version: changed.version }
    })
  }
}
