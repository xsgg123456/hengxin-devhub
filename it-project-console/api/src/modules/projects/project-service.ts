import { isEngineerEligible } from '../../lib/it-department.js'
import { refreshProjectRisks } from '../risks/risk-scan-job.js'
import type { Prisma, PrismaClient } from '../../generated/prisma/client.js'
import type { Actor } from '../../plugins/auth.js'
import { AppError } from '../../lib/errors.js'
import { assertManager, command } from '../../lib/business-command.js'
import { projectSchema, type ProjectInput } from './project-schemas.js'
import { lifecycleEvent } from '../notifications/lifecycle-event-service.js'

export async function createProject(tx: Prisma.TransactionClient, input: ProjectInput, demandId?: string) {
  const ids = [input.primaryOwnerId, ...input.collaboratorIds]
  if (new Set(ids).size !== ids.length) throw new AppError(400, 'INVALID_MEMBERS', '主负责人与协作人员不能重复')
  const users = await tx.user.findMany({ where: { id: { in: ids }, active: true } })
  if (users.length !== ids.length || users.some(user => !isEngineerEligible(user)))
    throw new AppError(400, 'INVALID_MEMBERS', '主负责人与协作人员必须具有有效工程师资格')
  const now = new Date()
  const project = await tx.project.create({ data: {
    requestId: input.requestId, name: input.name, department: input.department,
    demandId, source: demandId ? 'demand' : 'direct', priority: input.priority,
    primaryOwnerId: input.primaryOwnerId, stage: '方案设计', simpleStatus: 'not-started',
    lastOverallUpdatedAt: now,
    members: { create: input.collaboratorIds.map(userId => ({ userId })) },
    stageHistories: { create: ['需求受理', '立项评审', '方案设计', '开发编码', '联调测试', '上线部署', '验收交付'].map((stage, index) => ({
      stage, status: index < 2 ? 'completed' : index === 2 ? 'current' : 'future',
      enteredAt: index < 3 ? now : null, completedAt: index < 2 ? now : null,
      progress: index < 2 ? 100 : 0,
      expectedDate: null
    })) }
  } })
  await refreshProjectRisks(tx, project.id, now)
  return project
}
export class ProjectService {
  constructor(private readonly db: PrismaClient) {}
  async create(actor: Actor, body: unknown) {
    assertManager(actor)
    const input = projectSchema.parse(body)
    return command(this.db, actor, input.requestId, { operation: 'create-project', input }, async tx => {
      const project = await createProject(tx, input)
      await lifecycleEvent(tx, { eventType: 'PROJECT_ASSIGNED', requestId: `${actor.id}:${input.requestId}`,
        projectId: project.id, recipientIds: [input.primaryOwnerId, ...input.collaboratorIds] })
      return { id: project.id, code: project.code, version: project.version, stage: project.stage }
    })
  }
}
