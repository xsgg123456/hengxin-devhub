import { AcceptanceService } from './acceptance-service.js'
import { ProjectEditService } from './project-edit-service.js'
import { projectEditSchema } from './project-edit-schemas.js'
import { acceptanceSchema } from './acceptance-schemas.js'
import type { FastifyInstance, preHandlerHookHandler } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import type { PrismaClient } from '../../generated/prisma/client.js'
import { projectSchema, proposalConfirmSchema, proposalResubmitSchema } from './project-schemas.js'
import { ProjectService } from './project-service.js'
import { ProposalService } from './proposal-service.js'
import { commandSchema } from '../demands/demand-schemas.js'
export async function registerProjectRoutes(app: FastifyInstance, db: PrismaClient, authenticate: preHandlerHookHandler, approverId = '') {
  const api = app.withTypeProvider<ZodTypeProvider>()
  const service = new ProjectService(db, approverId)
  const editor = new ProjectEditService(db, approverId)
  api.post<{ Params: { id: string } }>('/api/projects/:id/edit', { preHandler: authenticate, schema: { body: projectEditSchema } }, async request => ({ data: await editor.save(request.actor!, request.params.id, request.body) }))
  const acceptance = new AcceptanceService(db)
  api.post<{ Params: { id: string } }>('/api/projects/:id/acceptance', { preHandler: authenticate, schema: { body: acceptanceSchema } }, async request => ({ data: await acceptance.act(request.actor!, request.params.id, request.body) }))
  const proposals = new ProposalService(db, approverId)
  api.post<{ Params: { id: string } }>('/api/project-proposals/:id/confirm', { preHandler: authenticate, schema: { body: proposalConfirmSchema } }, async request => ({ data: await proposals.confirm(request.actor!, request.params.id, request.body) }))
  api.post<{ Params: { id: string } }>('/api/project-proposals/:id/resubmit', { preHandler: authenticate, schema: { body: proposalResubmitSchema } }, async request => ({ data: await proposals.resubmit(request.actor!, request.params.id, request.body) }))
  api.delete<{ Params: { id: string } }>('/api/project-proposals/:id', { preHandler: authenticate, schema: { body: commandSchema } }, async request => ({ data: await proposals.delete(request.actor!, request.params.id, request.body) }))
  api.post('/api/projects', { preHandler: authenticate, schema: { body: projectSchema } }, async request => ({
    data: await service.create(request.actor!, request.body)
  }))
}
