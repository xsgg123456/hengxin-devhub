import { z } from 'zod'
import { dateSchema, idSchema } from '../demands/demand-schemas.js'
export const projectFields = {
  priority: z.enum(['P0', 'P1', 'P2']), primaryOwnerId: idSchema,
  collaboratorIds: z.array(idSchema).max(100).default([]),
  originalLaunchDate: dateSchema.optional(), originalDeliveryDate: dateSchema.optional(),
  stageExpectedDate: dateSchema.optional()
}
export const projectSchema = z.object({
  requestId: idSchema, name: z.string().trim().min(1).max(100),
  department: z.string().trim().min(1).max(100), ...projectFields
}).strict()
export const reviewSchema = z.discriminatedUnion('decision', [
  z.object({ requestId: idSchema, version: z.number().int().positive(), decision: z.literal('approve'), reason: z.string().trim().max(300).optional(), ...projectFields }).strict(),
  z.object({ requestId: idSchema, version: z.number().int().positive(), decision: z.enum(['return', 'reject']), reason: z.string().trim().min(1).max(300) }).strict()
])
export type ProjectInput = z.infer<typeof projectSchema>
