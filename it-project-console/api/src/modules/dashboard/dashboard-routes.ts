import type { FastifyInstance, preHandlerHookHandler } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import type { PrismaClient } from '../../generated/prisma/client.js'
import { dashboardQuery, demandQuery, ganttQuery, workloadQuery } from './query-schemas.js'
import { assigned, dashboard, filterProjects, readProjects } from './dashboard-service.js'
import { demandStatistics } from './demand-statistics-service.js'
import { personWorkload } from '../workload/workload-service.js'
import { buildGanttRows } from '../gantt/gantt-service.js'

export function registerDashboardRoutes(
  app: FastifyInstance,
  db: PrismaClient,
  authenticate: preHandlerHookHandler
) {
  const api = app.withTypeProvider<ZodTypeProvider>()
  api.get(
    '/api/dashboard',
    { preHandler: authenticate, schema: { querystring: dashboardQuery } },
    async (request) => ({
      data: await db.$transaction((tx) => dashboard(tx, request.query, request.actor!.id), {
        isolationLevel: 'RepeatableRead'
      })
    })
  )
  api.get(
    '/api/workload',
    { preHandler: authenticate, schema: { querystring: workloadQuery } },
    async (request) => ({
      data: await db.$transaction(
        async (tx) => {
          const { projects, users } = await readProjects(tx)
          return personWorkload(
            filterProjects(projects, users, request.query, request.actor!.id),
            users,
            request.query.month
          )
        },
        { isolationLevel: 'RepeatableRead' }
      )
    })
  )
  api.get(
    '/api/gantt',
    { preHandler: authenticate, schema: { querystring: ganttQuery } },
    async (request) => ({
      data: await db.$transaction(
        async (tx) => {
          const { projects } = await readProjects(tx)
          return buildGanttRows(
            projects.filter(
              (p) => request.query.scope !== 'mine' || assigned(p, request.actor!.id)
            ),
            request.query.month,
            request.query
          )
        },
        { isolationLevel: 'RepeatableRead' }
      )
    })
  )
  api.get(
    '/api/demand-statistics',
    { preHandler: authenticate, schema: { querystring: demandQuery } },
    async (request) => ({
      data: await db.$transaction((tx) => demandStatistics(tx, request.query, request.actor!.id), {
        isolationLevel: 'RepeatableRead'
      })
    })
  )
}
