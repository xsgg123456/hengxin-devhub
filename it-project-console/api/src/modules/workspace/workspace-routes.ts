import type { FastifyInstance, preHandlerHookHandler } from 'fastify'
import type { PrismaClient } from '../../generated/prisma/client.js'
import { mapUser, mapDemand, mapProject } from './read-model.js'
import { canApproveProjects } from '../../lib/project-approver.js'
export function registerWorkspaceRoutes(
  app: FastifyInstance,
  db: PrismaClient,
  authenticate: preHandlerHookHandler,
  approverId = ''
) {
  app.get('/api/workspace', { preHandler: authenticate }, async (request) => {
    const workspace = await db.$transaction(
      async (tx) => {
        const [users, demands, projects, progressUpdates, scheduleChanges, completionDateChanges, lifecycleEvents, projectProposals] =
          await Promise.all([
            tx.user.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
            tx.demand.findMany({
              include: {
                attachments: true,
                project: { select: { id: true, department: true, businessOwnerId: true } }
              },
              orderBy: [{ submittedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }]
            }),
            tx.project.findMany({
              include: { members: true, stageHistories: { orderBy: { createdAt: 'asc' } } },
              orderBy: { createdAt: 'desc' }
            }),
            tx.progressUpdate.findMany({ orderBy: { createdAt: 'desc' } }),
            tx.scheduleChange.findMany({ orderBy: { createdAt: 'desc' } }),
            tx.completionDateChange.findMany({ orderBy: { createdAt: 'desc' } }),
            tx.lifecycleEvent.findMany({ orderBy: { createdAt: 'desc' } }),
            tx.projectProposal.findMany({ orderBy: { createdAt: 'desc' } })
          ])
        const revision = await tx.$queryRaw<Array<{ revision: string }>>
          `SELECT revision::text FROM workspace_revision WHERE id = 1`
        return {
          database: {
            schemaVersion: 2,
            users: users.map(user => ({ ...mapUser(user), canApproveProjects: canApproveProjects(user, approverId) })),
            demands: demands.map(mapDemand),
            projects: projects.map(mapProject),
            projectProposals: projectProposals.map(row => ({
              ...row,
              approvedLaunchDate: row.approvedLaunchDate.toISOString().slice(0, 10),
              createdAt: row.createdAt.toISOString(),
              updatedAt: row.updatedAt.toISOString()
            })),
            stageHistories: projects.flatMap((project) =>
              project.stageHistories
                .filter((item) => item.enteredAt || item.completedAt || item.interruptedAt)
                .map((item) => ({
                  projectId: project.id,
                  stage: item.stage,
                  startedAt: item.enteredAt?.toISOString() ?? '',
                  completedAt: item.completedAt?.toISOString() ?? null,
                  plannedStartDate: item.plannedStartDate?.toISOString().slice(0, 10) ?? null,
                  plannedEndDate: item.plannedEndDate?.toISOString().slice(0, 10) ?? null,
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
            completionDateChanges: completionDateChanges.map((row) => ({
              ...row,
              createdAt: row.createdAt.toISOString()
            })),
            lifecycleEvents: lifecycleEvents.map((row) => ({
              ...row,
              createdAt: row.createdAt.toISOString()
            }))
          },
          workspaceRevision: revision[0]?.revision ?? ''
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
        database: workspace.database,
        workspaceRevision: workspace.workspaceRevision,
        updatedAt: new Date().toISOString()
      }
    }
  })
}
