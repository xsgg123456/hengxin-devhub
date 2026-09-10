import type { Prisma, Demand } from '../../generated/prisma/client.js'
import { AppError } from '../../lib/errors.js'
import type { DemandInput } from './demand-schemas.js'

export async function demandData(tx: Prisma.TransactionClient, id: string, input: DemandInput, old?: Demand) {
  const legacyIds = [input.prd, input.prototype].flatMap(material => material?.kind === 'file' ? [material.attachmentId] : [])
  const attachmentIds = input.attachmentIds ?? [...new Set([...(old?.attachmentIds ?? []), ...legacyIds])]
  if (new Set(attachmentIds).size !== attachmentIds.length)
    throw new AppError(400, 'DUPLICATE_ATTACHMENT', '附件不能重复')
  if (input.submit) {
    if (!input.name || !input.description || !input.expectedLaunchDate || !attachmentIds.length)
      throw new AppError(400, 'MISSING_FIELDS', '正式提交需要名称、说明、期望上线日期和至少一个上传完成的附件')
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
    if (input.expectedLaunchDate < today) throw new AppError(400, 'PAST_DATE', '期望上线日期不能早于提交日')
  }
  for (const attachmentId of attachmentIds) {
    const attachment = await tx.attachment.findUnique({ where: { id: attachmentId } })
    if (!attachment || attachment.demandId !== id || attachment.status !== 'READY')
      throw new AppError(400, 'INVALID_ATTACHMENT', '附件必须已完成上传且属于该需求')
  }
  for (const [material, kind] of [[input.prd, 'PRD'], [input.prototype, 'PROTOTYPE']] as const) {
    if (material?.kind !== 'file' || !attachmentIds.includes(material.attachmentId)) continue
    const attachment = await tx.attachment.findUnique({ where: { id: material.attachmentId } })
    if (attachment?.kind !== kind)
      throw new AppError(400, 'INVALID_ATTACHMENT', '旧材料引用类型不匹配，请使用统一附件列表')
  }
  return {
    name: input.name, description: input.description, attachmentIds,
    expectedLaunchDate: input.expectedLaunchDate ? new Date(input.expectedLaunchDate) : null,
    prdUrl: input.prd?.kind === 'link' ? input.prd.url : null,
    prototypeUrl: input.prototype?.kind === 'link' ? input.prototype.url : null,
    prdAttachmentId: input.prd?.kind === 'file' && attachmentIds.includes(input.prd.attachmentId) ? input.prd.attachmentId : null,
    prototypeAttachmentId: input.prototype?.kind === 'file' && attachmentIds.includes(input.prototype.attachmentId) ? input.prototype.attachmentId : null
  }
}
export async function queueAttachmentDeletion(tx: Prisma.TransactionClient, ids: string[]) {
  const rows = await tx.attachment.findMany({ where: { id: { in: ids } } })
  for (const row of rows) {
    await tx.objectDeletion.createMany({ data: [
      { objectKey: `staging/${row.id}`, availableAt: new Date(Math.max(Date.now(), row.expiresAt.getTime() + 60_000)) },
      { objectKey: `attachments/${row.id}` }
    ], skipDuplicates: true })
  }
  await tx.attachment.deleteMany({ where: { id: { in: ids } } })
}
