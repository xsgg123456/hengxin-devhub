import { ApiError, apiRequest } from './api-client'
import type { DemoAttachment } from '@/domain/prototype'
interface UploadTicket {
  attachmentId: string
  uploadUrl: string
  headers: Record<string, string>
}
export function uploadLiveMaterial(
  demandId: string,
  file: File,
  onTicket?: (id: string) => void,
  onProgress?: (percent: number) => void
): Promise<DemoAttachment>
export function uploadLiveMaterial(
  demandId: string,
  kind: 'file' | 'prd' | 'prototype',
  file: File,
  onTicket?: (id: string) => void,
  onProgress?: (percent: number) => void
): Promise<DemoAttachment>
export async function uploadLiveMaterial(
  demandId: string,
  kindOrFile: 'file' | 'prd' | 'prototype' | File,
  fileOrTicket?: File | ((id: string) => void),
  ticketOrProgress?: ((id: string) => void) | ((percent: number) => void),
  progress?: (percent: number) => void
): Promise<DemoAttachment> {
  const kind = typeof kindOrFile === 'string' ? kindOrFile : 'file'
  const file = (typeof kindOrFile === 'string' ? fileOrTicket : kindOrFile) as File
  const onTicket = (typeof kindOrFile === 'string' ? ticketOrProgress : fileOrTicket) as
    ((id: string) => void) | undefined
  const onProgress = (typeof kindOrFile === 'string' ? progress : ticketOrProgress) as
    ((percent: number) => void) | undefined
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
      kind: kind === 'file' ? 'FILE' : kind === 'prd' ? 'PRD' : 'PROTOTYPE',
      name: file.name,
      mime,
      size: file.size
    }
  })
  onTicket?.(ticket.attachmentId)
  if (onProgress) await uploadWithProgress(ticket, file, onProgress)
  else {
    const response = await fetch(ticket.uploadUrl, {
      method: 'PUT',
      headers: ticket.headers,
      body: file,
      signal: AbortSignal.timeout(120000)
    })
    if (!response.ok) throw new Error('文件上传失败，请重试')
  }
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
function uploadWithProgress(ticket: UploadTicket, file: File, progress: (percent: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('PUT', ticket.uploadUrl)
    request.timeout = 120000
    for (const [name, value] of Object.entries(ticket.headers))
      request.setRequestHeader(name, value)
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) progress(Math.round((event.loaded / event.total) * 100))
    }
    request.onload = () =>
      request.status >= 200 && request.status < 300
        ? resolve()
        : reject(new Error('文件上传失败，请重试'))
    request.onerror =
      request.ontimeout =
      request.onabort =
        () => reject(new Error('文件上传中断或超时，请重试'))
    request.send(file)
  })
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
    release: () => candidates.clear(),
    async discard(id: string) {
      if (!candidates.has(id)) return
      await discardLiveMaterial(id)
      candidates.delete(id)
    },
    async discardAll() {
      for (const id of candidates) {
        await discardLiveMaterial(id)
        candidates.delete(id)
      }
    }
  }
}
