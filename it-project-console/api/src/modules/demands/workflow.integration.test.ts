import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
type HTTPMethods = 'POST' | 'PATCH' | 'DELETE' | 'GET'
import { buildApp } from '../../app.js'
import { parseEnv } from '../../config/env.js'
import { createPrisma } from '../../plugins/prisma.js'

const env = parseEnv(process.env)
if (env.NODE_ENV !== 'test' || !env.S3_BUCKET.startsWith('itpc-test-') ||
  !new URL(env.DATABASE_URL).searchParams.get('schema')?.startsWith('itpc_test_'))
  throw new Error('必须由隔离集成测试入口运行')
const db = createPrisma(env.DATABASE_URL)
let runtime: Awaited<ReturnType<typeof buildApp>>
const cookies: Record<string, string> = {}
const business = 'user-business-li', manager = 'user-manager-chen', engineer = 'user-engineer-wang'
const key = () => randomUUID()
const valid = () => ({ requestId: key(), name: '集成需求', description: '真实需求说明',
  expectedLaunchDate: '2099-12-31', prd: { kind: 'link', url: 'https://example.com/prd' },
  prototype: { kind: 'link', url: 'https://example.com/html' }, submit: true })
const project = () => ({ requestId: key(), name: '直接项目', department: '财务部', priority: 'P1',
  primaryOwnerId: engineer, collaboratorIds: ['user-engineer-zhao'],
  originalLaunchDate: '2099-11-01', originalDeliveryDate: '2099-12-01', stageExpectedDate: '2099-10-01' })
function call(method: HTTPMethods, url: string, payload?: Record<string, unknown>, user = business) {
  return runtime.app.inject({ method, url, payload, headers: { cookie: cookies[user], origin: env.WEB_ORIGIN } })
}
async function create() {
  const result = await call('POST', '/api/demands', valid())
  expect(result.statusCode, result.body).toBe(200)
  return result.json<{ data: { id: string; version: number } }>().data
}
async function uploadedFile(demandId: string) {
  const upload = await call('POST', '/api/attachments/upload', { demandId, kind: 'PROTOTYPE', name: 'cleanup.html', mime: 'text/html', size: 12 })
  expect(upload.statusCode, upload.body).toBe(200)
  const ticket = upload.json<{ data: { attachmentId: string; uploadUrl: string; headers: Record<string, string> } }>().data
  expect((await fetch(ticket.uploadUrl, { method: 'PUT', headers: ticket.headers, body: 'hello world!' })).status).toBe(200)
  expect((await call('POST', `/api/attachments/${ticket.attachmentId}/confirm`)).statusCode).toBe(200)
  const download = await call('GET', `/api/attachments/${ticket.attachmentId}/download`)
  return { id: ticket.attachmentId, url: download.json<{ data: { downloadUrl: string } }>().data.downloadUrl }
}
beforeAll(async () => {
  runtime = await buildApp(env, { logging: false })
  await runtime.app.ready()
  for (const userId of [business, manager, engineer]) {
    const result = await runtime.app.inject({ method: 'POST', url: '/api/auth/dev-login',
      headers: { origin: env.WEB_ORIGIN }, payload: { userId } })
    expect(result.statusCode).toBe(200)
    cookies[userId] = result.cookies.map(item => `${item.name}=${item.value}`).join('; ')
  }
})
afterAll(async () => { await runtime?.app.close(); await db.$disconnect() })

