import type { Prisma } from '../../generated/prisma/client.js'

// Called under the shared manager-grants transaction lock, after a verified snapshot is saved.
export async function bootstrapAdmin(tx: Prisma.TransactionClient, dingUserId?: string) {
  const key = 'dingtalk.bootstrap-admin'
  if (!dingUserId || await tx.systemSetting.findUnique({ where: { key } })) return false
  const user = await tx.user.findUnique({ where: { dingUserId }, include: { managerGrant: true } })
  if (!user?.active || !user.dingUnionId) return false
  // An existing roster (including a revoked grant) is authoritative; never silently regrant.
  const existing = await tx.managerGrant.count({where:{user:{dingUnionId:{not:null}}}})
  if (existing === 0) {
    await tx.managerGrant.create({ data: { userId: user.id } })
    await tx.user.update({ where: { id: user.id }, data: { role: 'MANAGER' } })
    await tx.auditLog.create({ data: {
      action: 'bootstrap', entityType: 'manager_grant', entityId: user.id,
      payload: { dingUserId }
    } })
  }
  await tx.systemSetting.create({ data: { key, value: { userId: user.id, initialized: existing === 0 } } })
  return existing === 0
}
