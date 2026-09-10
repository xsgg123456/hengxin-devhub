import { queueAttachmentDeletion } from '../demands/demand-materials.js'
import { cleanupDeletedObjects } from './object-cleanup.js'
import { randomUUID } from 'node:crypto'
import type { Prisma, PrismaClient } from '../../generated/prisma/client.js'
import { AppError } from '../../lib/errors.js'
import type { ObjectStorage, StorageMetadata } from '../storage/s3-storage.js'
import {
  assertActive,
  assertWritable,
  validateUpload,
  type AttachmentActor,
  type AttachmentLimits,
  type UploadInput
} from './attachment-validation.js'

const stagingKey = (id: string) => `staging/${id}`
const finalKey = (id: string) => `attachments/${id}`

async function lockedDemand(tx: Prisma.TransactionClient, id: string) {
  // A parameterized row lock serializes quota allocation, confirmation and cleanup.
  await tx.$queryRaw`SELECT id FROM demands WHERE id = ${id} FOR UPDATE`
  const demand = await tx.demand.findUnique({ where: { id } })
  if (!demand) throw new AppError(404, 'DEMAND_NOT_FOUND', '需求不存在')
  return demand
}

function assertMetadata(
  metadata: StorageMetadata,
  size: number,
  mime: string
): asserts metadata is StorageMetadata & { etag: string } {
  if (metadata.size !== size || metadata.mime !== mime || !metadata.etag) {
    throw new AppError(400, 'UPLOAD_MISMATCH', '已上传文件的大小或类型与申请不一致')
  }
}

async function storageCall<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action()
  } catch (error) {
    if (error instanceof AppError) throw error
    throw new AppError(502, 'STORAGE_ERROR', '对象存储操作失败，请重新上传或稍后重试')
  }
}

export class AttachmentService {
  private readonly maxFileBytes: number
  private readonly maxDemandBytes: number
  constructor(
    private readonly prisma: PrismaClient,
    private readonly storage: ObjectStorage,
    limits: AttachmentLimits = {}
  ) {
    this.maxFileBytes = limits.maxFileBytes ?? 100 * 1024 * 1024
    this.maxDemandBytes = limits.maxDemandBytes ?? 500 * 1024 * 1024
  }

  async requestUpload(actor: AttachmentActor, input: UploadInput) {
    assertActive(actor)
    input = { ...input, mime: input.mime.trim() || 'application/octet-stream' }
    validateUpload(input, this.maxFileBytes)
    return this.prisma.$transaction(async (tx) => {
      const demand = await lockedDemand(tx, input.demandId)
      assertWritable(actor, demand)
      const aggregate = await tx.attachment.aggregate({
        where: { demandId: input.demandId },
        _sum: { size: true }
      })
      if ((aggregate._sum.size ?? 0) + input.size > this.maxDemandBytes) {
        throw new AppError(400, 'DEMAND_STORAGE_LIMIT', '需求附件总大小超限，请先清理过期上传')
      }
      const id = randomUUID()
      const expiresAt = new Date(Date.now() + 300_000)
      const uploadUrl = await storageCall(() =>
        this.storage.presignUpload(stagingKey(id), input.mime, input.size)
      )
      await tx.attachment.create({
        data: {
          ...input,
          id,
          uploaderId: actor.id,
          objectKey: stagingKey(id),
          expiresAt,
          status: 'PENDING'
        }
      })
      return {
        attachmentId: id,
        uploadUrl,
        headers: { 'Content-Type': input.mime },
        expiresAt
      }
    })
  }

  async confirmUpload(actor: AttachmentActor, id: string) {
    assertActive(actor)
    const existing = await this.prisma.attachment.findUnique({ where: { id } })
    if (!existing) throw new AppError(404, 'ATTACHMENT_NOT_FOUND', '附件不存在')
    return this.prisma.$transaction(
      async (tx) => {
        const demand = await lockedDemand(tx, existing.demandId)
        assertWritable(actor, demand)
        const attachment = await tx.attachment.findUnique({ where: { id } })
        if (!attachment) throw new AppError(404, 'ATTACHMENT_NOT_FOUND', '附件不存在')
        if (attachment.status === 'READY') return attachment
        if (attachment.status !== 'PENDING' || attachment.expiresAt.getTime() <= Date.now()) {
          throw new AppError(409, 'UPLOAD_EXPIRED', '上传已过期，请重新申请')
        }
        await storageCall(async () => {
          const source = await this.storage.head(stagingKey(id))
          assertMetadata(source, attachment.size, attachment.mime)
          // Clients can only PUT staging. Conditional copy rejects concurrent replacements.
          await this.storage.promote(stagingKey(id), finalKey(id), source.etag)
          const target = await this.storage.head(finalKey(id))
          assertMetadata(target, attachment.size, attachment.mime)
        })
        return tx.attachment.update({
          where: { id },
          data: { objectKey: finalKey(id), status: 'READY' }
        })
      },
      { timeout: 30_000 }
    )
  }

