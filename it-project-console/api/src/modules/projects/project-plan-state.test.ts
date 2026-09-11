import { describe, expect, it } from 'vitest'
import { assertScheduled, PLAN_STAGES, planSchema, readStagePlans, validatePlanOrder } from './project-plan-state.js'
import { progressSchema, correctionSchema } from '../progress/progress-schemas.js'
const plans = PLAN_STAGES.map(stage => ({ stage, startDate: '2026-09-11', endDate: '2026-09-11', originalStartDate: '2026-09-11', originalEndDate: '2026-09-11' }))
describe('阶段排期边界', () => {
  it('允许同日交接，拒绝逆序日期和重叠阶段', () => {
    expect(() => validatePlanOrder(plans)).not.toThrow()
    expect(() => validatePlanOrder([{ ...plans[0]!, startDate: '2026-09-12' }])).toThrow('开始日期不得晚于')
    expect(() => validatePlanOrder([{ ...plans[0]!, endDate: '2026-09-12' }, plans[1]!])).toThrow('后阶段开始不得早于')
  })
  it('未知和缺失日期不填造，旧项目只检查当前以后完整计划', () => {
    expect(readStagePlans(null)).toEqual([])
    expect(readStagePlans([{ stage: '方案设计', endDate: '2026-09-11' }])).toEqual([])
    expect(() => assertScheduled('方案设计', plans.slice(1))).toThrow('请先完整保存')
    expect(assertScheduled('开发编码', plans.slice(1))).toHaveLength(4)
    expect(() => assertScheduled('验收交付', [])).toThrow('请先完整保存')
  })
  it('排期拒绝非法日历日、空说明和非执行阶段', () => {
    const valid = { requestId: 'test', version: 1, plans: plans.map(({ stage, startDate, endDate }) => ({ stage, startDate, endDate })) }
    expect(planSchema.safeParse(valid).success).toBe(true)
    expect(planSchema.safeParse({ ...valid, changeDescription: ' ' }).success).toBe(false)
    expect(planSchema.safeParse({ ...valid, plans: [{ stage: '立项评审', startDate: '2026-02-30', endDate: '2026-09-11' }] }).success).toBe(false)
  })
  it('执行说明可选，百分比和滚动日期不能混入执行或纠正入口', () => {
    const valid = { requestId: 'test', version: 1, kind: 'overall', status: 'completed' }
    expect(progressSchema.safeParse(valid).success).toBe(true)
    expect(progressSchema.safeParse({ ...valid, status: 'nearly-done' }).success).toBe(false)
    expect(progressSchema.safeParse({ ...valid, kind: 'personal', status: 'blocked', blocker: '等待接口' }).success).toBe(true)
    for (const extra of [{ overallProgress: 100 }, { nextStageExpectedDate: '2026-09-11' }, { expectedDeliveryDate: '2026-09-11' }])
      expect(progressSchema.safeParse({ ...valid, ...extra }).success).toBe(false)
    expect(correctionSchema.safeParse({ requestId: 'test', version: 1, stage: '方案设计', reason: '纠正', overallProgress: 10 }).success).toBe(false)
  })
})
