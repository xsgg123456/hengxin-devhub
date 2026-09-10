import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.js'
import { parseEnv } from '../../config/env.js'
import { createPrisma } from '../../plugins/prisma.js'
import type { DemandStatus, ProjectStatus } from '../../generated/prisma/client.js'
const env = parseEnv(process.env)
if (env.NODE_ENV !== 'test' || !env.S3_BUCKET.startsWith('itpc-test-') ||
  !new URL(env.DATABASE_URL).searchParams.get('schema')?.startsWith('itpc_test_')) throw new Error('必须由隔离集成入口运行')
const db = createPrisma(env.DATABASE_URL)
const business = 'user-business-li', manager = 'user-manager-chen', engineer = 'user-engineer-wang'
const cookies: Record<string, string> = {}
let runtime: Awaited<ReturnType<typeof buildApp>>
beforeAll(async () => {
  runtime = await buildApp(env, { logging: false }); await runtime.app.ready()
  for (const userId of [business, manager, engineer]) {
    const response = await runtime.app.inject({ method: 'POST', url: '/api/auth/dev-login',
      headers: { origin: env.WEB_ORIGIN }, payload: { userId } })
    expect(response.statusCode).toBe(200)
    cookies[userId] = response.cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ')
  }
})
afterAll(async () => { await runtime?.app.close(); await db.$disconnect() })
function remove(id: string, entity: 'demand' | 'project', actor = business, version = 1, requestId = randomUUID()) {
  return runtime.app.inject({ method: entity === 'demand' ? 'DELETE' : 'POST',
    url: entity === 'demand' ? `/api/demands/${id}` : `/api/projects/${id}/action`,
    headers: { cookie: cookies[actor], origin: env.WEB_ORIGIN },
    payload: { version, requestId, ...(entity === 'project' ? { action: 'delete' } : {}) } })
}
async function demand(status: DemandStatus = 'APPROVED', ownerId = business) {
  return db.demand.create({ data: { name: '全状态删除需求', ownerId, status } })
}
async function group(status: ProjectStatus = 'ACTIVE', archived = false) {
  const source = await demand()
  const project = await db.project.create({ data: { name: '整组删除项目', demandId: source.id,
    primaryOwnerId: engineer, status, archived, riskVersion: 1, risks: ['延期'], members: { create: { userId: 'user-engineer-zhao' } },
    progressUpdates: { create: { authorId: engineer, kind: 'overall', stage: '开发编码', status: 'in-progress', summary: '保留进展' } },
    stageHistories: { create: { stage: '开发编码', status: 'in-progress' } },
    riskSnapshots: { create: { version: 1, risks: ['延期'] } },
    scheduleChanges: { create: { authorId: engineer, field: 'launch', oldValue: '2099-01-01', newValue: '2099-02-01', reason: '技术问题', description: '验证' } } } })
  const attachment = await db.attachment.create({ data: { demandId: source.id, uploaderId: business,
    kind: 'PRD', name: '任意附件.zip', mime: 'application/zip', size: 10, objectKey: `deletion-${randomUUID()}`,
    status: 'READY', expiresAt: new Date(Date.now() + 60_000) } })
  const notification = await db.notificationOutbox.create({ data: { recipientId: business, eventType: 'DEMAND_APPROVED',
    demandId: source.id, projectId: project.id, idempotencyKey: randomUUID(), payload: {} } })
  return { source, project, attachment, notification }
}
describe('全状态整组删除', () => {
  it.each(['DRAFT', 'PENDING', 'RETURNED', 'REJECTED', 'APPROVED', 'WITHDRAWN'] as const)('本人可删除%s需求，经理也可删他人', async status => {
    const own = await demand(status)
    expect((await remove(own.id, 'demand')).statusCode).toBe(200)
    const another = await demand(status, engineer)
    expect((await remove(another.id, 'demand', manager)).statusCode).toBe(200)
  })
  it.each(['ACTIVE', 'COMPLETED', 'CANCELLED'] as const)('本人删除%s归档项目清空组、附件清理入队且通知终止', async status => {
    const { source, project, attachment, notification } = await group(status, true)
    expect((await remove(project.id, 'project')).statusCode).toBe(200)
    expect(await db.demand.findUnique({ where: { id: source.id } })).toBeNull()
    expect(await db.project.findUnique({ where: { id: project.id } })).toBeNull()
    const where = { projectId: project.id }
    expect(await Promise.all([db.progressUpdate.count({ where }), db.stageHistory.count({ where }),
      db.scheduleChange.count({ where }), db.projectMember.count({ where }), db.riskSnapshot.count({ where })])).toEqual([0, 0, 0, 0, 0])
    expect(await db.attachment.count({ where: { demandId: source.id } })).toBe(0)
    expect(await db.objectDeletion.count({ where: { objectKey: { in: [`staging/${attachment.id}`, `attachments/${attachment.id}`] } } })).toBe(2)
    expect(await db.notificationOutbox.findUnique({ where: { id: notification.id } })).toMatchObject({ projectId: null, demandId: null, status: 'FAILED' })
    expect(await db.notificationLog.findUnique({ where: { outboxId: notification.id } })).toMatchObject({ state: 'SKIPPED' })
    expect(await db.auditLog.count({ where: { actorId: business, entityId: { in: [source.id, project.id] }, action: 'delete' } })).toBe(2)
  })
  it('主责工程师及跨账号业务人员都拒绝；旧版本不误删', async () => {
    const { source, project } = await group()
    expect((await remove(project.id, 'project', engineer)).statusCode).toBe(403)
    expect((await remove(source.id, 'demand', engineer)).statusCode).toBe(403)
    const other = await demand('PENDING', engineer)
    expect((await remove(other.id, 'demand')).statusCode).toBe(403)
    expect((await remove(source.id, 'demand', business, 99)).statusCode).toBe(409)
    expect((await remove(project.id, 'project', business, 99)).statusCode).toBe(409)
    expect(await db.project.count({ where: { id: project.id } })).toBe(1)
  })
  it('删除需求同时删项目；并发同key幂等，不同key仅一次成功且其他项目不变', async () => {
    const { source, project } = await group()
    const other = await group()
    const requestId = randomUUID()
    const results = await Promise.all([remove(source.id, 'demand', manager, 1, requestId), remove(source.id, 'demand', manager, 1, requestId)])
    expect(results.map(row => row.statusCode)).toEqual([200, 200])
    expect(await db.project.findUnique({ where: { id: project.id } })).toBeNull()
    expect(await db.project.count({ where: { id: other.project.id } })).toBe(1)
    const races = await Promise.all([remove(other.project.id, 'project'), remove(other.source.id, 'demand')])
    expect(races.map(row => row.statusCode).sort()).toEqual([200, 404])
    expect(await db.auditLog.count({ where: { entityId: other.source.id, action: 'delete' } })).toBe(1)
  })
  it('直接项目仅管理人员可删除', async () => {
    const project = await db.project.create({ data: { name: '直接创建', primaryOwnerId: engineer, archived: true } })
    expect((await remove(project.id, 'project')).statusCode).toBe(403)
    expect((await remove(project.id, 'project', engineer)).statusCode).toBe(403)
    expect((await remove(project.id, 'project', manager)).statusCode).toBe(200)
  })
  it('待发送摘要仅移除删除项目，已发送通知保留状态和独立记录', async () => {
    const target = await group(), other = await group()
    const digest = await db.notificationOutbox.create({ data: { recipientId: manager, eventType: 'MANAGER_RISK_DIGEST',
      idempotencyKey: randomUUID(), payload: { projects: [{ projectId: target.project.id }, { projectId: other.project.id }] } } })
    const sent = await db.notificationOutbox.create({ data: { recipientId: business, eventType: 'DEMAND_APPROVED',
      demandId: target.source.id, projectId: target.project.id, idempotencyKey: randomUUID(), payload: {}, status: 'SENT',
      deliveryLog: { create: { state: 'SENT' } } } })
    expect((await remove(target.project.id, 'project')).statusCode).toBe(200)
    expect((await db.notificationOutbox.findUniqueOrThrow({ where: { id: digest.id } })).payload)
      .toEqual({ projects: [{ projectId: other.project.id }] })
    expect(await db.notificationOutbox.findUnique({ where: { id: sent.id } }))
      .toMatchObject({ status: 'SENT', demandId: null, projectId: null })
    expect(await db.notificationLog.findUnique({ where: { outboxId: sent.id } })).toMatchObject({ state: 'SENT' })
    expect((await remove(other.project.id, 'project')).statusCode).toBe(200)
    expect(await db.notificationLog.findUnique({ where: { outboxId: digest.id } })).toMatchObject({ state: 'SKIPPED' })
  })
})
