import { expect, it } from 'vitest'
import { computeRisks, type RiskProject } from './risk-engine.js'
import { businessDate, workdaysBetween } from '../calendar/workday.js'
const at = (day: string) => new Date(`${day}T04:00:00Z`)
const base = (): RiskProject => ({
  status: 'ACTIVE',
  archived: false,
  simpleStatus: 'in-progress',
  stageExpectedDate: new Date('2026-09-14'),
  currentDeliveryDate: new Date('2026-09-30'),
  originalDeliveryDate: new Date('2026-09-30'),
  createdAt: at('2026-09-11'),
  lastOverallUpdatedAt: at('2026-09-11'),
  blocker: ''
})
it('周五到周一为下一工作日，不计算周末停更', () => {
  expect(computeRisks(base(), false, at('2026-09-11'))).toEqual(['环节临期：下一个工作日到期'])
  expect(workdaysBetween('2026-09-11', '2026-09-14')).toBe(1)
})
it('上海零点且停更恰3工作日才触发，原始时间不受浏览器时区影响', () => {
  expect(businessDate(new Date('2026-09-15T16:00:00Z'))).toBe('2026-09-16')
  expect(computeRisks(base(), false, at('2026-09-15')).some((r) => r.includes('未更新'))).toBe(
    false
  )
  expect(computeRisks(base(), false, at('2026-09-16'))).toContain('已有 3 个工作日未更新整体进度')
})
it('环节到期当天不延期，次日显示真实日数', () => {
  expect(computeRisks(base(), false, at('2026-09-14')).some((r) => r.includes('环节延期'))).toBe(
    false
  )
  expect(computeRisks(base(), false, at('2026-09-15'))).toContain('环节延期 1 天')
})
it('项目延期以交付日期为准，未到交付时仅原计划差异风险', () => {
  const project = { ...base(), originalDeliveryDate: new Date('2026-09-10') }
  expect(computeRisks(project, true, at('2026-09-11'))).toContain('有风险：交付计划较原定晚 20 天')
  expect(computeRisks(project, true, at('2026-10-01'))).toContain('项目延期 1 天')
  expect(computeRisks(project, true, at('2026-10-01')).some((r) => r.startsWith('有风险'))).toBe(
    false
  )
})
it('阶段完成不再环节延期，项目未显式完成仍有交付延期', () => {
  const project = { ...base(), simpleStatus: 'completed' }
  const risks = computeRisks(project, false, at('2026-10-01'))
  expect(risks.some((r) => r.includes('环节延期'))).toBe(false)
  expect(risks).toContain('项目延期 1 天')
})
it('取消/完成/归档清除风险，阻塞事实与日期历史可保留展示', () => {
  const project = { ...base(), simpleStatus: 'blocked', blocker: '等待联调' }
  expect(computeRisks(project, true, at('2026-09-11'))).toContain('当前已阻塞：等待联调')
  expect(computeRisks(project, true, at('2026-09-11'))).toContain('计划有变：存在日期调整历史')
  for (const status of ['CANCELLED', 'COMPLETED'])
    expect(computeRisks({ ...project, status }, true, at('2026-10-01'))).toEqual([])
  expect(computeRisks({ ...project, archived: true }, true, at('2026-10-01'))).toEqual([])
})
it('服务端配置工作日和停更阈值，不需要改前端', () => {
  expect(
    computeRisks(base(), false, at('2026-09-12'), {
      staleWorkdays: 1,
      weekdays: [1, 2, 3, 4, 5, 6]
    })
  ).toContain('已有 1 个工作日未更新整体进度')
})
