import { deliveryHref } from '../../lib/delivery-url.js'
import { z } from 'zod'
import { commandSchema } from '../demands/demand-schemas.js'
const summary = z.string().trim().min(1).max(2000)
const url = z.string().trim().max(2000).refine(value => deliveryHref(value) !== null,
  '请输入有效网页地址，支持HTTP/HTTPS和内网地址，请勿包含账号密码')
export const acceptanceSchema = z.discriminatedUnion('action', [
  commandSchema.extend({ action: z.literal('assign'), ownerId: z.string().trim().min(1), summary }).strict(),
  commandSchema.extend({ action: z.literal('submit'), summary, url: url.optional() }).strict(),
  commandSchema.extend({ action: z.literal('withdraw'), summary }).strict(),
  commandSchema.extend({ action: z.literal('return'), summary }).strict(),
  commandSchema.extend({ action: z.literal('accept'), summary: z.string().trim().max(2000).optional() }).strict()
])
