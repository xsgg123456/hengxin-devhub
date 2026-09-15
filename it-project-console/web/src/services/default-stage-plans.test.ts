import { describe, expect, it } from 'vitest'
import { createInitialPrototypeSnapshot } from '@/mocks/seed'
import { defaultStagePlans, nextWorkday } from './default-stage-plans'
import type { DemoStageHistory } from '@/domain/prototype'

const project = () => ({ ...createInitialPrototypeSnapshot().database.projects[0], stage: '方案设计' as const, stagePlans: [] })
const review = (id: string, completedAt = '2026-09-11T09:00:00+08:00'): DemoStageHistory => ({
  projectId: id, stage: '立项评审', startedAt: completedAt, completedAt
})
describe('默认工作日排期', () => {
  it('周五完成后五阶段各三工作日，不额外跳过国庆', () => {
    const p = project()
    const result = defaultStagePlans(p, [review(p.id)])
    expect(result.plans.map(plan => [plan.startDate, plan.endDate])).toEqual([
      ['2026-09-14', '2026-09-16'], ['2026-09-17', '2026-09-21'],
      ['2026-09-22', '2026-09-24'], ['2026-09-25', '2026-09-29'], ['2026-09-30', '2026-10-02']
    ])
    expect(p.stagePlans).toEqual([])
  })
  it('按上海日期而非UTC日期锚定，跨年跳周末', () => {
    const p = project()
    expect(defaultStagePlans(p, [review(p.id, '2026-09-10T17:00:00Z')]).plans[0].startDate).toBe('2026-09-14')
    expect(nextWorkday('2027-12-31')).toBe('2028-01-03')
  })
  it('缺失、无效或其他项目历史不冒充完成日，并提示回退', () => {
    const p = project()
    const result = defaultStagePlans(p, [review('other'), review(p.id, 'invalid')], '2026-09-17T17:00:00Z')
    expect(result.plans[0].startDate).toBe('2026-09-21')
    expect(result.notice).toContain('历史立项评审完成日缺失')
  })
  it('选择最新有效完成历史，忽略中断记录', () => {
    const p = project()
    expect(defaultStagePlans(p, [review(p.id, '2026-09-09'), review(p.id), {
      ...review(p.id, '2026-09-30'), interruptedAt: '2026-09-30'
    }]).plans[0].startDate).toBe('2026-09-14')
  })
  it('已有任何计划日期则完整保留，不自动补齐部分计划', () => {
    const p = { ...project(), stagePlans: [{ stage: '方案设计' as const, startDate: '2026-09-19', endDate: '2026-09-20' }] }
    const result = defaultStagePlans(p, [review(p.id)])
    expect(result.notice).toBe('')
    expect(result.plans[0]).toEqual(p.stagePlans[0])
    expect(result.plans[1].startDate).toBe('')
    result.plans[0].startDate = '2026-10-01'
    expect(p.stagePlans[0].startDate).toBe('2026-09-19')
    expect(result.plans[1].startDate).toBe('')
  })
  it('优化只生成一个三工作日交付节点', () => {
    const p = { ...project(), parentProjectId: 'parent', stage: '验收交付' as const }
    expect(defaultStagePlans(p, [review(p.id)]).plans).toEqual([
      { stage: '验收交付', startDate: '2026-09-14', endDate: '2026-09-16' }
    ])
  })
})
