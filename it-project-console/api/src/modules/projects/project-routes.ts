import type { FastifyInstance, preHandlerHookHandler } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import type { PrismaClient } from '../../generated/prisma/client.js'
import { projectSchema } from './project-schemas.js'
import { ProjectService } from './project-service.js'
export async function registerProjectRoutes(app: FastifyInstance, db: PrismaClient, authenticate: preHandlerHookHandler) {
  const api = app.withTypeProvider<ZodTypeProvider>()
  const service = new ProjectService(db)
  api.post('/api/projects', { preHandler: authenticate, schema: { body: projectSchema } }, async request => ({
    data: await service.create(request.actor!, request.body)
  }))
}