  async discard(actor: AttachmentActor, id: string) {
    assertActive(actor)
    const existing = await this.prisma.attachment.findUnique({ where: { id } })
    if (!existing) return { discarded: true }
    await this.prisma.$transaction(async tx => {
      const demand = await lockedDemand(tx, existing.demandId)
      assertWritable(actor, demand)
      if ([...demand.attachmentIds, demand.prdAttachmentId, demand.prototypeAttachmentId].includes(id))
        throw new AppError(409, 'ATTACHMENT_IN_USE', '附件已保存到需求，请通过编辑需求移除')
      await queueAttachmentDeletion(tx, [id])
    })
    return { discarded: true }
  }

  async download(actor: AttachmentActor, id: string) {
    assertActive(actor)
    const attachment = await this.prisma.attachment.findUnique({
      where: { id },
      include: { demand: true }
    })
    if (!attachment) throw new AppError(404, 'ATTACHMENT_NOT_FOUND', '附件不存在')
    // Spec 6.3/6.4 gives all active company roles read access to demand materials.
    if (attachment.status !== 'READY')
      throw new AppError(409, 'ATTACHMENT_NOT_READY', '附件尚未确认上传')
    const downloadUrl = await storageCall(() =>
      this.storage.presignDownload(attachment.objectKey, attachment.name)
    )
    return { downloadUrl, expiresAt: new Date(Date.now() + 300_000) }
  }

  async cleanupExpired(now = new Date()) {
    // Wait an extra minute after signature expiry before removing replayable staging keys.
    const cutoff = new Date(now.getTime() - 60_000)
    // READY files abandoned before saving retain a full day for form recovery.
    const abandoned = await this.prisma.$queryRaw<Array<{ id: string; demandId: string }>>`
      SELECT a.id, a.demand_id AS "demandId" FROM attachments a JOIN demands d ON d.id = a.demand_id
      WHERE a.status = 'READY' AND a.created_at < ${new Date(now.getTime() - 86400000)}
        AND NOT (a.id = ANY(d.attachment_ids))
        AND a.id IS DISTINCT FROM d.prd_attachment_id AND a.id IS DISTINCT FROM d.prototype_attachment_id
      ORDER BY a.created_at LIMIT 100`
    for (const file of abandoned) {
      await this.prisma.$transaction(async tx => {
        const demand = await lockedDemand(tx, file.demandId)
        if (![...demand.attachmentIds, demand.prdAttachmentId, demand.prototypeAttachmentId].includes(file.id))
          await queueAttachmentDeletion(tx, [file.id])
      })
    }
    const candidates = await this.prisma.attachment.findMany({
      where: { expiresAt: { lt: cutoff }, stagingCleanedAt: null },
      orderBy: { expiresAt: 'asc' },
      take: 100
    })
    let cleaned = 0
    const failed: string[] = []
    for (const candidate of candidates) {
      try {
        const removed = await this.prisma.$transaction(
          async (tx) => {
            await lockedDemand(tx, candidate.demandId)
            const current = await tx.attachment.findUnique({
              where: { id: candidate.id }
            })
            if (!current || current.stagingCleanedAt || current.expiresAt >= cutoff) return false
            await this.storage.delete(stagingKey(current.id))
            if (current.status === 'READY') {
              await tx.attachment.update({
                where: { id: current.id },
                data: { stagingCleanedAt: now }
              })
            } else {
              // Also removes a copy left by a failed DB commit after object promotion.
              await this.storage.delete(finalKey(current.id))
              await tx.attachment.delete({ where: { id: current.id } })
            }
            return true
          },
          { timeout: 30_000 }
        )
        if (removed) cleaned += 1
      } catch {
        failed.push(candidate.id)
      }
    }
    const deleted = await cleanupDeletedObjects(this.prisma, this.storage, now)
    return { cleaned: cleaned + deleted.cleaned, failed: [...failed, ...deleted.failed] }
  }
}
