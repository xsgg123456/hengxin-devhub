import type { Prisma, User } from '../generated/prisma/client.js'
import type { Actor } from '../plugins/auth.js'
import { assertManager } from './business-command.js'
import { AppError } from './errors.js'

export function canApproveProjects(user: Pick<User, 'active' | 'role' | 'dingUserId'>, employeeId: string) {
  return !!employeeId && user.active && user.role === 'MANAGER' && user.dingUserId === employeeId
}

export async function assertProjectApprover(db: Pick<Prisma.TransactionClient, 'user'>, actor: Actor, employeeId: string) {
  assertManager(actor)
  const user = employeeId ? await db.user.findUnique({ where: { id: actor.id } }) : null
  if (!user || !canApproveProjects(user, employeeId))
    throw new AppError(403, 'PROJECT_APPROVER_REQUIRED', '仅指定的立项审批人可以执行此操作')
}

export async function projectApproverRecipients(db: Pick<Prisma.TransactionClient, 'user'>, employeeId: string) {
  if (!employeeId) return []
  const users = await db.user.findMany({ where: { active: true, role: 'MANAGER', dingUserId: employeeId }, select: { id: true } })
  return users.map(user => user.id)
}
