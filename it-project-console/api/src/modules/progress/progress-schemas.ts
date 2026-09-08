import { z } from 'zod'
import { commandSchema, dateSchema } from '../demands/demand-schemas.js'
export const STAGES = ['需求受理', '立项评审', '方案设计', '开发编码', '联调测试', '上线部署', '验收交付'] as const
const status = z.enum(['not-started', 'in-progress', 'nearly-done', 'completed', 'blocked'])
const schedule = {
  stageExpectedDate: dateSchema.optional(), expectedLaunchDate: dateSchema.optional(),
  expectedDeliveryDate: dateSchema.optional(),
  changeReason: z.enum(['业务新增或变更需求', '技术问题', '等待外部资源', '人员安排变化', '其他']).optional(),
  changeDescription: z.string().trim().min(1).max(300).optional()
}
export const progressSchema = commandSchema.extend({
  kind: z.enum(['overall', 'personal']), summary: z.string().trim().min(1).max(300),
  blocker: z.string().trim().max(300).optional(), status: status.optional(),
  overallProgress: z.number().min(0).max(100).optional(),
  nextStageExpectedDate: dateSchema.optional(), ...schedule
}).strict()
export const correctionSchema = commandSchema.extend({
  stage: z.enum(STAGES), overallProgress: z.number().min(0).max(100), status: status.optional(),
  reason: z.string().trim().min(1).max(300), blocker: z.string().trim().max(300).optional(), ...schedule
}).strict()
export const actionSchema = commandSchema.extend({
  action: z.enum(['complete', 'cancel', 'archive', 'reopen', 'delete']),
  reason: z.string().trim().max(300).optional()
}).strict()
export type ProgressInput = z.infer<typeof progressSchema>
export type CorrectionInput = z.infer<typeof correctionSchema>
