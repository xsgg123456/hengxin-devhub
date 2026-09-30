import type { Prisma, User } from '../generated/prisma/client.js'
import type { Actor } from '../plugins/auth.js'
import { AppError } from './errors.js'

export function canApproveProjects(user: Pick<User, 'active' | 'role' | 'dingUserId'> & { maintenanceAdmin?: boolean }, employeeId: string) {
  return user.active && (user.maintenanceAdmin === true ||
    (user.role === 'MANAGER' && !!employeeId && user.dingUserId === employeeId))
}

export async function assertProjectApprover(db: Pick<Prisma.TransactionClient, 'user'>, actor: Actor, employeeId: string) {
  const user = await db.user.findUnique({ where: { id: actor.id } })
  if (!user || !canApproveProjects(user, employeeId))
    throw new AppError(403, 'PROJECT_APPROVER_REQUIRED', '仅指定的立项审批人可以执行此操作')
}

export async function projectApproverRecipients(db: Pick<Prisma.TransactionClient, 'user'>, employeeId: string) {
  const users = await db.user.findMany({ where: { active: true, OR: [
    { maintenanceAdmin: true }, ...(employeeId ? [{ role: 'MANAGER' as const, dingUserId: employeeId }] : [])
  ] }, select: { id: true } })
  return users.map(user => user.id)
}
