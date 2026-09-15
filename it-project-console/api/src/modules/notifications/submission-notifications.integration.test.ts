import { randomUUID, randomBytes, createHash } from 'node:crypto'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { buildApp } from '../../app.js'
import { parseEnv } from '../../config/env.js'
import { createPrisma } from '../../plugins/prisma.js'
import { DemandService } from '../demands/demand-service.js'
import { NotificationService, notificationContent } from './notification-service.js'

const env = parseEnv(process.env)
if (env.NODE_ENV !== 'test' || !env.S3_BUCKET.startsWith('itpc-test-') ||
  !new URL(env.DATABASE_URL).searchParams.get('schema')?.startsWith('itpc_test_')) throw new Error('必须通过隔离入口')
const db = createPrisma(env.DATABASE_URL), ids: string[] = [], demands: string[] = [], projects: string[] = []
let runtime: Awaited<ReturnType<typeof buildApp>>, cookie = '', managerCookie = ''
const approverDingId = randomUUID()
const now = () => new Date(Date.now() + 1000)
const options = { enabled: true, channel: 'robot' as const, robotCode: 'fixture-bot', agentId: '123',
  webOrigin: 'https://console.example.test', startAt: new Date('2000-01-01'), projectApproverDingUserId: approverDingId, recipientUserIds: [approverDingId] }
const body = () => ({ requestId: randomUUID(), name: '新需求通知测试', description: '说明', expectedLaunchDate: '2099-12-31', submit: false })
const call = (method: 'POST' | 'PATCH', url: string, payload: object) => runtime.app.inject({ method, url, payload,
  headers: { cookie, origin: env.WEB_ORIGIN } })
