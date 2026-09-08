import cron from 'node-cron'
import { z } from 'zod'

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    RISK_SCAN_CRON: z.string().default('* * * * *').refine(cron.validate),
    HOST: z.string().default('127.0.0.1'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4322),
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
      .max(20 * 1024 * 1024)
      .default(20 * 1024 * 1024),
    MAX_DEMAND_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .max(50 * 1024 * 1024)
      .default(50 * 1024 * 1024)
  })
  .superRefine((v, context) => {
    if (new URL(v.WEB_ORIGIN).origin !== v.WEB_ORIGIN)
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
  const result = schema.safeParse(input)
  if (!result.success)
    throw new Error(
      `配置无效：${[...new Set(result.error.issues.map((i) => i.path.join('.')))].join(', ')}`
    )
  return result.data
}
