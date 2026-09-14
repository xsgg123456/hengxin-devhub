import { expect, it } from 'vitest'
import { acceptanceSchema } from './acceptance-schemas.js'
import { computeRisks } from '../risks/risk-engine.js'
import { riskState } from '../risks/risk-state.js'
const base = { requestId: 'acceptance-test', version: 1 }
it('动作字段严格，说明非空且最多2000字，链接支持内网HTTP及无协议地址', () => {
  for (const action of ['submit', 'withdraw', 'return', 'assign']) expect(acceptanceSchema.safeParse({ ...base, action, summary: ' ' }).success).toBe(false)
  expect(acceptanceSchema.safeParse({ ...base, action: 'submit', summary: '交付', url: 'https://example.com/delivery' }).success).toBe(true)
  for (const url of ['http://192.168.1.10:8080/app', 'intranet:8080/app', 'www.baidu.com'])
    expect(acceptanceSchema.safeParse({ ...base, action: 'submit', summary: '交付', url }).success).toBe(true)
  for (const url of ['javascript:alert(1)', 'https://user:pass@example.com'])
    expect(acceptanceSchema.safeParse({ ...base, action: 'submit', summary: '交付', url }).success).toBe(false)
  expect(acceptanceSchema.safeParse({ ...base, action: 'accept', ownerId: 'other' }).success).toBe(false)
  expect(acceptanceSchema.safeParse({ ...base, action: 'return', summary: 'x'.repeat(2001) }).success).toBe(false)
})
it('待验收3工作日阈值、延期归因、不算停更且天数增长不改变通知状态', () => {
  const project = { status: 'ACTIVE', archived: false, simpleStatus: 'in-progress', stageExpectedDate: new Date('2026-09-11'),
    currentDeliveryDate: new Date('2026-09-11'), originalDeliveryDate: new Date('2026-09-11'), blocker: '',
    createdAt: new Date('2026-09-01'), lastOverallUpdatedAt: new Date('2026-09-01'),
    acceptanceStatus: 'pending', acceptanceSubmittedAt: new Date('2026-09-11T04:00:00Z') }
  expect(computeRisks(project, false, new Date('2026-09-15T04:00:00Z')).some(risk => /验收等待|未更新/.test(risk))).toBe(false)
  const risks = computeRisks(project, false, new Date('2026-09-16T04:00:00Z'))
  expect(risks).toContain('验收等待 3 个工作日：等待业务确认')
  expect(risks).toContain('项目延期 5 天（等待业务确认）')
  expect(riskState(risks)).toBe(riskState(computeRisks(project, false, new Date('2026-09-17T04:00:00Z'))))
})
