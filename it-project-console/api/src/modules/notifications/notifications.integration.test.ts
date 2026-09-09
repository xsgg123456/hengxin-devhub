import { randomUUID } from 'node:crypto'
import { afterAll, expect, it, vi } from 'vitest'
import { parseEnv } from '../../config/env.js'
import { createPrisma } from '../../plugins/prisma.js'
import { DingTalkError } from '../dingtalk/dingtalk-client.js'
import { NotificationService } from './notification-service.js'
import { flushNotifications } from './notification-job.js'

const env = parseEnv(process.env)
if (env.NODE_ENV !== 'test' || !new URL(env.DATABASE_URL).searchParams.get('schema')?.startsWith('itpc_test_') ||
  !env.S3_BUCKET.startsWith('itpc-test-')) throw new Error('必须通过隔离入口')
const db = createPrisma(env.DATABASE_URL)
const options = { agentId: '123', webOrigin: 'https://console.example.test', enabled: true }
const now = new Date('2030-01-01T00:00:00Z')
const fixtureUsers: string[] = []
async function fixture(eventType = 'PROJECT_RISKS_CHANGED', active = true) {
  const user = await db.user.create({ data: { name: '测试负责人', department: '测试部',
    dingUserId: randomUUID(), role: 'ENGINEER', active } })
  fixtureUsers.push(user.id)
  const project = await db.project.create({ data: { name: '通知测试项目', primaryOwnerId: user.id } })
  const item = await db.notificationOutbox.create({ data: { recipientId: user.id, projectId: project.id,
    eventType, idempotencyKey: randomUUID(), payload: { risks: ['交付延期 2 天'] },
    createdAt: new Date('2000-01-01'), availableAt: new Date('2000-01-01') } })
  return { user, project, item }
}
const log = (id: string) => db.notificationLog.findUniqueOrThrow({ where: { outboxId: id } })
const due = (id: string) => db.notificationOutbox.update({ where: { id }, data: { availableAt: new Date('2000-01-01') } })
afterAll(async () => {
  await db.notificationOutbox.deleteMany({where:{recipientId:{in:fixtureUsers}}})
  await db.project.deleteMany({where:{primaryOwnerId:{in:fixtureUsers}}})
  await db.user.deleteMany({where:{id:{in:fixtureUsers}}})
  await db.$disconnect()
})

