import { z } from 'zod'
import { commandSchema } from '../demands/demand-schemas.js'
const summary = z.string().trim().min(1).max(2000)
const url = z.string().trim().max(2000).refine(value => {
  if (!value) return true
  try { const parsed = new URL(value); return parsed.protocol === 'https:' && !parsed.username && !parsed.password } catch { return false }
}, '交付链接必须为 HTTPS 地址且不能包含账号密码')
export const acceptanceSchema = z.discriminatedUnion('action', [
  commandSchema.extend({ action: z.literal('assign'), ownerId: z.string().trim().min(1), summary }).strict(),
  commandSchema.extend({ action: z.literal('submit'), summary, url: url.optional() }).strict(),
  commandSchema.extend({ action: z.literal('withdraw'), summary }).strict(),
  commandSchema.extend({ action: z.literal('return'), summary }).strict(),
  commandSchema.extend({ action: z.literal('accept'), summary: z.string().trim().max(2000).optional() }).strict()
])
