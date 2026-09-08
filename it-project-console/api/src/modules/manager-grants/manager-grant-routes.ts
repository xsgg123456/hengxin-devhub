import type { FastifyInstance, preHandlerHookHandler } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import type { PrismaClient } from '../../generated/prisma/client.js'
import { z } from 'zod'
import { ManagerGrantService } from './manager-grant-service.js'

export function registerManagerGrantRoutes(
  app: FastifyInstance,
  db: PrismaClient,
  authenticate: preHandlerHookHandler
) {
  const api = app.withTypeProvider<ZodTypeProvider>()
  const service = new ManagerGrantService(db)
  api.get('/api/manager-grants', { preHandler: authenticate }, async (request) => ({
    data: await service.list(request.actor!)
  }))
  api.get('/api/manager-grants/candidates', { preHandler: authenticate }, async (request) => ({
    data: await service.candidates(request.actor!)
  }))
  api.post(
    '/api/manager-grants',
    {
      preHandler: authenticate,
      schema: {
        body: z
          .object({
            userId: z.string().min(1).max(100),
            enabled: z.boolean(),
            requestId: z.string().uuid()
          })
          .strict()
      }
    },
    async (request) => ({ data: await service.set(request.actor!, request.body) })
  )
}
