import { describe, expect, it, vi } from 'vitest'
import type { Prisma } from '../../generated/prisma/client.js'
import { demandData } from './demand-materials.js'
import type { DemandInput } from './demand-schemas.js'
const base: DemandInput = {
  requestId: 'one', name: '项目', description: '说明', submit: true,
  expectedLaunchDate: '2099-12-31', attachmentIds: ['a1'],
  prd: { kind: 'link', url: 'https://example.com/prd' },
  prototype: { kind: 'link', url: 'https://example.com/demo' }
}
function transaction(attachment: unknown = { demandId: 'd1', kind: 'PRD', status: 'READY' }) {
  return { attachment: { findUnique: vi.fn().mockResolvedValue(attachment) } } as unknown as Prisma.TransactionClient
}
describe('需求材料业务验证', () => {
  it('正式提交拒绝任何一项缺失，草稿允许全部留空', async () => {
    for (const key of ['name', 'description', 'expectedLaunchDate'])
      await expect(demandData(transaction(), 'd1', { ...base, [key]: null })).rejects.toMatchObject({ code: 'MISSING_FIELDS' })
    await expect(demandData(transaction(), 'd1', { ...base, name: '', description: '', expectedLaunchDate: null, prd: null, prototype: null, attachmentIds: [], submit: false })).resolves.toMatchObject({ name: '', prdAttachmentId: null })
  })
  it('旧链接不能替代文件，重复ID及显式空列表拒绝提交', async () => {
    for (const attachmentIds of [[], ['a1', 'a1']])
      await expect(demandData(transaction(), 'd1', { ...base, attachmentIds })).rejects.toMatchObject({ statusCode: 400 })
    await expect(demandData(transaction(), 'd1', { ...base, attachmentIds: undefined })).rejects.toMatchObject({ code: 'MISSING_FIELDS' })
    await expect(demandData(transaction({ demandId: 'd1', kind: 'FILE', status: 'READY' }), 'd1', base)).resolves.toMatchObject({ attachmentIds: ['a1'] })
  })
  it('提交日期按上海日界验证', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-08T17:00:00Z'))
    try {
      await expect(demandData(transaction(), 'd1', { ...base, expectedLaunchDate: '2026-09-08' })).rejects.toMatchObject({ code: 'PAST_DATE' })
      await expect(demandData(transaction(), 'd1', { ...base, expectedLaunchDate: '2026-09-09' })).resolves.toMatchObject({ name: '项目' })
    } finally { vi.useRealTimers() }
  })
  it('禁止跨需求、错种类及未完成的附件', async () => {
    const input: DemandInput = { ...base, prd: { kind: 'file', attachmentId: 'a1' } }
    for (const row of [null, { demandId: 'other', kind: 'PRD', status: 'READY' }, { demandId: 'd1', kind: 'PROTOTYPE', status: 'READY' }, { demandId: 'd1', kind: 'PRD', status: 'PENDING' }])
      await expect(demandData(transaction(row), 'd1', input)).rejects.toMatchObject({ code: 'INVALID_ATTACHMENT' })
    await expect(demandData(transaction({ demandId: 'd1', kind: 'PRD', status: 'READY' }), 'd1', input)).resolves.toMatchObject({ prdAttachmentId: 'a1' })
  })
})
