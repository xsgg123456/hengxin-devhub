import type { FastifyInstance, preHandlerHookHandler } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import type { PrismaClient } from '../../generated/prisma/client.js'
import { idSchema } from '../demands/demand-schemas.js'
import { z } from 'zod'
import { actionSchema, correctionSchema, progressSchema } from './progress-schemas.js'
import { ProgressService } from './progress-service.js'
import { ProjectAdminService } from '../projects/project-admin-service.js'
import type { ProjectChanged } from './progress-state.js'
export async function registerProgressRoutes(app: FastifyInstance, db: PrismaClient,
  authenticate: preHandlerHookHandler, onProjectChanged?: ProjectChanged) {
  const api = app.withTypeProvider<ZodTypeProvider>(), params = z.object({ id: idSchema })
  const progress = new ProgressService(db, onProjectChanged), admin = new ProjectAdminService(db, onProjectChanged)
  api.post('/api/projects/:id/progress', { preHandler: authenticate, schema: { params, body: progressSchema } },
    async request => ({ data: await progress.update(request.actor!, request.params.id, request.body) }))
  api.post('/api/projects/:id/action', { preHandler: authenticate, schema: { params, body: actionSchema } },
    async request => ({ data: await admin.action(request.actor!, request.params.id, request.body) }))
  api.post('/api/projects/:id/correct', { preHandler: authenticate, schema: { params, body: correctionSchema } },
    async request => ({ data: await admin.correct(request.actor!, request.params.id, request.body) }))
}
