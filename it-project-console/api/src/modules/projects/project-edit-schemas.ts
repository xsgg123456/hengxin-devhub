import { z } from 'zod'
import { commandSchema, dateSchema, firstRequestedDateSchema, idSchema } from '../demands/demand-schemas.js'
import { STAGES } from '../progress/progress-schemas.js'
import { deliveryHref } from '../../lib/delivery-url.js'
const optionalDate = z.union([dateSchema, z.literal(''), z.null()]).transform(value => value || null)
const person = z.union([idSchema, z.literal(''), z.null()]).transform(value => value || null)
export const projectEditSchema = commandSchema.extend({
  reason: z.string().trim().min(1).max(300), verify: z.boolean(),
  name: z.string().trim().min(1).max(100), department: z.string().trim().min(1).max(100),
  description: z.string().trim().max(3000), priority: z.enum(['P0', 'P1', 'P2']),
  firstRequestedOn: z.union([firstRequestedDateSchema, z.literal(''), z.null()]).transform(value => value || null),
  primaryOwnerId: idSchema, collaboratorIds: z.array(idSchema).max(100),
  businessOwnerId: person, acceptanceOwnerId: person,
  stage: z.enum(STAGES), simpleStatus: z.enum(['not-started', 'in-progress', 'nearly-done', 'blocked', 'completed']),
  blocker: z.string().trim().max(300),
  approvedLaunchDate: optionalDate, originalLaunchDate: optionalDate, originalDeliveryDate: optionalDate,
  expectedLaunchDate: optionalDate, expectedDeliveryDate: optionalDate,
  stagePlans: z.array(z.object({ stage: z.enum(STAGES), startDate: dateSchema, endDate: dateSchema }).strict()).max(7),
  acceptanceUrl: z.string().trim().max(2000).refine(value => deliveryHref(value) !== null, '交付链接无效'),
  acceptanceSummary: z.string().trim().max(2000)
}).strict()
export type ProjectEditInput = z.infer<typeof projectEditSchema>