it('默认关闭不认领；并发仅受理一次，结果确认后才记成功和发送时间', async () => {
  const { item, user } = await fixture()
  const legacy = vi.fn().mockResolvedValue({ task_id: 42 })
  await new NotificationService(db, { legacy }, { ...options, enabled: false }).flush(now)
  expect(await db.notificationLog.count({ where: { outboxId: item.id } })).toBe(0)
  const service = new NotificationService(db, { legacy }, options)
  await Promise.all([service.flush(now), service.flush(now)])
  expect(legacy.mock.calls.filter(([, body]) => body.userid_list === user.dingUserId)).toHaveLength(1)
  expect((await log(item.id)).state).toBe('ACCEPTED')
  expect((await log(item.id)).sentAt).toBeNull()
  const content = legacy.mock.calls.find(([, body]) => body.userid_list === user.dingUserId)![1].msg.text.content
  expect(content).toContain('通知测试项目\n负责人：测试负责人\n交付延期 2 天')
  expect(content).toContain('/#/project-overview?projectId=')
  await due(item.id)
  legacy.mockResolvedValue({ send_result: { unread_user_id_list: [user.dingUserId] } })
  await service.flush(now)
  expect((await log(item.id)).state).toBe('SENT')
  expect((await log(item.id)).sentAt).toEqual(now)
  expect((await db.notificationOutbox.findUniqueOrThrow({ where: { id: item.id } })).status).toBe('SENT')
  legacy.mockClear()
  await service.flush(now)
  expect(legacy).not.toHaveBeenCalled()
})
it('明确限流指数退避最多5次，记录不泄露上游内容', async () => {
  const { item } = await fixture()
  const legacy = vi.fn().mockRejectedValue(new DingTalkError(true, false))
  const service = new NotificationService(db, { legacy }, options)
  for (let attempt = 1; attempt <= 5; attempt++) {
    await due(item.id)
    await service.flush(now)
    const row = await db.notificationOutbox.findUniqueOrThrow({ where: { id: item.id } })
    expect(row.attempts).toBe(attempt)
    if (attempt < 5) expect(row.availableAt.getTime() - now.getTime()).toBe(2 ** attempt * 60_000)
  }
  expect((await log(item.id)).state).toBe('FAILED')
  expect((await log(item.id)).safeError).toBe('钉钉拒绝投递')
  await due(item.id)
  await service.flush(now)
  expect(legacy).toHaveBeenCalledTimes(5)
})
it('超时不自动重发；崩溃认领无回执转待核查', async () => {
  const { item } = await fixture()
  const legacy = vi.fn().mockRejectedValue(new DingTalkError(true, true))
  const service = new NotificationService(db, { legacy }, options)
  await service.flush(now)
  expect((await log(item.id)).state).toBe('UNKNOWN')
  await due(item.id)
  await service.flush(now)
  expect(legacy).toHaveBeenCalledTimes(1)
  const second = await fixture()
  await db.notificationLog.create({ data: { outboxId: second.item.id, state: 'SENDING' } })
  await service.flush(now)
  expect((await log(second.item.id)).state).toBe('UNKNOWN')
  expect(legacy).toHaveBeenCalledTimes(1)
})
it('停用/未绑定/样例/不支持事件跳过；日志随outbox级联删除', async () => {
  const { item } = await fixture('PROJECT_ASSIGNED', false)
  const unbound = await fixture('DEMAND_APPROVED')
  await db.user.update({ where: { id: unbound.user.id }, data: { dingUserId: null } })
  const unsupported = await fixture('DEMAND_REJECTED')
  const legacy = vi.fn()
  await new NotificationService(db, { legacy }, options).flush(now)
  for (const id of [item.id, unbound.item.id, unsupported.item.id]) expect((await log(id)).state).toBe('SKIPPED')
  expect(legacy).not.toHaveBeenCalled()
  await db.notificationOutbox.delete({ where: { id: item.id } })
  expect(await db.notificationLog.count({ where: { outboxId: item.id } })).toBe(0)
})
it('数据库任务故障返回脱敏结果，不传播至业务调用', async () => {
  const service = new NotificationService(db, { legacy: vi.fn() }, options)
  vi.spyOn(service, 'flush').mockRejectedValue(new Error('sensitive token'))
  expect(await flushNotifications(service)).toEqual({ ok: false, error: '通知投递任务失败，请检查脱敏投递记录' })
})
it('已受理任务只轮询，空回执不标成功，确认失败才重试', async () => {
  const { item, user } = await fixture()
  const instant = new Date()
  const legacy = vi.fn().mockResolvedValue({ task_id: 99 })
  const service = new NotificationService(db, { legacy }, options)
  await service.flush(instant)
  await due(item.id)
  legacy.mockResolvedValue({ send_result: {} })
  await service.flush(instant)
  expect((await log(item.id)).state).toBe('ACCEPTED')
  expect((await log(item.id)).sentAt).toBeNull()
  expect(legacy.mock.calls.filter(([path]) => path.endsWith('asyncsend_v2'))).toHaveLength(1)
  await due(item.id)
  legacy.mockResolvedValue({ send_result: { failed_user_id_list: [user.dingUserId] } })
  await service.flush(instant)
  expect((await log(item.id)).state).toBe('RETRY')
  expect((await log(item.id)).taskId).toBeNull()
  await due(item.id)
  legacy.mockResolvedValue({ task_id: 100 })
  await service.flush(instant)
  expect((await log(item.id)).taskId).toBe('100')
  await due(item.id)
  legacy.mockResolvedValue({ send_result: {} })
  await service.flush(new Date(instant.getTime() + 25 * 60 * 60_000))
  expect((await log(item.id)).state).toBe('UNKNOWN')
  expect(legacy.mock.calls.filter(([path]) => path.endsWith('asyncsend_v2'))).toHaveLength(2)
})
