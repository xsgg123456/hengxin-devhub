import { hasManagementPermissions } from '../lib/management-permissions.js'
import { canApproveProjects } from '../lib/project-approver.js'
import { createHash, randomBytes } from 'node:crypto'
import type { FastifyRequest, FastifyReply } from 'fastify'
import type { PrismaClient } from '../generated/prisma/client.js'
import type { Env } from '../config/env.js'
import { AppError } from '../lib/errors.js'

export type Actor = {
  id: string
  name: string
  department: string
  role: 'MANAGER' | 'ENGINEER' | 'BUSINESS'
  maintenanceAdmin?: boolean
  canApproveProjects?: boolean
  active: boolean
}
declare module 'fastify' {
  interface FastifyRequest {
    actor: Actor | null
  }
}
const hash = (token: string) => createHash('sha256').update(token).digest('hex')
export const sessionCookie = 'itpc_session'
export function authService(db: PrismaClient, env: Env) {
  async function authenticate(request: FastifyRequest) {
    const token = request.cookies[sessionCookie]
    if (!token || !/^[a-f0-9]{64}$/.test(token))
      throw new AppError(401, 'UNAUTHENTICATED', '请先登录')
    const session = await db.session.findUnique({
      where: { tokenHash: hash(token) },
      include: { user: true }
    })
    if (!session || session.expiresAt <= new Date() || !session.user.active)
      throw new AppError(401, 'SESSION_EXPIRED', '登录已过期，请重新登录')
    const { id, name, department, role, active, maintenanceAdmin } = session.user
    request.actor = { id, name, department, role, active, maintenanceAdmin, canApproveProjects: canApproveProjects(session.user, env.PROJECT_APPROVER_DING_USER_ID) }
  }
  async function login(userId: string, request: FastifyRequest, reply: FastifyReply) {
    const user = await db.user.findUnique({ where: { id: userId } })
    if (!user?.active) throw new AppError(403, 'ACCOUNT_DISABLED', '账号不可用')
    const token = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + env.SESSION_HOURS * 3600000)
    await db.$transaction(async (tx) => {
      const previous = request.cookies[sessionCookie]
      if (previous) await tx.session.deleteMany({ where: { tokenHash: hash(previous) } })
      await tx.session.create({
        data: { userId, tokenHash: hash(token), expiresAt }
      })
    })
    reply.setCookie(sessionCookie, token, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      expires: expiresAt
    })
    return {
      canApproveProjects: canApproveProjects(user, env.PROJECT_APPROVER_DING_USER_ID),
      id: user.id,
      name: user.name,
      department: user.department,
      maintenanceAdmin: user.maintenanceAdmin,
      role: user.role
    }
  }
  async function logout(request: FastifyRequest, reply: FastifyReply) {
    const token = request.cookies[sessionCookie]
    if (token) await db.session.deleteMany({ where: { tokenHash: hash(token) } })
    reply.clearCookie(sessionCookie, {
      path: '/',
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax'
    })
  }
  return { authenticate, login, logout }
}
export async function requireManager(request: FastifyRequest) {
  if (!hasManagementPermissions(request.actor)) throw new AppError(403, 'FORBIDDEN', '需要管理人员权限')
}
export function assertProjectWrite(
  actor: Actor,
  project: { primaryOwnerId: string; archived: boolean; status: string },
  collaborators: string[],
  overall = true
) {
  if (!actor.active || project.archived || project.status !== 'ACTIVE')
    throw new AppError(403, 'READ_ONLY', '项目当前只读')
  if (hasManagementPermissions(actor)) return
  if (
    actor.role === 'ENGINEER' &&
    (project.primaryOwnerId === actor.id || (!overall && collaborators.includes(actor.id)))
  )
    return
  throw new AppError(403, 'FORBIDDEN', '没有该项目的维护权限')
}
