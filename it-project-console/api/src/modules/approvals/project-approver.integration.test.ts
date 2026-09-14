import { randomUUID, randomBytes, createHash } from 'node:crypto'
import { beforeAll, afterAll, expect, it } from 'vitest'
import { buildApp } from '../../app.js'
import { parseEnv } from '../../config/env.js'
import { createPrisma } from '../../plugins/prisma.js'
import { NotificationService } from '../notifications/notification-service.js'

const base = parseEnv(process.env)
if (base.NODE_ENV !== 'test' || !new URL(base.DATABASE_URL).searchParams.get('schema')?.startsWith('itpc_test_') || !base.S3_BUCKET.startsWith('itpc-test-')) throw new Error('必须通过隔离入口')
const db = createPrisma(base.DATABASE_URL)
const approver = randomUUID(), other = randomUUID(), employee = randomUUID()
const env = { ...base, PROJECT_APPROVER_DING_USER_ID: employee }
let runtime: Awaited<ReturnType<typeof buildApp>>
const cookies: Record<string, string> = {}
const owner = 'user-engineer-wang'
const input = () => ({ requestId: randomUUID(), name: '审批边界回归', department: 'IT部', primaryOwnerId: owner, collaboratorIds: [], priority: 'P1', approvedLaunchDate: '2099-10-08' })
function call(path: string, payload?: Record<string, unknown>, user: string = approver) {
  return runtime.app.inject({ method: payload ? 'POST' : 'GET', url: path, payload, headers: { cookie: cookies[user] ?? '', origin: env.WEB_ORIGIN } })
}
beforeAll(async () => {
  await db.user.createMany({ data: [
    { id: approver, name: '审批人同名测试', department: 'IT部', role: 'MANAGER', dingUserId: employee },
    { id: other, name: '审批人同名测试', department: 'IT部', role: 'MANAGER', dingUserId: randomUUID() }
  ] })
  runtime = await buildApp(env, { logging: false }); await runtime.app.ready()
  for (const userId of [approver, other, owner]) {
    const token = randomBytes(32).toString('hex')
    await db.session.create({ data: { userId, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 3600000) } })
    cookies[userId] = `itpc_session=${token}`
  }
})
afterAll(async () => { await runtime?.app.close(); await db.$disconnect() })

it('能力由员工绑定决定；同名管理员保留查看/管理接口，不得直接创建或重提', async () => {
  expect((await call('/api/me')).json().data.canApproveProjects).toBe(true)
  expect((await call('/api/me', undefined, other)).json().data.canApproveProjects).toBe(false)
  const ws = await call('/api/workspace', undefined, other)
  expect(ws.statusCode).toBe(200)
  expect(ws.json().data.database.users.find((u: { id: string }) => u.id === approver).canApproveProjects).toBe(true)
  expect((await call('/api/admin/settings', undefined, other)).statusCode).toBe(200)
  const body = input()
  const created = await call('/api/projects', body)
  expect(created.statusCode, created.body).toBe(200)
  const id = created.json().data.id
  for (const user of [other, owner]) {
    expect((await call('/api/projects', input(), user)).statusCode).toBe(403)
    const result = await call(`/api/project-proposals/${id}/resubmit`, { ...input(), version: 1 }, user)
    expect(result.statusCode).toBe(403)
  }
  const resubmitted = await call(`/api/project-proposals/${id}/resubmit`, { ...input(), version: 1 })
  expect(resubmitted.statusCode, resubmitted.body).toBe(200)
  expect((await db.projectProposal.findUniqueOrThrow({ where: { id } })).version).toBe(2)
})

it.each(['approve', 'return', 'reject'] as const)('审批 %s 仅指定人员可执行，拒绝不写入', async decision => {
  const attachmentId = randomUUID()
  const demand = await db.demand.create({ data: { name: '材料齐全的权限验证', description: '验证', ownerId: owner, status: 'PENDING', expectedLaunchDate: new Date('2099-10-08'), attachmentIds: [attachmentId],
    attachments: { create: { id: attachmentId, uploaderId: owner, kind: 'FILE', name: '需求.txt', mime: 'text/plain', size: 5, objectKey: randomUUID(), status: 'READY', expiresAt: new Date('2099-10-08') } } } })
  const { name: _name, department: _department, ...projectFields } = input()
  const body = { ...projectFields, version: 1, decision }
  // Review schema accepts project fields only for approval.
  const payload = decision === 'approve' ? body : { requestId: randomUUID(), version: 1, decision, reason: '审核意见' }
  for (const user of [other, owner]) expect((await call(`/api/demands/${demand.id}/review`, payload, user)).statusCode).toBe(403)
  expect((await db.demand.findUniqueOrThrow({ where: { id: demand.id } })).version).toBe(1)
  const result = await call(`/api/demands/${demand.id}/review`, payload)
  expect(result.statusCode, result.body).toBe(200)
})

it('失效/降级/员工解绑即失权，缺配置不回退；幂等重放也校验', async () => {
  const body = input()
  expect((await call('/api/projects', body)).statusCode).toBe(200)
  for (const data of [{ role: 'ENGINEER' as const }, { dingUserId: null }, { active: false }]) {
    await db.user.update({ where: { id: approver }, data })
    try { expect([401, 403]).toContain((await call('/api/projects', body)).statusCode) }
    finally { await db.user.update({ where: { id: approver }, data: { role: 'MANAGER', active: true, dingUserId: employee } }) }
  }
  const closed = await buildApp({ ...env, PROJECT_APPROVER_DING_USER_ID: '' }, { logging: false })
  try {
    const result = await closed.app.inject({ method: 'POST', url: '/api/projects', payload: input(), headers: { cookie: cookies[approver], origin: env.WEB_ORIGIN } })
    expect(result.statusCode).toBe(403)
  } finally { await closed.app.close() }
})

it('工程师退回仅通知指定审批人；旧管理员待发消息跳过，指定人员可重提', async () => {
  const created = await call('/api/projects', input())
  const id = created.json().data.id
  const returned = await call(`/api/project-proposals/${id}/confirm`, { requestId: randomUUID(), version: 1, decision: 'return', reason: '需要重新评估' }, owner)
  expect(returned.statusCode, returned.body).toBe(200)
  const messages = await db.notificationOutbox.findMany({ where: { eventType: 'PROPOSAL_RETURNED', payload: { path: ['proposalId'], equals: id } } })
  expect(messages.map(m => m.recipientId)).toEqual([approver])
  const legacy = await db.notificationOutbox.create({ data: { eventType: 'PROPOSAL_RETURNED', recipientId: other, idempotencyKey: randomUUID(), payload: { proposalId: id }, availableAt: new Date(0) } })
  const sent: string[] = []
  const client = { legacy: async (_path: string, body: Record<string, unknown>) => { sent.push(String(body.userid_list)); return { errcode: 0, task_id: 1 } } }
  const otherUser = await db.user.findUniqueOrThrow({ where: { id: other } })
  const service = new NotificationService(db, client, { enabled: true, agentId: '123', webOrigin: env.WEB_ORIGIN, projectApproverDingUserId: employee, recipientUserIds: [otherUser.dingUserId!] })
  await service.flush(new Date('2099-10-09T00:00:00Z'))
  expect(sent).toEqual([])
  expect((await db.notificationLog.findUniqueOrThrow({ where: { outboxId: legacy.id } })).state).toBe('SKIPPED')
  const result = await call(`/api/project-proposals/${id}/resubmit`, { ...input(), version: 2 })
  expect(result.statusCode, result.body).toBe(200)
})
