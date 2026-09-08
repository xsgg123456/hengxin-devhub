import type { Prisma, PrismaClient } from '../../generated/prisma/client.js'
import type { Actor } from '../../plugins/auth.js'
import { AppError } from '../../lib/errors.js'
import { assertManager, command } from '../../lib/business-command.js'
import { projectSchema, type ProjectInput } from './project-schemas.js'
import { lifecycleEvent } from '../notifications/lifecycle-event-service.js'

export async function createProject(tx: Prisma.TransactionClient, input: ProjectInput, demandId?: string) {
  const ids = [input.primaryOwnerId, ...input.collaboratorIds]
  if (new Set(ids).size !== ids.length) throw new AppError(400, 'INVALID_MEMBERS', '主负责人与协作人员不能重复')
  const users = await tx.user.count({ where: { id: { in: ids }, department: '信息技术部', active: true } })
  if (users !== ids.length) throw new AppError(400, 'INVALID_MEMBERS', '主负责人与协作人员必须是有效 IT 用户')
  const now = new Date()
  return tx.project.create({ data: {
    requestId: input.requestId, name: input.name, department: input.department,
    demandId, source: demandId ? 'demand' : 'direct', priority: input.priority,
    primaryOwnerId: input.primaryOwnerId, stage: '方案设计', simpleStatus: 'not-started',
    originalLaunchDate: new Date(input.originalLaunchDate), currentLaunchDate: new Date(input.originalLaunchDate),
    originalDeliveryDate: new Date(input.originalDeliveryDate), currentDeliveryDate: new Date(input.originalDeliveryDate),
    stageExpectedDate: input.stageExpectedDate ? new Date(input.stageExpectedDate) : null,
    lastOverallUpdatedAt: now,
    members: { create: input.collaboratorIds.map(userId => ({ userId })) },
    stageHistories: { create: ['需求受理', '立项评审', '方案设计', '开发编码', '联调测试', '上线部署', '验收交付'].map((stage, index) => ({
      stage, status: index < 2 ? 'completed' : index === 2 ? 'current' : 'future',
      enteredAt: index < 3 ? now : null, completedAt: index < 2 ? now : null,
      progress: index < 2 ? 100 : 0,
      expectedDate: index === 2 && input.stageExpectedDate ? new Date(input.stageExpectedDate) : null
    })) }
  } })
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
      return { id: project.id, version: project.version, stage: project.stage }
    })
  }
}
