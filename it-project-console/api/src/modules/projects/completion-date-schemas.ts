import { z } from 'zod'
import { commandSchema, dateSchema } from '../demands/demand-schemas.js'
import { STAGES } from '../progress/progress-schemas.js'

export const completionDateSchema = commandSchema.extend({
  reason: z.string().trim().min(1).max(300),
  dates: z.array(z.object({
    stage: z.enum(STAGES),
    completedOn: dateSchema
  }).strict()).min(1).max(STAGES.length)
}).strict().superRefine((input, context) => {
  const stages = input.dates.map(item => item.stage)
  if (new Set(stages).size !== stages.length)
    context.addIssue({ code: 'custom', path: ['dates'], message: '同一环节不能重复提交' })
})

export type CompletionDateInput = z.infer<typeof completionDateSchema>
