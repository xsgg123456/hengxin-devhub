import { scanProjectRisks } from './modules/risks/risk-scan-job.js'
import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import {
  validatorCompiler,
  serializerCompiler,
  jsonSchemaTransform
} from 'fastify-type-provider-zod'
import { ZodError } from 'zod'
import type { Env } from './config/env.js'
import type { PrismaClient } from './generated/prisma/client.js'
import { createPrisma } from './plugins/prisma.js'
import { AppError } from './lib/errors.js'
import { S3Storage } from './modules/storage/s3-storage.js'
import { AttachmentService } from './modules/attachments/attachment-service.js'
import { registerRoutes } from './routes.js'

export async function buildApp(
  env: Env,
  overrides: { db?: PrismaClient; storage?: S3Storage; logging?: boolean } = {}
) {
  const db = overrides.db ?? createPrisma(env.DATABASE_URL)
  const storage =
    overrides.storage ??
    new S3Storage({
      endpoint: env.S3_ENDPOINT,
      publicEndpoint: env.S3_PUBLIC_ENDPOINT,
      bucket: env.S3_BUCKET,
      region: env.S3_REGION,
      accessKeyId: env.S3_ACCESS_KEY,
      secretAccessKey: env.S3_SECRET_KEY
    })
  const attachments = new AttachmentService(db, storage, {
    maxFileBytes: env.MAX_FILE_BYTES,
    maxDemandBytes: env.MAX_DEMAND_BYTES
  })
  const app = Fastify({
    bodyLimit: 32 * 1024,
    requestTimeout: 15000,
    trustProxy: false,
    logger:
      overrides.logging === false
        ? false
        : {
            redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers.set-cookie'],
            serializers: {
              req: (req) => ({
                method: req.method,
                url: req.url?.split('?')[0]
              })
            }
          }
  })
  app.decorateRequest('actor', null)
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  await app.register(cookie)
  await app.register(cors, { origin: env.WEB_ORIGIN, credentials: true })
  await app.register(helmet)
  await app.register(rateLimit, { max: env.REQUESTS_PER_MINUTE, timeWindow: '1 minute' })
  app.addHook('onRequest', async (request) => {
    if (
      ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method) &&
      request.headers.origin !== env.WEB_ORIGIN
    )
      throw new AppError(403, 'ORIGIN_REJECTED', '请求来源不允许')
  })
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError)
      return reply.code(error.statusCode).send({
        error: { code: error.code, message: error.message },
        requestId: request.id
      })
    if (error instanceof ZodError || (error instanceof Error && 'validation' in error))
      return reply.code(400).send({
        error: { code: 'VALIDATION_ERROR', message: '请求参数无效' },
        requestId: request.id
      })
    const status =
      error instanceof Error && 'statusCode' in error && typeof error.statusCode === 'number'
        ? error.statusCode
        : 500
    const clientError = status >= 400 && status < 500
    if (status === 429)
      return reply.code(429).send({ error: { code: 'RATE_LIMITED', message: '请求过于频繁，请稍后重试' }, requestId: request.id })
    if (!clientError)
      request.log.error({ requestId: request.id, code: 'INTERNAL_ERROR' }, '请求处理失败')
    return reply.code(clientError ? status : 500).send({
      error: {
        code: clientError ? 'REQUEST_REJECTED' : 'INTERNAL_ERROR',
        message: clientError ? '请求无法处理，请检查输入或稍后重试' : '服务暂时不可用，请稍后重试'
      },
      requestId: request.id
    })
  })
  app.setNotFoundHandler((request, reply) =>
    reply.code(404).send({
      error: { code: 'NOT_FOUND', message: '接口不存在' },
      requestId: request.id
    })
  )
  if (env.NODE_ENV !== 'production') {
    await app.register(swagger, {
      openapi: { info: { title: 'IT 项目管理台 API', version: '0.1.0' } },
      transform: jsonSchemaTransform
    })
    await app.register(swaggerUi, { routePrefix: '/docs' })
  }
  app.get('/health/live', async () => ({ data: { status: 'ok' } }))
  app.get('/health/ready', async (_, reply) => {
    try {
      await Promise.all([db.$queryRaw`SELECT 1`, storage.health()])
      return { data: { status: 'ready' } }
    } catch {
      return reply.code(503).send({ error: { code: 'NOT_READY', message: '依赖服务尚未就绪' } })
    }
  })
  await registerRoutes(app, db, env, attachments)
  app.addHook('onClose', async () => {
    if (!overrides.db) await db.$disconnect()
    if (!overrides.storage) storage.close()
  })
  return { app, attachments, scanRisks: () => scanProjectRisks(db) }
}
