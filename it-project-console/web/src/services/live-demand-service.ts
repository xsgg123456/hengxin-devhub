import type { DemoAttachment } from '@/domain/prototype'
import type { ProjectInput } from './workflow-service'
import { apiRequest } from './api-client'

export interface LiveDemandInput {
  attachments?: DemoAttachment[]
  name: string
  description: string
  expectedLaunchDate: string
  prd: DemoAttachment | null
  prototype: DemoAttachment | null
}
export interface LiveWriteResult {
  id: string
  version: number
}
export function materialDto(material: DemoAttachment | null) {
  if (!material) return null
  if (material.kind === 'link') return { kind: 'link', url: material.url }
  if (material.status !== 'ready' || !material.attachmentId)
    throw new Error('请等待文件上传完成或重试上传')
  return { kind: 'file', attachmentId: material.attachmentId }
}
export function saveLiveDemand(
  input: LiveDemandInput,
  requestId: string,
  submit: boolean,
  id?: string,
  version?: number
) {
  const { attachments, ...fields } = input
  const attachmentIds = attachments
    ?.filter((file) => file.kind === 'file')
    .map((file) => {
      const value = materialDto(file)
      if (!value || !('attachmentId' in value)) throw new Error('请等待文件上传完成')
      return value.attachmentId
    })
  return apiRequest<LiveWriteResult>(id ? `/demands/${id}` : '/demands', {
    method: id ? 'PATCH' : 'POST',
    body: {
      ...fields,
      ...(attachmentIds ? { attachmentIds } : {}),
      name: input.name.trim(),
      description: input.description.trim(),
      expectedLaunchDate: input.expectedLaunchDate || null,
      prd: materialDto(input.prd),
      prototype: materialDto(input.prototype),
      requestId,
      submit,
      ...(id ? { version } : {})
    }
  })
}
export function projectDto(input: ProjectInput) {
  return {
    requestId: input.requestId,
    name: input.name,
    department: input.department,
    priority: input.priority,
    primaryOwnerId: input.primaryOwnerId,
    collaboratorIds: input.collaboratorIds
  }
}
export function createLiveProject(input: ProjectInput) {
  return apiRequest<LiveWriteResult>('/projects', { method: 'POST', body: projectDto(input) })
}
export function reviewLiveDemand(
  id: string,
  version: number | undefined,
  decision: 'establish' | 'return' | 'reject',
  reason: string,
  project: ProjectInput
) {
  return apiRequest<LiveWriteResult>(`/demands/${id}/review`, {
    method: 'POST',
    body: {
      requestId: project.requestId,
      ...(decision === 'establish'
        ? {
            priority: project.priority,
            primaryOwnerId: project.primaryOwnerId,
            collaboratorIds: project.collaboratorIds
          }
        : {}),
      version,
      decision: decision === 'establish' ? 'approve' : decision,
      reason
    }
  })
}
export function actionLiveDemand(
  id: string,
  version: number | undefined,
  action: 'withdraw' | 'delete',
  requestId: string
) {
  return apiRequest<LiveWriteResult>(`/demands/${id}${action === 'withdraw' ? '/withdraw' : ''}`, {
    method: action === 'delete' ? 'DELETE' : 'POST',
    body: { version, requestId }
  })
}

// An unchanged command retries the same key; editing a rejected command starts a new operation.
export function liveOperationKey() {
  let signature = ''
  let requestId = ''
  return (payload: unknown) => {
    const next = JSON.stringify(payload)
    if (next !== signature) {
      signature = next
      requestId = crypto.randomUUID()
    }
    return requestId
  }
}
