import type { PrismaClient } from '../../generated/prisma/client.js'
import type { Actor } from '../../plugins/auth.js'
import { command } from '../../lib/business-command.js'
import { canApproveProjects } from '../../lib/project-approver.js'
import { AppError } from '../../lib/errors.js'
import { lockedProject, invalid } from '../progress/progress-state.js'
import { STAGES } from '../progress/progress-schemas.js'
import { readStagePlans } from './project-plan-state.js'
import { completionDateSchema } from './completion-date-schemas.js'

const shanghaiToday = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(new Date())
const toDate = (value: string) => new Date(`${value}T00:00:00.000Z`)
const day = (value: Date | null) => value?.toISOString().slice(0, 10) ?? ''
const hasEvidence = (history: { enteredAt: Date | null; completedAt: Date | null; interruptedAt: Date | null }) =>
  !!(history.enteredAt || history.completedAt || history.interruptedAt)
const isCompletionEpisode = (history: { status: string; completedAt: Date | null }) =>
  history.status === 'completed' || !!history.completedAt

export class CompletionDateService {
  constructor(private readonly db: PrismaClient, private readonly approverId: string) {}

  async save(actor: Actor, id: string, body: unknown) {
    const input = completionDateSchema.parse(body)
    return command(this.db, actor, input.requestId, { operation: 'completion-date-edit', id, input }, async tx => {
      const project = await lockedProject(tx, id, input.version)
      const currentActor = await tx.user.findUnique({ where: { id: actor.id } })
      if (!currentActor || !canApproveProjects(currentActor, this.approverId))
        throw new AppError(403, 'COMPLETION_DATE_EDIT_FORBIDDEN', '仅指定管理人员可以修改节点实际完成日期')

      const stageRows = await tx.stageHistory.findMany({
        where: { projectId: id },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
      })
      const applicableStages = project.parentProjectId ? ['验收交付' as const] : STAGES
      const currentIndex = STAGES.indexOf(project.stage as typeof STAGES[number])
      const rowByStage = new Map<string, typeof stageRows[number]>()
      const latestRowByStage = new Map<string, typeof stageRows[number]>()
      for (const stage of applicableStages) {
        const rows = stageRows.filter(item => item.stage === stage)
        const latestRow = rows.at(-1)
        if (latestRow) latestRowByStage.set(stage, latestRow)
        const latest = rows.filter(item => hasEvidence(item) || isCompletionEpisode(item)).at(-1)
        if (latest) rowByStage.set(stage, latest)
      }

      const currentDates = new Map<string, string>()
      for (const [stage, history] of rowByStage) {
        if (!history.interruptedAt && history.completedAt) currentDates.set(stage, day(history.completedAt))
      }
      if (!currentDates.has('验收交付') && project.status === 'COMPLETED' && project.actualCompletedAt)
        currentDates.set('验收交付', day(project.actualCompletedAt))

      const mergedDates = new Map(currentDates)
      const updates = input.dates.filter(({ stage, completedOn }) => {
        const index = STAGES.indexOf(stage)
        if (project.parentProjectId && stage !== '验收交付') invalid('项目优化只有优化完成验收节点')
        if (index < 0 || (index >= currentIndex && !(project.status === 'COMPLETED' && index === currentIndex)))
          invalid(`${stage}尚未按流程完成，不能直接补录实际完成日期`)
        if (completedOn > shanghaiToday()) invalid('实际完成日期不能晚于今天')
        if (project.firstRequestedOn && completedOn < day(project.firstRequestedOn))
          invalid('实际完成日期不能早于需求首次提出日期')
        const latestRow = latestRowByStage.get(stage)
        if (latestRow && !isCompletionEpisode(latestRow)) invalid(`${stage}尚未按流程完成，不能直接补录实际完成日期`)
        const history = rowByStage.get(stage)
        if (history?.interruptedAt) invalid(`${stage}的最新记录已纠正离开，请先按流程恢复后再修改`)
        const old = currentDates.get(stage) ?? ''
        mergedDates.set(stage, completedOn)
        return old !== completedOn
      })

      let previous: { stage: string; date: string } | undefined
      for (const stage of applicableStages) {
        const value = mergedDates.get(stage)
        if (!value) continue
        if (previous && value < previous.date)
          invalid(`${stage}实际完成日期不能早于${previous.stage}`)
        previous = { stage, date: value }
      }
      if (!updates.length) return { id, version: project.version }

      const now = new Date()
      const plans = readStagePlans(project.stagePlans)
      const records: Array<{ stage: string; historyId: string; oldValue: string; newValue: string }> = []
      for (const { stage, completedOn } of updates) {
        const history = rowByStage.get(stage)
        if (history) {
          await tx.stageHistory.update({ where: { id: history.id }, data: {
            completedAt: toDate(completedOn), status: 'completed', progress: 100
          } })
          records.push({ stage, historyId: history.id, oldValue: currentDates.get(stage) ?? '', newValue: completedOn })
          continue
        }
        const plan = plans.find(item => item.stage === stage)
        const created = await tx.stageHistory.create({ data: {
          projectId: id, stage, status: 'completed', completedAt: toDate(completedOn), progress: 100,
          expectedDate: plan ? toDate(plan.endDate) : null
        } })
        records.push({ stage, historyId: created.id, oldValue: currentDates.get(stage) ?? '', newValue: completedOn })
      }

      const finalDelivery = records.find(record => record.stage === '验收交付')
      const changed = await tx.project.update({ where: { id }, data: {
        version: { increment: 1 }, updatedAt: now,
        ...(finalDelivery && project.status === 'COMPLETED' ? { actualCompletedAt: toDate(finalDelivery.newValue) } : {})
      } })
      await tx.completionDateChange.createMany({ data: records.map(record => ({
        projectId: id, historyId: record.historyId, stage: record.stage,
        oldValue: record.oldValue, newValue: record.newValue, reason: input.reason, authorId: actor.id
      })) })
      await tx.auditLog.create({ data: {
        entityType: 'project', entityId: id, actorId: actor.id, action: 'completion-date-edit',
        payload: { reason: input.reason, changes: records }
      } })
      return { id, version: changed.version }
    })
  }
}