async function draft() {
  const response = await call('POST', '/api/demands', body())
  expect(response.statusCode, response.body).toBe(200)
  const row = response.json().data as { id: string; version: number }; demands.push(row.id)
  const attachment = await db.attachment.create({ data: { demandId: row.id, uploaderId: ids[0]!, kind: 'FILE',
    name: 'test.txt', mime: 'text/plain', size: 1, objectKey: randomUUID(), status: 'READY', expiresAt: now() } })
  return { ...row, attachmentIds: [attachment.id] }
}
async function submit(row: { id: string; version: number; attachmentIds: string[] }) {
  const payload = { ...body(), submit: true, version: row.version, attachmentIds: row.attachmentIds }
  const response = await call('PATCH', `/api/demands/${row.id}`, payload)
  expect(response.statusCode, response.body).toBe(200)
  return { payload, result: response.json().data as { version: number } }
}
const items = (id: string) => db.notificationOutbox.findMany({ where: { demandId: id, eventType: 'DEMAND_SUBMITTED' }, orderBy: { createdAt: 'asc' } })
const client = () => ({ legacy: vi.fn(), robot: vi.fn().mockResolvedValue({ processQueryKey: randomUUID() }) })
beforeAll(async () => {
  for (const role of ['BUSINESS', 'MANAGER', 'ENGINEER', 'ENGINEER', 'MANAGER'] as const) {
    const user = await db.user.create({ data: { name: `通知测试${ids.length}`, role, department: '测试部',
      dingUserId: ids.length === 1 ? approverDingId : randomUUID() } }); ids.push(user.id)
  }
  runtime = await buildApp({ ...env, PROJECT_APPROVER_DING_USER_ID: approverDingId }, { logging: false })
  await runtime.app.ready()
  for (const id of [ids[0]!, ids[1]!]) {
    const token = randomBytes(32).toString('hex')
    await db.session.create({ data: { userId: id, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 3600000) } })
    if (id === ids[0]) cookie = `itpc_session=${token}`; else managerCookie = `itpc_session=${token}`
  }
})
afterAll(async () => {
  await runtime?.app.close()
  await db.notificationOutbox.deleteMany({ where: { recipientId: { in: ids } } })
  await db.commandReceipt.deleteMany({ where: { actorId: { in: ids } } })
  await db.attachment.deleteMany({ where: { demandId: { in: demands } } })
  await db.project.deleteMany({ where: { id: { in: projects } } })
  await db.demand.deleteMany({ where: { id: { in: demands } } })
  await db.user.deleteMany({ where: { id: { in: ids } } }); await db.$disconnect()
})
it('真实API草稿不通知，正式提交与重试只通知指定审批人，待审批修改不重复，机器人内容带需求深链', async () => {
  const row = await draft(); expect(await items(row.id)).toHaveLength(0)
  const { payload, result } = await submit(row)
  expect((await call('PATCH', `/api/demands/${row.id}`, payload)).statusCode).toBe(200)
  const [item] = await items(row.id)
  expect(await items(row.id)).toHaveLength(1); expect(item!.recipientId).toBe(ids[1])
  const before = (await db.demand.findUniqueOrThrow({ where: { id: row.id } })).submittedAt
  await submit({ ...row, version: result.version })
  expect(await items(row.id)).toHaveLength(1)
  expect((await db.demand.findUniqueOrThrow({ where: { id: row.id } })).submittedAt).toEqual(before)
  const c = client(); await new NotificationService(db, c, { ...options, recipientUserIds: [approverDingId] }).flush(now())
  const send = c.robot.mock.calls.find(call => call[0] === 'batchSend')
  expect(send?.[1].userIds).toEqual([approverDingId])
  const content = JSON.parse(send![1].msgParam as string).content
  expect(content).toContain('新需求待立项审批，请及时处理')
  expect(content).toContain('项目：新需求通知测试')
  expect(content).toContain(`/#/my-demands?demandId=${row.id}`)
})
it('撤回重提跳过旧批次，退回补充后重提生成新通知', async () => {
  const row = await draft(), first = await submit(row)
  expect((await call('POST', `/api/demands/${row.id}/withdraw`, { requestId: randomUUID(), version: first.result.version })).statusCode).toBe(200)
  const c = client(), service = new NotificationService(db, c, options)
  await service.flush(now())
  const [old] = await items(row.id)
  expect((await db.notificationLog.findUniqueOrThrow({ where: { outboxId: old!.id } })).state).toBe('SKIPPED')
  await submit({ ...row, version: first.result.version + 1 })
  const pending = await db.demand.findUniqueOrThrow({ where: { id: row.id } })
  const returned = await runtime.app.inject({ method: 'POST', url: `/api/demands/${row.id}/review`,
    headers: { cookie: managerCookie, origin: env.WEB_ORIGIN },
    payload: { requestId: randomUUID(), version: pending.version, decision: 'return', reason: '请补充材料' } })
  expect(returned.statusCode, returned.body).toBe(200)
  const latest = await db.demand.findUniqueOrThrow({ where: { id: row.id } })
  await submit({ ...row, version: latest.version })
  expect(await items(row.id)).toHaveLength(3)
  await service.flush(now())
  const events = await items(row.id)
  expect((await db.notificationLog.findUniqueOrThrow({ where: { outboxId: events[1]!.id } })).state).toBe('SKIPPED')
  expect((await db.notificationLog.findUniqueOrThrow({ where: { outboxId: events[2]!.id } })).state).toBe('ACCEPTED')
})
it('已审批、审批人变更和名单外不发送新需求通知', async () => {
  const row = await draft(); await submit(row)
  const c = client()
  await new NotificationService(db, c, { ...options, recipientUserIds: ['outside'] }).flush(now())
  const [item] = await items(row.id)
  expect(await db.notificationLog.findUnique({ where: { outboxId: item!.id } })).toBeNull()
  await new NotificationService(db, c, { ...options, projectApproverDingUserId: 'changed' }).flush(now())
  expect((await db.notificationLog.findUniqueOrThrow({ where: { outboxId: item!.id } })).state).toBe('SKIPPED')
  const other = await draft(); await submit(other)
  await db.demand.update({ where: { id: other.id }, data: { status: 'AWAITING_ENGINEER' } })
  await new NotificationService(db, c, options).flush(now())
  const [reviewed] = await items(other.id)
  expect((await db.notificationLog.findUniqueOrThrow({ where: { outboxId: reviewed!.id } })).state).toBe('SKIPPED')
})
it('立项两种来源只有主负责工程师显示制定计划，业务与协作者标题和链接不变', async () => {
  const project = await db.project.create({ data: { name: '立项文案测试', primaryOwnerId: ids[2]! } }); projects.push(project.id)
  for (const eventType of ['DEMAND_APPROVED', 'PROJECT_ASSIGNED']) for (const recipientId of [ids[0]!, ids[2]!, ids[3]!]) {
    const row = await db.notificationOutbox.create({ data: { recipientId, projectId: project.id, eventType, idempotencyKey: randomUUID(), status: 'SENT', payload: {} },
      include: { recipient: true, demand: true, project: { include: { primaryOwner: true } }, deliveryLog: true } })
    const content = notificationContent(row, options.webOrigin)
    const title = recipientId === ids[2] ? (eventType === 'DEMAND_APPROVED' ? '需求已正式立项，请制定计划' : '项目已正式立项，请制定计划') : (eventType === 'DEMAND_APPROVED' ? '需求已正式立项' : '项目已分配')
    expect(content.split('\n')[0]).toBe(title)
    expect(content).toContain(`/#/project-overview?projectId=${project.id}`)
  }
})

