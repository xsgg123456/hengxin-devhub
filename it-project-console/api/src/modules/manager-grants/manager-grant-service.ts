import type { PrismaClient } from '../../generated/prisma/client.js'
import type { Actor } from '../../plugins/auth.js'
import { assertActive, assertManager, command } from '../../lib/business-command.js'
import { AppError } from '../../lib/errors.js'

export class ManagerGrantService {
  constructor(private readonly db: PrismaClient) {}

  async list(actor: Actor) {
    assertActive(actor)
    const grants = await this.db.managerGrant.findMany({
      where: { active: true },
      include: { user: true, grantedBy: true },
      orderBy: { createdAt: 'asc' }
    })
    return grants.map((grant) => ({
      id: grant.userId,
      name: grant.user.name,
      department: grant.user.department,
      dingUserId: grant.user.dingUserId,
      active: grant.user.active,
      authorName: grant.grantedBy?.name ?? '初始配置',
      createdAt: grant.createdAt.toISOString()
    }))
  }

  async candidates(actor: Actor) {
    assertManager(actor)
    return this.db.user.findMany({
      where: {
        active: true,
        departmentId: { not: null },
        OR: [{ managerGrant: null }, { managerGrant: { active: false } }]
      },
      select: { id: true, name: true, department: true },
      orderBy: { name: 'asc' }
    })
  }

  async set(actor: Actor, input: { userId: string; enabled: boolean; requestId: string }) {
    assertActive(actor)
    return command(
      this.db,
      actor,
      input.requestId,
      { action: 'manager-grant', ...input },
      async (tx) => {
        // Every roster mutation uses one lock: concurrent removals cannot both observe two managers.
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended('manager-grants', 0))::text`
        const current = await tx.user.findUnique({
          where: { id: actor.id },
          include: { managerGrant: true }
        })
        if (!current?.active || current.role !== 'MANAGER' || !current.managerGrant?.active)
          throw new AppError(403, 'FORBIDDEN', '需要有效管理人员权限')
        const user = await tx.user.findUnique({
          where: { id: input.userId },
          include: { departmentRecord: true, managerGrant: true }
        })
        if (!user || (input.enabled && (!user.active || !user.departmentRecord)))
          throw new AppError(422, 'INVALID_MEMBER', '请选择有效的公司组织成员')
        const oldEnabled = user.managerGrant?.active ?? false
        if (oldEnabled === input.enabled)
          throw new AppError(409, 'GRANT_CONFLICT', '名单已更新，请刷新后重试')
        if (!input.enabled && user.active) {
          const count = await tx.managerGrant.count({
            where: { active: true, user: { active: true } }
          })
          if (count <= 1) throw new AppError(409, 'LAST_MANAGER', '至少保留一名有效管理人员')
        }
        const role = input.enabled
          ? 'MANAGER'
          : user.departmentRecord?.name === '信息技术部'
            ? 'ENGINEER'
            : 'BUSINESS'
        await tx.managerGrant.upsert({
          where: { userId: user.id },
          create: { userId: user.id, grantedById: actor.id, active: input.enabled },
          update: {
            active: input.enabled,
            ...(input.enabled ? { grantedById: actor.id, createdAt: new Date() } : {})
          }
        })
        await tx.user.update({ where: { id: user.id }, data: { role } })
        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            action: input.enabled ? 'grant' : 'revoke',
            entityType: 'manager_grant',
            entityId: user.id,
            payload: {
              old: { enabled: oldEnabled, role: user.role },
              new: { enabled: input.enabled, role }
            }
          }
        })
        return { userId: user.id, enabled: input.enabled, role }
      }
    )
  }
}
