import type { FastifyInstance, preHandlerHookHandler } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import type { PrismaClient } from '../../generated/prisma/client.js'
import { projectSchema, proposalConfirmSchema, proposalResubmitSchema } from './project-schemas.js'
import { ProjectService } from './project-service.js'
import { ProposalService } from './proposal-service.js'
import { commandSchema } from '../demands/demand-schemas.js'
export async function registerProjectRoutes(app: FastifyInstance, db: PrismaClient, authenticate: preHandlerHookHandler) {
  const api = app.withTypeProvider<ZodTypeProvider>()
  const service = new ProjectService(db)
  const proposals = new ProposalService(db)
  api.post<{ Params: { id: string } }>('/api/project-proposals/:id/confirm', { preHandler: authenticate, schema: { body: proposalConfirmSchema } }, async request => ({ data: await proposals.confirm(request.actor!, request.params.id, request.body) }))
  api.post<{ Params: { id: string } }>('/api/project-proposals/:id/resubmit', { preHandler: authenticate, schema: { body: proposalResubmitSchema } }, async request => ({ data: await proposals.resubmit(request.actor!, request.params.id, request.body) }))
  api.delete<{ Params: { id: string } }>('/api/project-proposals/:id', { preHandler: authenticate, schema: { body: commandSchema } }, async request => ({ data: await proposals.delete(request.actor!, request.params.id, request.body) }))
  api.post('/api/projects', { preHandler: authenticate, schema: { body: projectSchema } }, async request => ({
    data: await service.create(request.actor!, request.body)
  }))
}
