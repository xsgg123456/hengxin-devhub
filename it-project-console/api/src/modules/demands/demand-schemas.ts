import { z } from 'zod'
export const idSchema = z.string().trim().min(1).max(100)
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}, '日期无效')
export const materialSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('link'), url: z.string().max(2048).url().refine(value => {
    const url = URL.parse(value)
    return !!url && url.protocol === 'https:' && !url.username && !url.password
  }, '仅支持不含账号密码的 HTTPS 链接') }).strict(),
  z.object({ kind: z.literal('file'), attachmentId: idSchema }).strict()
]).nullable()
export const commandSchema = z.object({ requestId: idSchema, version: z.number().int().positive() }).strict()
export const demandSchema = z.object({
  requestId: idSchema, name: z.string().trim().max(100),
  description: z.string().trim().max(300).default(''),
  expectedLaunchDate: z.union([dateSchema, z.literal(''), z.null()]).default(null),
  attachmentIds: z.array(idSchema).optional(),
  prd: materialSchema.default(null), prototype: materialSchema.default(null), submit: z.boolean()
}).strict()
export const demandUpdateSchema = demandSchema.extend({ version: z.number().int().positive() })
export type DemandInput = z.infer<typeof demandSchema>
