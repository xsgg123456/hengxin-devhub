import { expect, it } from 'vitest'
import { demandCompletion } from './demand-completion.js'
import { demandQuery } from './query-schemas.js'
import { demandMonthlyTrend } from './demand-statistics-service.js'

it('以验收实际时间的上海日期对比最新交付计划，不用更新时间或业务期望时间', () => {
  const project = { status: 'COMPLETED', currentDeliveryDate: new Date('2026-09-20'),
    actualCompletedAt: new Date('2026-09-20T15:59:59Z') }
  expect(demandCompletion(project).completionStatus).toBe('normal')
  expect(demandCompletion({ ...project, actualCompletedAt: new Date('2026-09-20T16:00:00Z') }).completionStatus).toBe('late')
  expect(demandCompletion({ ...project, currentDeliveryDate: new Date('2026-09-25') }).completionStatus).toBe('normal')
  expect(demandCompletion({ ...project, status: 'ACTIVE' })).toMatchObject({ completionStatus: 'unfinished', actualCompletedAt: '' })
  expect(demandCompletion({ ...project, actualCompletedAt: null }).completionStatus).toBe('unknown')
  expect(demandCompletion({ ...project, currentDeliveryDate: null }).completionStatus).toBe('unknown')
})
it('日期范围含首尾并拒绝倒序、无效日期和非法完成情况', () => {
  expect(demandQuery.parse({ from: '2026-09-01', to: '2026-09-30', completion: 'late' }).completion).toBe('late')
  expect(demandQuery.safeParse({ from: '2026-10-01', to: '2026-09-01' }).success).toBe(false)
  expect(demandQuery.safeParse({ from: '2026-02-30' }).success).toBe(false)
  expect(demandQuery.safeParse({ completion: 'completed' }).success).toBe(false)
})
it('趋势默认近六个月，选择范围后保留没有记录的月份', () => {
  expect(demandMonthlyTrend([], {}, new Date('2026-09-11')).months).toEqual(['2026-04','2026-05','2026-06','2026-07','2026-08','2026-09'])
  expect(demandMonthlyTrend([], { from:'2025-12-20', to:'2026-02-01' }).months).toEqual(['2025-12','2026-01','2026-02'])
})
