import type { AttachmentKind, Demand, Role } from '../../generated/prisma/client.js'
import { AppError } from '../../lib/errors.js'

export interface AttachmentActor {
  id: string
  role: Role
  active: boolean
}
export interface UploadInput {
  demandId: string
  kind: AttachmentKind
  name: string
  mime: string
  size: number
}
export interface AttachmentLimits {
  maxFileBytes?: number
  maxDemandBytes?: number
}

export function validateUpload(input: UploadInput, maxFileBytes: number): void {
  if (!input.name || input.name.length > 180 || /[\x00-\x1f\x7f/\\]/.test(input.name)) {
    throw new AppError(400, 'INVALID_FILENAME', '文件名无效或过长')
  }
  if (!Number.isSafeInteger(input.size) || input.size <= 0 || input.size > maxFileBytes) {
    throw new AppError(400, 'FILE_TOO_LARGE', `文件大小须为 1 至 ${maxFileBytes} 字节`)
  }
}

export function assertActive(actor: AttachmentActor): void {
  if (!actor.active) throw new AppError(403, 'ACCOUNT_DISABLED', '账号已停用')
}

export function assertWritable(actor: AttachmentActor, demand: Demand): void {
  assertActive(actor)
  if (demand.ownerId !== actor.id) throw new AppError(403, 'FORBIDDEN', '仅提交人可维护需求材料')
  if (!['DRAFT', 'PENDING', 'RETURNED', 'WITHDRAWN'].includes(demand.status)) {
    throw new AppError(409, 'DEMAND_NOT_EDITABLE', '当前需求状态不可修改材料')
  }
}