it.each(['disabled', 'demoted', 'missing'] as const)('审批人%s时不新增通知；已入箱失效通知不外发', async condition => {
  const row = await draft(); await submit(row)
  const next = await draft()
  const original = await db.user.findUniqueOrThrow({ where: { id: ids[1]! } })
  try {
    if (condition !== 'missing') await db.user.update({ where: { id: original.id }, data: condition === 'disabled' ? { active: false } : { role: 'BUSINESS' } })
    const actor = await db.user.findUniqueOrThrow({ where: { id: ids[0]! } })
    await new DemandService(db, condition === 'missing' ? '' : approverDingId).save(actor, next.id,
      { ...body(), submit: true, version: next.version, attachmentIds: next.attachmentIds })
    expect(await items(next.id)).toHaveLength(0)
    await new NotificationService(db, client(), { ...options, projectApproverDingUserId: condition === 'missing' ? '' : approverDingId }).flush(now())
    const [item] = await items(row.id)
    expect((await db.notificationLog.findUniqueOrThrow({ where: { outboxId: item!.id } })).state).toBe('SKIPPED')
  } finally { await db.user.update({ where: { id: original.id }, data: { active: original.active, role: original.role } }) }
})
it('通知出箱失败回滚提交状态与命令回执，恢复后同请求可以成功提交', async () => {
  const row = await draft(), payload = { ...body(), submit: true, version: row.version, attachmentIds: row.attachmentIds }
  const conflict = await db.notificationOutbox.create({ data: { recipientId: ids[1]!, demandId: row.id, eventType: 'DEMAND_SUBMITTED',
    idempotencyKey: `${ids[0]}:${payload.requestId}:DEMAND_SUBMITTED:${ids[1]}`, payload: {} } })
  const failed = await call('PATCH', `/api/demands/${row.id}`, payload)
  expect(failed.statusCode).toBeGreaterThanOrEqual(400)
  expect(await db.demand.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({ status: 'DRAFT', version: row.version, submittedAt: null })
  expect(await db.commandReceipt.findUnique({ where: { actorId_key: { actorId: ids[0]!, key: payload.requestId } } })).toBeNull()
  await db.notificationOutbox.delete({ where: { id: conflict.id } })
  expect((await call('PATCH', `/api/demands/${row.id}`, payload)).statusCode).toBe(200)
  expect(await items(row.id)).toHaveLength(1)
})
