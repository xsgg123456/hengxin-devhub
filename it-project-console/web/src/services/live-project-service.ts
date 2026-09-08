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
    overallProgress: input.overallProgress ?? 0,
    reason: input.summary,
    status: input.status,
    blocker: input.blocker,
    stageExpectedDate: input.stageExpectedDate,
    expectedLaunchDate: input.expectedLaunchDate,
    expectedDeliveryDate: input.expectedDeliveryDate,
    changeReason: input.changeReason,
    changeDescription: input.changeDescription
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
