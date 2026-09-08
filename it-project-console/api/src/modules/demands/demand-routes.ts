import type { FastifyInstance, preHandlerHookHandler } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import type { PrismaClient } from '../../generated/prisma/client.js'
import { AppError } from '../../lib/errors.js'
import { DemandService } from './demand-service.js'
import { demandSchema, demandUpdateSchema, commandSchema, idSchema } from './demand-schemas.js'
export async function registerDemandRoutes(app: FastifyInstance, db: PrismaClient, authenticate: preHandlerHookHandler) {
  const api = app.withTypeProvider<ZodTypeProvider>()
  const service = new DemandService(db)
  const params = z.object({ id: idSchema })
  api.get('/api/demands', { preHandler: authenticate }, async () => ({
    data: await db.demand.findMany({ orderBy: { submittedAt: 'desc' }, include: { attachments: true } })
  }))
  api.get('/api/demands/:id', { preHandler: authenticate, schema: { params } }, async request => {
    const row = await db.demand.findUnique({ where: { id: request.params.id }, include: { attachments: true } })
    if (!row) throw new AppError(404, 'DEMAND_NOT_FOUND', '需求不存在')
    return { data: row }
  })
  api.post('/api/demands', { preHandler: authenticate, schema: { body: demandSchema } }, async request => ({
    data: await service.create(request.actor!, request.body)
  }))
  api.patch('/api/demands/:id', { preHandler: authenticate, schema: { params, body: demandUpdateSchema } }, async request => ({
    data: await service.save(request.actor!, request.params.id, request.body)
  }))
  api.post('/api/demands/:id/withdraw', { preHandler: authenticate, schema: { params, body: commandSchema } }, async request => ({
    data: await service.withdraw(request.actor!, request.params.id, request.body)
  }))
  api.delete('/api/demands/:id', { preHandler: authenticate, schema: { params, body: commandSchema } }, async request => ({
    data: await service.delete(request.actor!, request.params.id, request.body)
  }))
}
