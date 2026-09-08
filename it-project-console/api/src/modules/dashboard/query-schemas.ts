import { z } from 'zod'
import { dateSchema } from '../demands/demand-schemas.js'
import { STAGES } from '../progress/progress-schemas.js'
const text = z.string().trim().max(100).default('')
const scope = z.enum(['all', 'mine']).default('all')
const risk = z.enum(['all', 'any', 'delayed', 'stale', 'blocked']).default('all')
const includeArchived = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true')
export const monthSchema = z.string().regex(/^[1-9]\d{3}-(0[1-9]|1[0-2])$/)
const projectFields = {
  scope,
  risk,
  includeArchived,
  person: text,
  department: text,
  keyword: text,
  stage: z.union([z.enum(STAGES), z.literal('')]).default(''),
  status: z.enum(['all', 'active', 'completed', 'cancelled']).default('all'),
  from: dateSchema.optional(),
  to: dateSchema.optional(),
  page: z.coerce.number().int().min(1).max(1000000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20)
}
const dateOrder = (q: { from?: string; to?: string }) => !q.from || !q.to || q.from <= q.to
export const dashboardQuery = z
  .object(projectFields)
  .strict()
  .refine(dateOrder, '起始日期不得晚于结束日期')
export const workloadQuery = z
  .object({ ...projectFields, month: monthSchema })
  .strict()
  .refine(dateOrder, '起始日期不得晚于结束日期')
export const ganttQuery = z
  .object({ scope, risk, includeArchived, month: monthSchema, ownerId: text, department: text })
  .strict()
export const demandQuery = z
  .object({
    scope,
    department: text,
    keyword: text,
    submitterId: text,
    status: z
      .enum(['', 'all', 'draft', 'pending', 'returned', 'rejected', 'established', 'withdrawn'])
      .default('')
  })
  .strict()
export type DashboardQuery = z.infer<typeof dashboardQuery>
export type DemandQuery = z.infer<typeof demandQuery>
