import type { FastifyInstance, preHandlerHookHandler } from 'fastify'
import type { PrismaClient } from '../../generated/prisma/client.js'
const date = (value: Date | null) => value?.toISOString().slice(0, 10) ?? ''
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
          users: users.map((user) => ({
            id: user.id,
            name: user.name,
            department: user.department,
            role: user.role.toLowerCase(),
            roleLabel: { MANAGER: '管理人员', BUSINESS: '业务人员', ENGINEER: 'IT工程师' }[
              user.role
            ]
          })),
          demands: demands.map((demand) => {
            const material = (url: string | null, attachmentId: string | null) => {
              if (url) return { kind: 'link', url, name: url, status: 'ready' }
              const file = demand.attachments.find(
                (item) => item.id === attachmentId && item.status === 'READY'
              )
              return file
                ? {
                    kind: 'file',
                    attachmentId: file.id,
                    name: file.name,
                    size: file.size,
                    mime: file.mime,
                    status: 'ready'
                  }
                : null
            }
            return {
              id: demand.id,
              requestId: demand.requestId ?? demand.id,
              version: demand.version,
              name: demand.name,
              description: demand.description,
              department: demand.department,
              submitterId: demand.ownerId,
              expectedLaunchDate: date(demand.expectedLaunchDate),
              prd: material(demand.prdUrl, demand.prdAttachmentId),
              prototype: material(demand.prototypeUrl, demand.prototypeAttachmentId),
              status: demand.status === 'APPROVED' ? 'established' : demand.status.toLowerCase(),
              reviewReason: demand.reviewReason ?? '',
              reviewedBy: demand.reviewedBy ?? undefined,
              reviewedAt: demand.reviewedAt?.toISOString(),
              submittedAt: demand.submittedAt?.toISOString() ?? ''
            }
          }),
          projects: projects.map((project) => ({
            id: project.id,
            requestId: project.requestId ?? project.id,
            version: project.version,
            demandId: project.demandId,
            source: project.source,
            name: project.name,
            department: project.department,
            priority: project.priority,
            primaryOwnerId: project.primaryOwnerId,
            collaboratorIds: project.members.map((item) => item.userId),
            stage: project.stage,
            simpleStatus: project.simpleStatus,
            overallProgress: project.overallProgress,
            stageExpectedDate: date(project.stageExpectedDate),
            originalLaunchDate: date(project.originalLaunchDate),
            expectedLaunchDate: date(project.currentLaunchDate),
            originalDeliveryDate: date(project.originalDeliveryDate),
            expectedDeliveryDate: date(project.currentDeliveryDate),
            status: project.status.toLowerCase(),
            archived: project.archived,
            risks: project.risks,
            riskVersion: project.riskVersion,
            blocker: project.blocker,
            createdAt: project.createdAt.toISOString(),
            updatedAt: project.updatedAt.toISOString(),
            lastOverallUpdatedAt: project.lastOverallUpdatedAt.toISOString()
          })),
          stageHistories: projects.flatMap((project) =>
            project.stageHistories
              .filter((item) => item.enteredAt)
              .map((item) => ({
                projectId: project.id,
                stage: item.stage,
                startedAt: item.enteredAt!.toISOString(),
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