describe('真实需求与立项事务', () => {
  it('并发网络重试只创建一次，不同内容复用key拒绝', async () => {
    const input = valid()
    const responses = await Promise.all([call('POST', '/api/demands', input), call('POST', '/api/demands', input)])
    expect(responses.map(r => r.statusCode)).toEqual([200, 200])
    expect(responses[0].json()).toEqual(responses[1].json())
    expect(await db.demand.count({ where: { requestId: input.requestId } })).toBe(1)
    expect((await call('POST', '/api/demands', { ...input, name: '变化' })).statusCode).toBe(409)
  })
  it('草稿保存、提交、待审批完整性、越权、撤回、重提与删除', async () => {
    const response = await call('POST', '/api/demands', { requestId: key(), name: '', submit: false })
    expect(response.statusCode).toBe(200)
    const { id } = response.json<{ data: { id: string } }>().data
    const workspace = await call('GET', '/api/workspace')
    expect(workspace.json<{ data: { database: { demands: Array<{ id: string; submittedAt: string }> } } }>().data.database.demands.find(row => row.id === id)?.submittedAt).toBe('')
    expect((await call('PATCH', `/api/demands/${id}`, { ...valid(), version: 1 }, engineer)).statusCode).toBe(403)
    expect((await call('PATCH', `/api/demands/${id}`, { ...valid(), version: 1 })).statusCode).toBe(200)
    expect((await call('PATCH', `/api/demands/${id}`, { ...valid(), prd: null, submit: false, version: 2 })).statusCode).toBe(400)
    expect((await db.demand.findUniqueOrThrow({ where: { id } })).status).toBe('PENDING')
    expect((await call('POST', `/api/demands/${id}/withdraw`, { requestId: key(), version: 1 })).statusCode).toBe(409)
    expect((await call('POST', `/api/demands/${id}/withdraw`, { requestId: key(), version: 2 })).statusCode).toBe(200)
    expect((await call('DELETE', `/api/demands/${id}`, { requestId: key(), version: 3 })).statusCode).toBe(409)
    expect((await call('PATCH', `/api/demands/${id}`, { ...valid(), version: 3 })).statusCode).toBe(200)
    const removal = { requestId: key(), version: 4 }
    expect((await call('DELETE', `/api/demands/${id}`, removal)).statusCode).toBe(200)
    expect((await call('DELETE', `/api/demands/${id}`, removal)).statusCode).toBe(200)
    expect(await db.demand.findUnique({ where: { id } })).toBeNull()
  })
  it('提交拒绝缺材料、无效日期、非HTTPS、伪造归属', async () => {
    for (const change of [{ prd: null }, { prototype: null }, { expectedLaunchDate: '2026-02-30' },
      { expectedLaunchDate: '2000-01-01' }, { prd: { kind: 'link', url: 'http://example.com' } }, { department: '伪造部门' }])
      expect((await call('POST', '/api/demands', { ...valid(), ...change })).statusCode).toBe(400)
  })
  it('全员可读，退回和拒绝需管理权限及原因，原需求重新提交', async () => {
    const { id } = await create()
    expect((await call('GET', `/api/demands/${id}`, undefined, engineer)).statusCode).toBe(200)
    const review = { requestId: key(), version: 1, decision: 'return', reason: '请补充' }
    expect((await call('POST', `/api/demands/${id}/review`, review, engineer)).statusCode).toBe(403)
    expect((await call('POST', `/api/demands/${id}/review`, { ...review, reason: '' }, manager)).statusCode).toBe(400)
    expect((await call('POST', `/api/demands/${id}/review`, review, manager)).statusCode).toBe(200)
    const events = await db.notificationOutbox.findMany({ where: { demandId: id } })
    expect(events.map(e => [e.eventType, e.recipientId])).toEqual([['DEMAND_RETURNED', business]])
    expect((await call('PATCH', `/api/demands/${id}`, { ...valid(), version: 2 })).statusCode).toBe(200)
    expect((await call('POST', `/api/demands/${id}/review`, { requestId: key(), version: 3, decision: 'reject', reason: '不符合规划' }, manager)).statusCode).toBe(200)
    expect((await call('PATCH', `/api/demands/${id}`, { ...valid(), version: 4 })).statusCode).toBe(409)
    expect((await db.demand.findUniqueOrThrow({ where: { id } })).reviewReason).toBe('不符合规划')
  })
  it('并发审批只产生一个项目、七阶段、唯一主责及正确收件人', async () => {
    const { id } = await create()
    const { name: _name, department: _department, ...fields } = project()
    const review = { ...fields, version: 1, decision: 'approve' }
    const results = await Promise.all([call('POST', `/api/demands/${id}/review`, review, manager),
      call('POST', `/api/demands/${id}/review`, { ...review, requestId: key() }, manager)])
    expect(results.map(r => r.statusCode).sort()).toEqual([200, 409])
    const row = await db.project.findUniqueOrThrow({ where: { demandId: id }, include: { members: true, stageHistories: true } })
    expect(row).toMatchObject({ source: 'demand', primaryOwnerId: engineer, stage: '方案设计', overallProgress: 0 })
    expect(row.members.map(m => m.userId)).toEqual(['user-engineer-zhao'])
    expect(row.stageHistories).toHaveLength(7)
    expect(row.stageHistories.filter(s => s.status === 'completed')).toHaveLength(2)
    expect(row.stageHistories.filter(s => s.status === 'current')).toHaveLength(1)
    expect(row.stageHistories.filter(s => s.status === 'future')).toHaveLength(4)
    expect((await db.notificationOutbox.findMany({ where: { projectId: row.id } })).map(e => e.recipientId).sort())
      .toEqual([business, engineer, 'user-engineer-zhao'].sort())
    expect((await call('DELETE', `/api/demands/${id}`, { requestId: key(), version: 2 })).statusCode).toBe(409)
  })
  it('无效人员不落半成品，直接创建不伪造需求、日期初始化且可幂等重试', async () => {
    const count = await db.demand.count()
    expect((await call('POST', '/api/projects', project(), engineer)).statusCode).toBe(403)
    expect((await call('POST', '/api/projects', { ...project(), collaboratorIds: [engineer] }, manager)).statusCode).toBe(400)
    expect((await call('POST', '/api/projects', { ...project(), primaryOwnerId: business }, manager)).statusCode).toBe(400)
    const input = project()
    const a = await call('POST', '/api/projects', input, manager)
    expect(a.statusCode, a.body).toBe(200)
    expect((await call('POST', '/api/projects', input, manager)).json()).toEqual(a.json())
    const row = await db.project.findUniqueOrThrow({ where: { id: a.json<{ data: { id: string } }>().data.id } })
    expect(row.source).toBe('direct'); expect(row.demandId).toBeNull()
    expect(row.currentLaunchDate).toEqual(row.originalLaunchDate)
    expect(row.currentDeliveryDate).toEqual(row.originalDeliveryDate)
    expect(await db.demand.count()).toBe(count)
  })
  it('真实上传材料只能绑定对应需求并保护已立项文件', async () => {
    const { id } = await create()
    const upload = await call('POST', '/api/attachments/upload', { demandId: id, kind: 'PROTOTYPE', name: '原型.html', mime: 'text/html', size: 12 })
    expect(upload.statusCode, upload.body).toBe(200)
    const ticket = upload.json<{ data: { attachmentId: string; uploadUrl: string; headers: Record<string, string> } }>().data
    expect((await fetch(ticket.uploadUrl, { method: 'PUT', headers: ticket.headers, body: 'hello world!' })).status).toBe(200)
    expect((await call('POST', `/api/attachments/${ticket.attachmentId}/confirm`)).statusCode).toBe(200)
    const another = await create()
    const material = { kind: 'file', attachmentId: ticket.attachmentId }
    expect((await call('PATCH', `/api/demands/${another.id}`, { ...valid(), version: 1, prototype: material })).statusCode).toBe(400)
    expect((await call('PATCH', `/api/demands/${id}`, { ...valid(), version: 1, prd: material })).statusCode).toBe(400)
    expect((await call('PATCH', `/api/demands/${id}`, { ...valid(), version: 1, prototype: material })).statusCode).toBe(200)
    const { name: _name, department: _department, ...fields } = project()
    expect((await call('POST', `/api/demands/${id}/review`, { ...fields, version: 2, decision: 'approve' }, manager)).statusCode).toBe(200)
    expect((await call('DELETE', `/api/demands/${id}`, { requestId: key(), version: 3 })).statusCode).toBe(409)
    const downloaded = await call('GET', `/api/attachments/${ticket.attachmentId}/download`, undefined, engineer)
    expect(downloaded.statusCode).toBe(200)
    expect(await (await fetch(downloaded.json<{ data: { downloadUrl: string } }>().data.downloadUrl)).text()).toBe('hello world!')
  })
  it('通知写入故障会回滚审批状态、项目、阶段、成员及幂等回执', async () => {
    const { id } = await create()
    const { name: _name, department: _department, ...fields } = project()
    const input = { ...fields, version: 1, decision: 'approve' }
    await db.$executeRaw`ALTER TABLE notification_outbox ADD CONSTRAINT workflow_test_fault CHECK (event_type <> 'DEMAND_APPROVED') NOT VALID`
    try {
      expect((await call('POST', `/api/demands/${id}/review`, input, manager)).statusCode).toBe(500)
      expect(await db.project.findUnique({ where: { demandId: id } })).toBeNull()
      expect((await db.demand.findUniqueOrThrow({ where: { id } })).status).toBe('PENDING')
      expect(await db.commandReceipt.findUnique({ where: { actorId_key: { actorId: manager, key: input.requestId } } })).toBeNull()
    } finally {
      await db.$executeRaw`ALTER TABLE notification_outbox DROP CONSTRAINT workflow_test_fault`
    }
    expect((await call('POST', `/api/demands/${id}/review`, input, manager)).statusCode).toBe(200)
  })
  it('删除真实文件保留持久清理任务，清理成功后MinIO对象消失', async () => {
    const draft = await call('POST', '/api/demands', { requestId: key(), name: '删除测试', submit: false })
    const { id } = draft.json<{ data: { id: string } }>().data
    const upload = await call('POST', '/api/attachments/upload', { demandId: id, kind: 'PROTOTYPE', name: 'delete.html', mime: 'text/html', size: 12 })
    const ticket = upload.json<{ data: { attachmentId: string; uploadUrl: string; headers: Record<string, string> } }>().data
    expect((await fetch(ticket.uploadUrl, { method: 'PUT', headers: ticket.headers, body: 'hello world!' })).status).toBe(200)
    expect((await call('POST', `/api/attachments/${ticket.attachmentId}/confirm`)).statusCode).toBe(200)
    const download = await call('GET', `/api/attachments/${ticket.attachmentId}/download`)
    const url = download.json<{ data: { downloadUrl: string } }>().data.downloadUrl
    expect((await call('DELETE', `/api/demands/${id}`, { requestId: key(), version: 1 })).statusCode).toBe(200)
    expect(await db.attachment.findUnique({ where: { id: ticket.attachmentId } })).toBeNull()
    expect(await db.objectDeletion.findUnique({ where: { objectKey: `staging/${ticket.attachmentId}` } })).not.toBeNull()
    await runtime.attachments.cleanupExpired()
    expect((await fetch(url)).status).toBe(404)
  })

  it('未引用READY附件可显式丢弃并持久清理，非owner及已引用附件受保护', async () => {
    const { id } = await create()
    const file = await uploadedFile(id)
    expect((await call('DELETE', `/api/attachments/${file.id}`, undefined, engineer)).statusCode).toBe(403)
    expect(await db.attachment.findUnique({ where: { id: file.id } })).not.toBeNull()
    expect((await call('DELETE', `/api/attachments/${file.id}`)).statusCode).toBe(200)
    expect((await call('DELETE', `/api/attachments/${file.id}`)).statusCode).toBe(200)
    expect(await db.attachment.findUnique({ where: { id: file.id } })).toBeNull()
    expect(await db.objectDeletion.findUnique({ where: { objectKey: `staging/${file.id}` } })).not.toBeNull()
    await runtime.attachments.cleanupExpired()
    expect((await fetch(file.url)).status).toBe(404)
    const retained = await uploadedFile(id)
    expect((await call('PATCH', `/api/demands/${id}`, { ...valid(), version: 1,
      prototype: { kind: 'file', attachmentId: retained.id } })).statusCode).toBe(200)
    expect((await call('DELETE', `/api/attachments/${retained.id}`)).statusCode).toBe(409)
    expect(await db.attachment.findUnique({ where: { id: retained.id } })).not.toBeNull()
    expect((await fetch(retained.url)).status).toBe(200)
  })
  it('24小时未引用READY自动清理，而引用READY及新孤儿保留', async () => {
    const { id } = await create()
    const abandoned = await uploadedFile(id), retained = await uploadedFile(id), recent = await uploadedFile(id)
    expect((await call('PATCH', `/api/demands/${id}`, { ...valid(), version: 1,
      prototype: { kind: 'file', attachmentId: retained.id } })).statusCode).toBe(200)
    await db.attachment.updateMany({ where: { id: { in: [abandoned.id, retained.id] } },
      data: { createdAt: new Date(Date.now() - 25 * 3600000) } })
    await runtime.attachments.cleanupExpired()
    expect(await db.attachment.findUnique({ where: { id: abandoned.id } })).toBeNull()
    // Queued during the preceding sweep; the next worker pass processes new jobs.
    await runtime.attachments.cleanupExpired()
    expect((await fetch(abandoned.url)).status).toBe(404)
    for (const file of [retained, recent]) {
      expect(await db.attachment.findUnique({ where: { id: file.id } })).not.toBeNull()
      expect((await fetch(file.url)).status).toBe(200)
    }
  })

  it('撤回后仍能上传确认材料并在原需求重新提交', async () => {
    const { id } = await create()
    expect((await call('POST', `/api/demands/${id}/withdraw`, { requestId: key(), version: 1 })).statusCode).toBe(200)
    const file = await uploadedFile(id)
    const saved = await call('PATCH', `/api/demands/${id}`, { ...valid(), version: 2,
      prototype: { kind: 'file', attachmentId: file.id } })
    expect(saved.statusCode, saved.body).toBe(200)
    expect(saved.json<{ data: { id: string; status: string; version: number } }>().data).toMatchObject({ id, status: 'PENDING', version: 3 })
    expect((await db.demand.findUniqueOrThrow({ where: { id } })).prototypeAttachmentId).toBe(file.id)
  })

})
