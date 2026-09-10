import cron from 'node-cron'
import { z } from 'zod'

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    RISK_SCAN_CRON: z.string().default('* * * * *').refine(cron.validate),
    HOST: z.string().default('127.0.0.1'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4322),
    REQUESTS_PER_MINUTE: z.coerce.number().int().min(1).max(10000).default(600),
    DATABASE_URL: z
      .string()
      .url()
      .refine((v) => /^postgres(ql)?:/.test(v)),
    WEB_ORIGIN: z.string().url().default('http://127.0.0.1:4317'),
    DEV_LOGIN: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    SESSION_HOURS: z.coerce.number().int().min(1).max(24).default(8),
    DINGTALK_CLIENT_ID: z.string().trim().default(''),
    DINGTALK_CLIENT_SECRET: z.string().trim().default(''),
    DINGTALK_CORP_ID: z.string().trim().default(''),
    DINGTALK_AGENT_ID: z.string().trim().default(''),
    DINGTALK_REDIRECT_URI: z.union([z.literal(''), z.string().url()]).default(''),
    BOOTSTRAP_ADMIN_DING_USER_ID: z.string().trim().default(''),
    DINGTALK_NOTIFICATIONS_ENABLED: z.enum(['true', 'false']).default('false').transform(v => v === 'true'),
    DINGTALK_MANAGER_DIGEST_TIME: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default('09:00'),
    S3_ENDPOINT: z.string().url(),
    S3_PUBLIC_ENDPOINT: z.string().url(),
    S3_REGION: z.string().default('us-east-1'),
    S3_BUCKET: z.string().regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/),
    S3_ACCESS_KEY: z.string().min(3),
    S3_SECRET_KEY: z.string().min(16),
    MAX_FILE_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .max(100 * 1024 * 1024)
      .default(100 * 1024 * 1024),
    MAX_DEMAND_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .max(500 * 1024 * 1024)
      .default(500 * 1024 * 1024)
  })
  .superRefine((v, context) => {
    if (v.DINGTALK_NOTIFICATIONS_ENABLED && (!v.DINGTALK_CLIENT_ID || !v.DINGTALK_CLIENT_SECRET || !v.DINGTALK_CORP_ID || !/^\d+$/.test(v.DINGTALK_AGENT_ID) || Number(v.DINGTALK_AGENT_ID) <= 0))
      context.addIssue({code:'custom',path:['DINGTALK_NOTIFICATIONS_ENABLED'],message:'通知投递需要完整钉钉企业应用配置'})
    if (v.NODE_ENV === 'production' && v.DINGTALK_REDIRECT_URI && !v.DINGTALK_REDIRECT_URI.startsWith('https://'))
      context.addIssue({code:'custom',path:['DINGTALK_REDIRECT_URI'],message:'生产回调必须使用HTTPS'})
    if (!URL.canParse(v.WEB_ORIGIN) || new URL(v.WEB_ORIGIN).origin !== v.WEB_ORIGIN)
      context.addIssue({
        code: 'custom',
        path: ['WEB_ORIGIN'],
        message: '必须是完整 origin，无路径'
      })
    if (v.NODE_ENV === 'production' && v.DEV_LOGIN)
      context.addIssue({
        code: 'custom',
        path: ['DEV_LOGIN'],
        message: '生产环境禁止开发登录'
      })
    if (v.NODE_ENV === 'production' && !v.WEB_ORIGIN.startsWith('https://'))
      context.addIssue({
        code: 'custom',
        path: ['WEB_ORIGIN'],
        message: '生产环境必须使用 HTTPS'
      })
  })
export type Env = z.infer<typeof schema>
export function parseEnv(input: NodeJS.ProcessEnv): Env {
  const nonempty = (value: string | undefined) => value?.trim() || undefined
  const origin = nonempty(input.WEB_ORIGIN) ?? nonempty(input.NEXTAUTH_URL)?.replace(/\/$/, '')
  const result = schema.safeParse({
    ...input,
    WEB_ORIGIN: origin,
    DINGTALK_CLIENT_ID: nonempty(input.DINGTALK_CLIENT_ID) ?? nonempty(input.DINGTALK_APP_KEY),
    DINGTALK_CLIENT_SECRET: nonempty(input.DINGTALK_CLIENT_SECRET) ?? nonempty(input.DINGTALK_APP_SECRET),
    DINGTALK_REDIRECT_URI: nonempty(input.DINGTALK_REDIRECT_URI) ??
      (origin ? `${origin}/api/auth/callback/dingtalk` : '')
  })
  if (!result.success)
    throw new Error(
      `配置无效：${[...new Set(result.error.issues.map((i) => i.path.join('.')))].join(', ')}`
    )
  return result.data
}
