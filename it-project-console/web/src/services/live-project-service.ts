import { apiRequest } from './api-client'
import type { ProgressInput } from './progress-service'
import type { CorrectionInput } from './management-service'
import type { ProjectActionInput } from './lifecycle-service'
import type { ProjectStage } from '@/domain/prototype'
import type { LiveWriteResult } from './live-demand-service'

export function updateLiveProgress(
  input: ProgressInput,
  version: number | undefined,
  requestId: string
) {
  const { projectId, now: _now, ...body } = input
  return apiRequest<LiveWriteResult>(`/projects/${projectId}/progress`, {
    method: 'POST',
    body: { ...body, version, requestId }
  })
}
export function toCorrectionInput(input: ProgressInput, stage: ProjectStage): CorrectionInput {
  return {
    projectId: input.projectId,
    stage,
    reason: input.summary,
    status: input.status,
    blocker: input.blocker
  }
}
export function correctLiveProject(
  input: CorrectionInput,
  version: number | undefined,
  requestId: string
) {
  const { projectId, now: _now, ...body } = input
  return apiRequest<LiveWriteResult>(`/projects/${projectId}/correct`, {
    method: 'POST',
    body: { ...body, version, requestId }
  })
}
export function actionLiveProject(
  input: ProjectActionInput,
  version: number | undefined,
  requestId: string
) {
  return apiRequest<LiveWriteResult>(`/projects/${input.projectId}/action`, {
    method: 'POST',
    body: { action: input.action, reason: input.reason ?? '', version, requestId }
  })
}

export function planLiveProject(
  input: import('./stage-plan-service').PlanInput,
  version: number | undefined,
  requestId: string
) {
  return apiRequest<LiveWriteResult>(`/projects/${input.projectId}/plan`, {
    method: 'POST',
    body: {
      version,
      requestId,
      plans: input.plans.map(({ stage, startDate, endDate }) => ({ stage, startDate, endDate })),
      changeReason: input.changeReason,
      changeDescription: input.changeDescription
    }
  })
}

export function editLiveProject(
  project: import('@/domain/prototype').DemoProject,
  reason: string,
  verify: boolean,
  requestId: string
) {
  const fields = [
    'name', 'description', 'department', 'priority', 'primaryOwnerId', 'collaboratorIds',
    'stage', 'simpleStatus', 'blocker', 'acceptanceUrl', 'acceptanceSummary'
  ] as const
  const dates = ['firstRequestedOn', 'approvedLaunchDate', 'originalLaunchDate',
    'originalDeliveryDate', 'expectedLaunchDate', 'expectedDeliveryDate'] as const
  if (!Number.isInteger(project.version)) throw new Error('项目版本缺失，请关闭后刷新重试')
  if (!reason.trim()) throw new Error('请填写本次修改原因')
  return apiRequest<LiveWriteResult>(`/projects/${project.id}/edit`, {
    method: 'POST',
    body: {
      ...Object.fromEntries(fields.map(key => [key, project[key] ?? ''])),
      ...Object.fromEntries(dates.map(key => [key, project[key] || null])),
      businessOwnerId: project.businessOwnerId || null,
      acceptanceOwnerId: project.acceptanceOwnerId || null,
      stagePlans: (project.stagePlans ?? [])
        .filter(plan => plan.startDate || plan.endDate)
        .map(({ stage, startDate, endDate }) => ({ stage, startDate: startDate || '', endDate: endDate || '' })),
      version: project.version, requestId, reason: reason.trim(), verify
    }
  })
}
