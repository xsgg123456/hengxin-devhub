import type { PrismaClient } from '../../generated/prisma/client.js'
import { AppError } from '../../lib/errors.js'
import { directoryRole } from '../../lib/it-department.js'

/** Explicit personnel correction; never inferred from a display name or a manager grant. */
export async function setEngineerOverride(db: PrismaClient, input: {
  userId: string; dingUserId: string; actorId: string; enabled: boolean; reason: string
}) {
  if (!input.reason.trim() || !input.userId || !input.dingUserId || !input.actorId)
    throw new AppError(422, 'INVALID_OVERRIDE', '必须指定用户身份、操作管理人员和原因')
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended('dingtalk-directory', 0))::text`
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended('manager-grants', 0))::text`
    const actor = await tx.user.findUnique({ where: { id: input.actorId }, include: { managerGrant: true } })
    if (!actor?.active || actor.role !== 'MANAGER' || !actor.managerGrant?.active || !actor.dingUnionId)
      throw new AppError(403, 'FORBIDDEN', '需要有效的公司管理人员作为审计操作人')
    const user = await tx.user.findUnique({ where: { id: input.userId }, include: { managerGrant: true } })
    if (!user || user.dingUserId !== input.dingUserId || !user.dingUnionId)
      throw new AppError(422, 'IDENTITY_MISMATCH', '用户与指定钉钉身份不匹配')
    if (input.enabled && !user.active) throw new AppError(422, 'INACTIVE_MEMBER', '不能为停用成员启用资格')
    const role = directoryRole({ ...user, engineerOverride: input.enabled }, user.managerGrant?.active ?? false)
    if (user.engineerOverride === input.enabled && user.role === role)
      return { userId: user.id, enabled: input.enabled, role, changed: false }
    await tx.user.update({ where: { id: user.id }, data: { engineerOverride: input.enabled, role } })
    // Revocation also ends old sessions; existing projects and audit history remain intact.
    if (!input.enabled) await tx.session.deleteMany({ where: { userId: user.id } })
    await tx.auditLog.create({ data: {
      actorId: actor.id, action: input.enabled ? 'grant' : 'revoke', entityType: 'engineer_override', entityId: user.id,
      payload: { reason: input.reason.trim(), dingUserId: input.dingUserId,
        old: { enabled: user.engineerOverride, role: user.role }, new: { enabled: input.enabled, role } }
    } })
    return { userId: user.id, enabled: input.enabled, role, changed: true }
  })
}
