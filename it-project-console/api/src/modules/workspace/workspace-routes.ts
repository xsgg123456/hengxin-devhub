import type { FastifyInstance, preHandlerHookHandler } from 'fastify'
import type { PrismaClient } from '../../generated/prisma/client.js'
import { mapUser, mapDemand, mapProject } from './read-model.js'
export function registerWorkspaceRoutes(
  app: FastifyInstance,
  db: PrismaClient,
  authenticate: preHandlerHookHandler
) {
  app.get('/api/workspace', { preHandler: authenticate }, async (request) => {
    const database = await db.$transaction(
      async (tx) => {
        const [users, demands, projects, progressUpdates, scheduleChanges, lifecycleEvents] =
          await Promise.all([
            tx.user.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
            tx.demand.findMany({
              include: { attachments: true },
              orderBy: [{ submittedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }]
            }),
            tx.project.findMany({
              include: { members: true, stageHistories: { orderBy: { createdAt: 'asc' } } },
              orderBy: { createdAt: 'desc' }
            }),
            tx.progressUpdate.findMany({ orderBy: { createdAt: 'desc' } }),
            tx.scheduleChange.findMany({ orderBy: { createdAt: 'desc' } }),
            tx.lifecycleEvent.findMany({ orderBy: { createdAt: 'desc' } })
          ])
        return {
          schemaVersion: 2,
          users: users.map(mapUser),
          demands: demands.map(mapDemand),
          projects: projects.map(mapProject),
          stageHistories: projects.flatMap((project) =>
            project.stageHistories
              .filter((item) => item.enteredAt || item.completedAt || item.interruptedAt)
              .map((item) => ({
                projectId: project.id,
                stage: item.stage,
                startedAt: item.enteredAt?.toISOString() ?? '',
                completedAt: item.completedAt?.toISOString() ?? null,
                interruptedAt: item.interruptedAt?.toISOString()
              }))
          ),
          progressUpdates: progressUpdates.map((row) => ({
            ...row,
            overallProgress: row.overallProgress ?? undefined,
            createdAt: row.createdAt.toISOString()
          })),
          scheduleChanges: scheduleChanges.map((row) => ({
            ...row,
            createdAt: row.createdAt.toISOString()
          })),
          lifecycleEvents: lifecycleEvents.map((row) => ({
            ...row,
            createdAt: row.createdAt.toISOString()
          }))
        }
      },
      { isolationLevel: 'RepeatableRead' }
    )
    return {
      data: {
        schemaVersion: 2,
        revision: Date.now(),
        activeUserId: request.actor!.id,
        scenario: 'normal',
        database,
        updatedAt: new Date().toISOString()
      }
    }
  })
}
