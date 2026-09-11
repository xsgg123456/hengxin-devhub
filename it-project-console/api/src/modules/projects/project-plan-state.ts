import { z } from 'zod'
import { commandSchema, dateSchema } from '../demands/demand-schemas.js'
import { STAGES } from '../progress/progress-schemas.js'
import { invalid } from '../progress/progress-state.js'

export const PLAN_STAGES = ['方案设计', '开发编码', '联调测试', '上线部署', '验收交付'] as const
const plan = z.object({ stage: z.enum(PLAN_STAGES), startDate: dateSchema, endDate: dateSchema }).strict()
export const planSchema = commandSchema.extend({
  plans: z.array(plan).min(1).max(5),
  changeReason: z.enum(['业务新增或变更需求', '技术问题', '等待外部资源', '人员安排变化', '其他']).optional(),
  changeDescription: z.string().trim().min(1).max(300).optional()
}).strict()
const storedPlan = plan.extend({ originalStartDate: dateSchema, originalEndDate: dateSchema })
export type StagePlan = z.infer<typeof storedPlan>
export function readStagePlans(value: unknown): StagePlan[] {
  const parsed = z.array(storedPlan).safeParse(value)
  return parsed.success ? parsed.data : []
}
export function remainingStages(stage: string): readonly string[] {
  return PLAN_STAGES.filter(item => STAGES.indexOf(item) >= STAGES.indexOf(stage as typeof STAGES[number]))
}
export function validatePlanOrder(plans: ReadonlyArray<{ stage: string; startDate: string; endDate: string }>) {
  for (let index = 0; index < plans.length; index++) {
    const item = plans[index]!
    if (item.startDate > item.endDate) invalid('阶段开始日期不得晚于结束日期')
    if (index && item.startDate < plans[index - 1]!.endDate) invalid('后阶段开始不得早于前阶段结束')
  }
}
export function assertScheduled(stage: string, value: unknown) {
  const plans = readStagePlans(value), required = remainingStages(stage)
  if (!required.length || required.some(item => !plans.some(plan => plan.stage === item))) invalid('请先完整保存当前及后续阶段排期')
  validatePlanOrder(plans)
  return plans
}
