import { z } from 'zod'
import { commandSchema } from '../demands/demand-schemas.js'
export const STAGES = ['需求受理', '立项评审', '方案设计', '开发编码', '联调测试', '上线部署', '验收交付'] as const
const status = z.enum(['not-started', 'in-progress', 'nearly-done', 'completed', 'blocked'])
export const progressSchema = commandSchema.extend({
  kind: z.enum(['overall', 'personal']), summary: z.string().trim().max(300).default(''),
  blocker: z.string().trim().max(300).optional(), status: status.optional()
}).strict().refine(input => input.kind !== 'overall' || input.status === undefined ||
  input.status === 'in-progress' || input.status === 'completed', { message: '整体更新仅支持尚未完成或已完成', path: ['status'] })
export const correctionSchema = commandSchema.extend({
  stage: z.enum(STAGES), status: status.optional(),
  reason: z.string().trim().min(1).max(300), blocker: z.string().trim().max(300).optional()
}).strict()
export const actionSchema = commandSchema.extend({
  action: z.enum(['complete', 'cancel', 'archive', 'reopen', 'delete']),
  reason: z.string().trim().max(300).optional()
}).strict()
export type ProgressInput = z.infer<typeof progressSchema>
export type CorrectionInput = z.infer<typeof correctionSchema>
