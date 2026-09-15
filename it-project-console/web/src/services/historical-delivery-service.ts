import type { PrototypeSnapshot } from '@/domain/prototype'
import { canEditProject } from '@/utils/project-edit-permission'
import { apiRequest } from './api-client'
import { assertWrite, dateValue, shanghaiDay, textValue, WorkflowError } from './workflow-validation'
import { projectState, recordLifecycle } from './lifecycle-service'

export interface HistoricalDeliveryInput {
  projectId: string
  requestId: string
  version: number
  deliveredOn: string
  reason: string
}

export function registerHistoricalDelivery(snapshot: PrototypeSnapshot, input: HistoricalDeliveryInput, now = new Date().toISOString()) {
  const actor = assertWrite(snapshot)
  const project = snapshot.database.projects.find(p => p.id === input.projectId)
  if (!project) throw new WorkflowError('项目不存在')
  if (project.parentProjectId) throw new WorkflowError('优化项目必须通过业务验收完成')
  const reason = textValue(input.reason, '补录原因')
  textValue(input.requestId, '请求编号', 200)
  const old = snapshot.database.lifecycleEvents.find(e => e.requestId === input.requestId)
  if (old) {
    if (old.entityId !== project.id || old.authorId !== actor.id || old.action !== 'historical-complete' || old.requestVersion !== input.version || old.reason !== reason || old.after.actualCompletedAt !== `${input.deliveredOn}T00:00:00.000Z`)
      throw new WorkflowError('请求编号已使用')
    return { id: project.id, version: Number(old.after.version) }
  }
  if (!canEditProject(actor, project)) throw new WorkflowError('当前无完整编辑权限')
  if (project.status !== 'active' || project.archived) throw new WorkflowError('仅未归档的进行中项目可登记历史交付')
  if (input.version !== (project.version ?? 0)) throw new WorkflowError('项目已更新，请刷新后重试')
  dateValue(input.deliveredOn, '实际交付日期')
  if (input.deliveredOn > shanghaiDay(now)) throw new WorkflowError('实际交付日期不能晚于今天')
  const firstRequestedOn = project.firstRequestedOn || snapshot.database.demands.find(d => d.id === project.demandId)?.firstRequestedOn
  if (firstRequestedOn && input.deliveredOn < firstRequestedOn) throw new WorkflowError('实际交付日期不能早于需求首次提出日期')
  const before = { ...projectState(project), details: JSON.stringify(project) }
  project.status = 'completed'
  project.stage = '验收交付'
  project.simpleStatus = 'completed'
  project.overallProgress = 100
  project.actualCompletedAt = `${input.deliveredOn}T00:00:00.000Z`
  project.migrationVerified = true
  project.name = project.name.replace(/^【迁移待核实】\s*/, '') || project.name
  project.blocker = ''
  project.risks = []
  project.acceptanceStatus = 'none'
  project.acceptanceSubmittedAt = null
  project.acceptanceHistory ??= []
  project.acceptanceHistory.push({ id: crypto.randomUUID(), action: 'invalidate', actorId: actor.id, createdAt: now, round: project.acceptanceRound ?? 0, summary: `历史交付补录：${reason}`, url: '', ownerId: project.acceptanceOwnerId ?? null })
  for (const history of snapshot.database.stageHistories) {
    if (history.projectId === project.id && history.completedAt === null && !history.interruptedAt) history.interruptedAt = now
  }
  const plan = project.stagePlans?.find(p => p.stage === '验收交付')
  project.stageExpectedDate = plan?.endDate || (before.stage === '验收交付' ? project.stageExpectedDate : '')
  snapshot.database.stageHistories.push({ projectId: project.id, stage: '验收交付', startedAt: '', completedAt: project.actualCompletedAt, plannedStartDate: plan?.startDate ?? null, plannedEndDate: plan?.endDate ?? null })
  project.version = (project.version ?? 0) + 1
  project.updatedAt = now
  project.lastOverallUpdatedAt = now
  recordLifecycle(snapshot, { entityType: 'project', entityId: project.id, action: 'historical-complete', requestId: input.requestId, requestVersion: input.version, createdAt: now, reason, before, after: { ...projectState(project), version: project.version, details: JSON.stringify(project) } })
  return { id: project.id, version: project.version }
}

export function registerLiveHistoricalDelivery(input: HistoricalDeliveryInput) {
  const { projectId, ...body } = input
  return apiRequest<{ id: string; version: number }>(`/projects/${projectId}/historical-delivery`, { method: 'POST', body })
}
