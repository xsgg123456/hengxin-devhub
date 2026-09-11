import { describe, expect, it } from 'vitest'
import { dateSchema, demandSchema, materialSchema } from './demand-schemas.js'
import { projectSchema, reviewSchema } from '../projects/project-schemas.js'

describe('业务输入边界', () => {
  it('真实日历日期拒绝溢出与歧义格式', () => {
    for (const value of ['2026-02-29', '2026-04-31', '2026-13-01', '2026-1-01', 'garbage'])
      expect(dateSchema.safeParse(value).success).toBe(false)
    expect(dateSchema.safeParse('2028-02-29').success).toBe(true)
  })
  it('草稿允许空名空材料但不能越过长度限制和伪造部门', () => {
    const draft = { requestId: 'one', name: '', submit: false }
    expect(demandSchema.safeParse(draft).success).toBe(true)
    expect(demandSchema.safeParse({ ...draft, name: 'a'.repeat(101) }).success).toBe(false)
    expect(demandSchema.safeParse({ ...draft, department: 'other' }).success).toBe(false)
  })
  it('链接拒绝非HTTPS与嵌入凭据', () => {
    for (const url of ['http://example.com', 'javascript:alert(1)', 'https://u:p@example.com', 'bad'])
      expect(materialSchema.safeParse({ kind: 'link', url }).success).toBe(false)
    expect(materialSchema.safeParse({ kind: 'link', url: 'https://example.com/prd' }).success).toBe(true)
  })
  it('退回拒绝空原因与混入立项字段', () => {
    const review = { requestId: 'one', version: 1, decision: 'return', reason: '  ' }
    expect(reviewSchema.safeParse(review).success).toBe(false)
    expect(reviewSchema.safeParse({ ...review, reason: '补充材料' }).success).toBe(true)
    expect(reviewSchema.safeParse({ ...review, reason: '补充', primaryOwnerId: 'one' }).success).toBe(false)
  })
  it('直接项目无需日期即可进入待排期，兼容日期若传入仍校验格式', () => {
    const input = { requestId: 'one', name: 'Project', department: 'IT', priority: 'P1', primaryOwnerId: 'one' }
    expect(projectSchema.safeParse(input).success).toBe(true)
    expect(projectSchema.safeParse({ ...input, originalDeliveryDate: '' }).success).toBe(false)
  })
})
