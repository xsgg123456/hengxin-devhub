import { registerProgressRoutes } from './modules/progress/progress-routes.js'
import { registerDashboardRoutes } from './modules/dashboard/dashboard-routes.js'
import { registerManagerGrantRoutes } from './modules/manager-grants/manager-grant-routes.js'
import { refreshProjectRisks } from './modules/risks/risk-scan-job.js'
import { registerWorkspaceRoutes } from './modules/workspace/workspace-routes.js'
import { registerDemandRoutes } from './modules/demands/demand-routes.js'
import { registerApprovalRoutes } from './modules/approvals/approval-routes.js'
import { registerProjectRoutes } from './modules/projects/project-routes.js'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import type { PrismaClient } from './generated/prisma/client.js'
import type { Env } from './config/env.js'
import { authService, requireManager } from './plugins/auth.js'
import type { AttachmentService } from './modules/attachments/attachment-service.js'

export async function registerRoutes(
  app: FastifyInstance,
  db: PrismaClient,
  env: Env,
  attachments: AttachmentService
) {
  const api = app.withTypeProvider<ZodTypeProvider>()
  const auth = authService(db, env)
  registerDashboardRoutes(app, db, auth.authenticate)
  registerManagerGrantRoutes(app, db, auth.authenticate)
  registerProgressRoutes(app, db, auth.authenticate, async (tx, id) => {
    await refreshProjectRisks(tx, id)
  })
  registerWorkspaceRoutes(app, db, auth.authenticate)
  registerDemandRoutes(app, db, auth.authenticate)
  registerApprovalRoutes(app, db, auth.authenticate)
  registerProjectRoutes(app, db, auth.authenticate)
  if (env.NODE_ENV !== 'production' && env.DEV_LOGIN) {
    api.get('/api/auth/dev-accounts', async () => ({
      data: await db.user.findMany({
        where: {
          active: true,
          id: {
            in: [
              'user-manager-chen',
              'user-business-li',
              'user-engineer-wang',
              'user-engineer-zhao'
            ]
          }
        },
        select: { id: true, name: true, department: true, role: true }
      })
    }))
    api.post(
      '/api/auth/dev-login',
      {
        config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
        schema: {
          tags: ['开发登录'],
          body: z
            .object({
              userId: z.enum([
                'user-manager-chen',
                'user-business-li',
                'user-engineer-wang',
                'user-engineer-zhao'
              ])
            })
            .strict()
        }
      },
      async (request, reply) => ({
        data: await auth.login(request.body.userId, request, reply)
      })
    )
  }
  api.post('/api/auth/logout', { preHandler: auth.authenticate }, async (request, reply) => {
    await auth.logout(request, reply)
    return { data: { loggedOut: true } }
  })
  api.get('/api/me', { preHandler: auth.authenticate }, async (request) => ({
    data: request.actor
  }))
  api.get('/api/admin/settings', { preHandler: [auth.authenticate, requireManager] }, async () => ({
    data: await db.systemSetting.findMany()
  }))
  api.post(
    '/api/attachments/upload',
    {
      preHandler: auth.authenticate,
      schema: {
        tags: ['附件'],
        body: z
          .object({
            demandId: z.string().min(1).max(100),
            kind: z.enum(['PRD', 'PROTOTYPE']),
            name: z.string().min(1).max(255),
            mime: z.string().min(1).max(150),
            size: z.number().int().positive()
          })
          .strict()
      }
    },
    async (request) => ({
      data: await attachments.requestUpload(request.actor!, request.body)
    })
  )
  const params = z.object({ id: z.string().min(1).max(100) })
  api.post(
    '/api/attachments/:id/confirm',
    { preHandler: auth.authenticate, schema: { tags: ['附件'], params } },
    async (request) => ({
      data: await attachments.confirmUpload(request.actor!, request.params.id)
    })
  )
  api.delete(
    '/api/attachments/:id',
    { preHandler: auth.authenticate, schema: { params } },
    async (request) => ({ data: await attachments.discard(request.actor!, request.params.id) })
  )
  api.get(
    '/api/attachments/:id/download',
    { preHandler: auth.authenticate, schema: { tags: ['附件'], params } },
    async (request) => ({
      data: await attachments.download(request.actor!, request.params.id)
    })
  )
}
