import { isEngineerEligible } from '../../lib/it-department.js'
import { refreshProjectRisks } from '../risks/risk-scan-job.js'
import type { Prisma, PrismaClient } from '../../generated/prisma/client.js'
import { assertProjectApprover } from '../../lib/project-approver.js'
import type { Actor } from '../../plugins/auth.js'
import { AppError } from '../../lib/errors.js'
import { command } from '../../lib/business-command.js'
import { projectSchema, type ProjectInput } from './project-schemas.js'
import { saveProposal } from './proposal-service.js'

export async function createProject(tx: Prisma.TransactionClient, input: ProjectInput, demandId?: string) {
  await validateProjectMembers(tx, input)
  const demand = demandId ? await tx.demand.findUnique({ where: { id: demandId }, include: { owner: true } }) : null
  if (demand?.parentProjectId) {
    await tx.$queryRaw`SELECT id FROM projects WHERE id = ${demand.parentProjectId} FOR SHARE`
    const parent = await tx.project.findUnique({ where: { id: demand.parentProjectId } })
    if (!parent || parent.status !== 'COMPLETED' || parent.parentProjectId)
      throw new AppError(400, 'INVALID_PARENT_PROJECT', '只能为已完成的主项目接单优化')
  }
  const acceptanceOwnerId = demand?.owner.active ? demand.ownerId : null
  const now = new Date()
  const project = await tx.project.create({ data: {
    requestId: input.requestId, name: input.name, department: input.department,
    firstRequestedOn: demand?.firstRequestedOn ?? null, businessOwnerId: demand?.ownerId ?? null,
    description: demand?.description ?? '', parentProjectId: demand?.parentProjectId ?? null,
    approvedLaunchDate: new Date(input.approvedLaunchDate),
    acceptanceOwnerId, demandId, source: demandId ? 'demand' : 'direct', priority: input.priority,
    primaryOwnerId: input.primaryOwnerId, stage: demand?.parentProjectId ? '验收交付' : '方案设计', simpleStatus: 'not-started',
    lastOverallUpdatedAt: now,
    members: { create: input.collaboratorIds.map(userId => ({ userId })) },
    stageHistories: { create: (demand?.parentProjectId ? ['需求受理', '立项评审', '验收交付'] : ['需求受理', '立项评审', '方案设计', '开发编码', '联调测试', '上线部署', '验收交付']).map((stage, index) => ({
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
  constructor(private readonly db: PrismaClient, private readonly approverId = '') {}
  async create(actor: Actor, body: unknown) {
    await assertProjectApprover(this.db, actor, this.approverId)
    const input = projectSchema.parse(body)
    return command(this.db, actor, input.requestId, { operation: 'create-project', input }, async tx => {
      await assertProjectApprover(tx, actor, this.approverId)
      return saveProposal(tx, actor, input)
    })
  }
}

export async function validateProjectMembers(tx: Prisma.TransactionClient, input: Pick<ProjectInput, 'primaryOwnerId' | 'collaboratorIds'>) {
  const ids = [input.primaryOwnerId, ...input.collaboratorIds]
  if (new Set(ids).size !== ids.length) throw new AppError(400, 'INVALID_MEMBERS', '主负责人与协作人员不能重复')
  const users = await tx.user.findMany({ where: { id: { in: ids }, active: true } })
  if (users.length !== ids.length || users.some(user => !isEngineerEligible(user)))
    throw new AppError(400, 'INVALID_MEMBERS', '主负责人与协作人员必须具有有效工程师资格')
}
