import { describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '../../generated/prisma/client.js'
import { AttachmentService } from './attachment-service.js'
import type { UploadInput } from './attachment-validation.js'

const actor = { id: 'owner', active: true, role: 'BUSINESS' as const }
const input: UploadInput = {
  demandId: 'demand',
  kind: 'PRD',
  name: '需求.pdf',
  mime: 'application/pdf',
  size: 12
}

function setup() {
  const demand = { id: 'demand', ownerId: 'owner', status: 'DRAFT' }
  const attachment = {
    ...input,
    id: 'file',
    uploaderId: 'owner',
    status: 'PENDING',
    objectKey: 'staging/file',
    expiresAt: new Date(Date.now() + 300_000),
    stagingCleanedAt: null,
    demand
  }
  const db = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    objectDeletion: { findMany: vi.fn().mockResolvedValue([]) },
    demand: { findUnique: vi.fn().mockResolvedValue(demand) },
    attachment: {
      findUnique: vi.fn().mockResolvedValue(attachment),
      findMany: vi.fn().mockResolvedValue([attachment]),
      aggregate: vi.fn().mockResolvedValue({ _sum: { size: 0 } }),
      create: vi.fn().mockResolvedValue(attachment),
      update: vi.fn().mockResolvedValue({ ...attachment, status: 'READY' }),
      delete: vi.fn().mockResolvedValue(attachment)
    }
  }
  const prisma = {
    ...db,
    $transaction: <T>(work: (tx: typeof db) => Promise<T>) => work(db)
  }
  const storage = {
    head: vi.fn().mockResolvedValue({ size: 12, mime: 'application/pdf', etag: 'etag' }),
    promote: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    presignUpload: vi.fn().mockResolvedValue('https://storage/upload'),
    presignDownload: vi.fn().mockResolvedValue('https://storage/download')
  }
  return {
    service: new AttachmentService(prisma as unknown as PrismaClient, storage),
    db,
    storage,
    attachment,
    demand
  }
}

describe('附件权限、预算和确认边界', () => {
  it('合法申请保留PENDING，签名失败不写记录', async () => {
    const { service, db, storage } = setup()
    const result = await service.requestUpload(actor, input)
    expect(result.headers).toEqual({ 'Content-Type': 'application/pdf' })
    expect(db.attachment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: 'PENDING', uploaderId: 'owner' })
    })
    db.attachment.create.mockClear()
    storage.presignUpload.mockRejectedValue(new Error('offline'))
    await expect(service.requestUpload(actor, input)).rejects.toMatchObject({
      code: 'STORAGE_ERROR'
    })
    expect(db.attachment.create).not.toHaveBeenCalled()
  })

  it('拒绝跨用户写入、停用账号及不可编辑需求', async () => {
    const { service, demand } = setup()
    await expect(service.requestUpload({ ...actor, id: 'other' }, input)).rejects.toMatchObject({
      statusCode: 403
    })
    await expect(service.requestUpload({ ...actor, active: false }, input)).rejects.toMatchObject({
      statusCode: 403
    })
    demand.status = 'APPROVED'
    await expect(service.requestUpload(actor, input)).rejects.toMatchObject({
      code: 'DEMAND_NOT_EDITABLE'
    })
  })

  it('拒绝伪类型、路径文件名、非整数、单文件及合计超限', async () => {
    const { service, db } = setup()
    for (const bad of [
      { mime: 'text/html' },
      { name: '../x.pdf' },
      { size: 0.5 },
      { size: 20 * 1024 * 1024 + 1 }
    ]) {
      await expect(service.requestUpload(actor, { ...input, ...bad })).rejects.toMatchObject({
        statusCode: 400
      })
    }
    db.attachment.aggregate.mockResolvedValue({
      _sum: { size: 50 * 1024 * 1024 - 1 }
    })
    await expect(service.requestUpload(actor, input)).rejects.toMatchObject({
      code: 'DEMAND_STORAGE_LIMIT'
    })
    expect(db.attachment.create).not.toHaveBeenCalled()
    expect(db.$queryRaw).toHaveBeenCalled()
  })

  it('大小/MIME伪造确认与Copy条件失败均保持可重试PENDING', async () => {
    const { service, db, storage } = setup()
    storage.head.mockResolvedValueOnce({
      size: 13,
      mime: 'application/pdf',
      etag: 'etag'
    })
    await expect(service.confirmUpload(actor, 'file')).rejects.toMatchObject({
      code: 'UPLOAD_MISMATCH'
    })
    storage.head.mockResolvedValueOnce({
      size: 12,
      mime: 'text/html',
      etag: 'etag'
    })
    await expect(service.confirmUpload(actor, 'file')).rejects.toMatchObject({
      code: 'UPLOAD_MISMATCH'
    })
    storage.promote.mockRejectedValueOnce(new Error('PreconditionFailed'))
    await expect(service.confirmUpload(actor, 'file')).rejects.toMatchObject({
      code: 'STORAGE_ERROR'
    })
    expect(db.attachment.update).not.toHaveBeenCalled()
    expect(db.attachment.delete).not.toHaveBeenCalled()
  })

  it('确认只将校验后的不可直传key标READY，重复确认不覆盖', async () => {
    const { service, db, storage, attachment } = setup()
    await service.confirmUpload(actor, 'file')
    expect(storage.promote).toHaveBeenCalledWith('staging/file', 'attachments/file', 'etag')
    expect(db.attachment.update).toHaveBeenCalledWith({
      where: { id: 'file' },
      data: { objectKey: 'attachments/file', status: 'READY' }
    })
    attachment.status = 'READY'
    storage.promote.mockClear()
    await service.confirmUpload(actor, 'file')
    expect(storage.promote).not.toHaveBeenCalled()
  })

  it('到期不能确认、未就绪不能下载，全员可读就绪材料', async () => {
    const { service, attachment } = setup()
    attachment.expiresAt = new Date(0)
    await expect(service.confirmUpload(actor, 'file')).rejects.toMatchObject({
      code: 'UPLOAD_EXPIRED'
    })
    await expect(service.download(actor, 'file')).rejects.toMatchObject({
      code: 'ATTACHMENT_NOT_READY'
    })
    attachment.status = 'READY'
    expect(await service.download({ ...actor, id: 'other' }, 'file')).toHaveProperty('downloadUrl')
  })

  it('未确认清理删临时和孤儿final，删除失败保留记录并返回失败', async () => {
    const { service, attachment, storage, db } = setup()
    attachment.expiresAt = new Date(0)
    storage.delete.mockRejectedValueOnce(new Error('offline'))
    expect(await service.cleanupExpired()).toEqual({
      cleaned: 0,
      failed: ['file']
    })
    expect(db.attachment.delete).not.toHaveBeenCalled()
    expect(await service.cleanupExpired()).toEqual({ cleaned: 1, failed: [] })
    expect(storage.delete).toHaveBeenCalledWith('attachments/file')
  })

  it('READY清理只删临时对象，记录完成标记避免循环清理', async () => {
    const { service, attachment, storage, db } = setup()
    attachment.status = 'READY'
    attachment.expiresAt = new Date(0)
    await service.cleanupExpired()
    expect(storage.delete).toHaveBeenCalledExactlyOnceWith('staging/file')
    expect(db.attachment.delete).not.toHaveBeenCalled()
    expect(db.attachment.update).toHaveBeenCalledWith({
      where: { id: 'file' },
      data: { stagingCleanedAt: expect.any(Date) }
    })
  })
})
