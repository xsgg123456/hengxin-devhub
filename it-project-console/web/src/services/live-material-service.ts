import { ApiError, apiRequest } from './api-client'
import type { DemoAttachment } from '@/domain/prototype'
interface UploadTicket {
  attachmentId: string
  uploadUrl: string
  headers: Record<string, string>
}
export async function uploadLiveMaterial(
  demandId: string,
  kind: 'prd' | 'prototype',
  file: File,
  onTicket?: (id: string) => void
): Promise<DemoAttachment> {
  const fallbackMime: Record<string, string> = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    html: 'text/html',
    zip: 'application/zip'
  }
  const mime =
    file.type ||
    fallbackMime[file.name.split('.').pop()?.toLowerCase() || ''] ||
    'application/octet-stream'
  const ticket = await apiRequest<UploadTicket>('/attachments/upload', {
    method: 'POST',
    body: {
      demandId,
      kind: kind === 'prd' ? 'PRD' : 'PROTOTYPE',
      name: file.name,
      mime,
      size: file.size
    }
  })
  onTicket?.(ticket.attachmentId)
  const response = await fetch(ticket.uploadUrl, {
    method: 'PUT',
    headers: ticket.headers,
    body: file,
    signal: AbortSignal.timeout(120000)
  })
  if (!response.ok) throw new Error('文件上传失败，请重试')
  await apiRequest(`/attachments/${ticket.attachmentId}/confirm`, { method: 'POST' })
  return {
    kind: 'file',
    attachmentId: ticket.attachmentId,
    name: file.name,
    size: file.size,
    mime,
    status: 'ready'
  }
}
export async function downloadLiveMaterial(id: string) {
  const ticket = await apiRequest<{ downloadUrl: string }>(`/attachments/${id}/download`)
  window.open(ticket.downloadUrl, '_blank', 'noopener,noreferrer')
}

export async function discardLiveMaterial(id: string): Promise<void> {
  try {
    await apiRequest(`/attachments/${id}`, { method: 'DELETE' })
  } catch (cause) {
    // Persisted demand references own the file now; the server must retain it.
    if (cause instanceof ApiError && (cause.status === 409 || cause.status === 404)) return
    throw cause
  }
}
export function createMaterialCleanup() {
  const candidates = new Set<string>()
  return {
    track: (id: string) => candidates.add(id),
    async discardAll() {
      for (const id of candidates) {
        await discardLiveMaterial(id)
        candidates.delete(id)
      }
    }
  }
}
