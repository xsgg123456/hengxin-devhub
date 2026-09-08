import type { FastifyInstance, preHandlerHookHandler } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import type { PrismaClient } from '../../generated/prisma/client.js'
import { reviewSchema } from '../projects/project-schemas.js'
import { idSchema } from '../demands/demand-schemas.js'
import { ApprovalService } from './approval-service.js'
export async function registerApprovalRoutes(app: FastifyInstance, db: PrismaClient, authenticate: preHandlerHookHandler) {
  const api = app.withTypeProvider<ZodTypeProvider>()
  const service = new ApprovalService(db)
  api.post('/api/demands/:id/review', { preHandler: authenticate, schema: {
    params: z.object({ id: idSchema }), body: reviewSchema
  } }, async request => ({ data: await service.review(request.actor!, request.params.id, request.body) }))
}
