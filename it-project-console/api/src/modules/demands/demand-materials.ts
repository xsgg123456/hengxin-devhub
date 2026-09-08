import type { Prisma } from '../../generated/prisma/client.js'
import { AppError } from '../../lib/errors.js'
import type { DemandInput } from './demand-schemas.js'

export async function demandData(tx: Prisma.TransactionClient, id: string, input: DemandInput) {
  if (input.submit) {
    if (!input.name || !input.description || !input.expectedLaunchDate || !input.prd || !input.prototype)
      throw new AppError(400, 'MISSING_FIELDS', '正式提交需要名称、说明、期望上线日期、PRD 和 HTML 原型')
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
    if (input.expectedLaunchDate < today) throw new AppError(400, 'PAST_DATE', '期望上线日期不能早于提交日')
  }
  for (const [material, kind] of [[input.prd, 'PRD'], [input.prototype, 'PROTOTYPE']] as const) {
    if (material?.kind !== 'file') continue
    const attachment = await tx.attachment.findUnique({ where: { id: material.attachmentId } })
    if (!attachment || attachment.demandId !== id || attachment.kind !== kind || attachment.status !== 'READY')
      throw new AppError(400, 'INVALID_ATTACHMENT', '附件必须已完成上传且属于该需求的对应材料')
  }
  return {
    name: input.name, description: input.description,
    expectedLaunchDate: input.expectedLaunchDate ? new Date(input.expectedLaunchDate) : null,
    prdUrl: input.prd?.kind === 'link' ? input.prd.url : null,
    prototypeUrl: input.prototype?.kind === 'link' ? input.prototype.url : null,
    prdAttachmentId: input.prd?.kind === 'file' ? input.prd.attachmentId : null,
    prototypeAttachmentId: input.prototype?.kind === 'file' ? input.prototype.attachmentId : null
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
