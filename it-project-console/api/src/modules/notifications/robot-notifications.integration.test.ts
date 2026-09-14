import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, expect, it, vi } from 'vitest'
import { parseEnv } from '../../config/env.js'
import { createPrisma } from '../../plugins/prisma.js'
import { DingTalkClient, DingTalkError } from '../dingtalk/dingtalk-client.js'
import { NotificationService, type NotificationOptions } from './notification-service.js'
import { prepareManagerRiskDigest } from './manager-risk-digest.js'
import { scopeKey } from './notification-scope.js'
import { deleteProjectGroup } from '../demands/demand-deletion.js'
import { buildApp } from '../../app.js'

const env = parseEnv(process.env)
if (env.NODE_ENV !== 'test' || !new URL(env.DATABASE_URL).searchParams.get('schema')?.startsWith('itpc_test_') ||
  !env.S3_BUCKET.startsWith('itpc-test-')) throw new Error('必须通过隔离入口')
const db = createPrisma(env.DATABASE_URL)
const now = new Date(), startAt = new Date(now.getTime() - 60_000)
const users: string[] = [], keys: string[] = []
const options: NotificationOptions = { channel: 'robot', robotCode: 'fixture-bot', agentId: '123',
  webOrigin: 'https://console.example.test', enabled: true, startAt }
const client = () => ({ legacy: vi.fn(), robot: vi.fn().mockResolvedValue({ processQueryKey: 'fixture-key' }) })
async function fixture(createdAt = startAt, role: 'ENGINEER' | 'MANAGER' = 'ENGINEER') {
  const user = await db.user.create({ data: { name: '机器人测试员工', department: '测试部', dingUserId: randomUUID(), role } })
  users.push(user.id)
  const project = await db.project.create({ data: { name: '机器人测试项目', primaryOwnerId: user.id, risks: ['交付延期 2 天'] } })
  const item = await db.notificationOutbox.create({ data: { recipientId: user.id, projectId: project.id,
    eventType: 'PROJECT_RISKS_CHANGED', idempotencyKey: randomUUID(), payload: { risks: ['交付延期 2 天'] }, createdAt, availableAt: startAt } })
  return { user, project, item }
}
const log = (id: string) => db.notificationLog.findUniqueOrThrow({ where: { outboxId: id } })
const row = (id: string) => db.notificationOutbox.findUniqueOrThrow({ where: { id } })
const due = (id: string) => db.notificationOutbox.update({ where: { id }, data: { availableAt: startAt } })
afterEach(async () => {
  await db.notificationOutbox.deleteMany({ where: { recipientId: { in: users } } })
  await db.project.deleteMany({ where: { primaryOwnerId: { in: users } } })
  await db.user.deleteMany({ where: { id: { in: users.splice(0) } } })
  await db.systemSetting.deleteMany({ where: { key: { in: keys.splice(0) } } })
})
afterAll(() => db.$disconnect())

it('关闭或未到启用时间不修改队列；测试名单只投指定员工，历史跳过且边界时刻可投', async () => {
  const old = await fixture(new Date(startAt.getTime() - 1)), target = await fixture(), excluded = await fixture()
  const api = client(), scoped = { ...options, recipientUserIds: [old.user.dingUserId!, target.user.dingUserId!] }
  await new NotificationService(db, api, { ...scoped, enabled: false }).flush(now)
  await new NotificationService(db, api, scoped).flush(new Date(startAt.getTime() - 1))
  expect(await db.notificationLog.count({ where: { outboxId: { in: [old.item.id, target.item.id] } } })).toBe(0)
  await new NotificationService(db, api, scoped).flush(now)
  expect(await log(old.item.id)).toMatchObject({ state: 'SKIPPED', channel: 'robot' })
  expect(await row(old.item.id)).toMatchObject({ attempts: 0 })
  expect(await log(target.item.id)).toMatchObject({ state: 'ACCEPTED', channel: 'robot', senderCode: 'fixture-bot',
    recipientDingId: target.user.dingUserId, taskId: 'fixture-key', sentAt: null })
  expect(await db.notificationLog.count({ where: { outboxId: excluded.item.id } })).toBe(0)
  expect(api.robot).toHaveBeenCalledTimes(1)
  expect(api.robot.mock.calls[0]![1]).toMatchObject({ userIds: [target.user.dingUserId], msgKey: 'sampleText' })
  expect(api.legacy).not.toHaveBeenCalled()
})

it('并发不重复；未读只查询，改名绑定后仍查询原始机器人和员工', async () => {
  const { item, user } = await fixture(), api = client(), service = new NotificationService(db, api, options)
  await Promise.all([service.flush(now), service.flush(now)])
  expect(api.robot).toHaveBeenCalledTimes(1)
  await due(item.id)
  api.robot.mockResolvedValue({ messageReadInfoList: [{ userId: user.dingUserId, readStatus: 'unread' }] })
  await service.flush(now)
  expect(await log(item.id)).toMatchObject({ state: 'ACCEPTED', sentAt: null })
  expect((await row(item.id)).availableAt.getTime() - now.getTime()).toBe(15 * 60_000)
  await db.user.update({ where: { id: user.id }, data: { dingUserId: randomUUID() } })
  await due(item.id)
  api.robot.mockResolvedValue({ messageReadInfoList: [{ userId: user.dingUserId, readStatus: 'read' }] })
  await new NotificationService(db, api, { ...options, robotCode: 'changed-bot' }).flush(now)
  expect(api.robot).toHaveBeenLastCalledWith('readStatus', { robotCode: 'fixture-bot', processQueryKey: 'fixture-key' })
  expect(await log(item.id)).toMatchObject({ state: 'SENT', sentAt: now })
  expect(api.robot.mock.calls.filter(([path]) => path === 'batchSend')).toHaveLength(1)
  expect(api.legacy).not.toHaveBeenCalled()
})

it('限流最多5次；身份改变不重发；超时和无回执不重发', async () => {
  const first = await fixture(), api = client()
  api.robot.mockRejectedValue(new DingTalkError(true, false))
  const service = new NotificationService(db, api, options)
  for (let attempt = 1; attempt <= 5; attempt++) {
    await due(first.item.id); await service.flush(now)
    expect((await row(first.item.id)).attempts).toBe(attempt)
  }
  expect((await log(first.item.id)).state).toBe('FAILED')
  await due(first.item.id); await service.flush(now)
  expect(api.robot).toHaveBeenCalledTimes(5)
  const second = await fixture()
  await service.flush(now)
  await due(second.item.id)
  await db.user.update({ where: { id: second.user.id }, data: { dingUserId: randomUUID() } })
  await service.flush(now)
  expect((await log(second.item.id)).state).toBe('UNKNOWN')
  const third = await fixture()
  api.robot.mockRejectedValue(new DingTalkError(true, true))
  await service.flush(now); await due(third.item.id); await service.flush(now)
  expect((await log(third.item.id)).state).toBe('UNKNOWN')
  expect(api.robot).toHaveBeenCalledTimes(7)
})

it('旧日志默认work，旧回执仍查旧接口，旧重试禁止跨通道发送', async () => {
  const old = await fixture(new Date(startAt.getTime() - 1000)), retry = await fixture(), api = client()
  await db.$executeRaw`INSERT INTO notification_logs (id, outbox_id, state, task_id, updated_at)
    VALUES (${randomUUID()}, ${old.item.id}, 'ACCEPTED', '42', NOW())`
  await db.notificationLog.create({ data: { outboxId: retry.item.id, state: 'RETRY' } })
  for (const item of [old.item, retry.item]) await db.notificationOutbox.update({ where: { id: item.id }, data: { attempts: 1 } })
  expect((await log(old.item.id)).channel).toBe('work')
  api.legacy.mockResolvedValue({ send_result: { unread_user_id_list: [old.user.dingUserId] } })
  await new NotificationService(db, api, options).flush(now)
  expect((await log(old.item.id)).state).toBe('SENT')
  expect((await log(retry.item.id)).state).toBe('UNKNOWN')
  expect(api.legacy).toHaveBeenCalledWith('/topapi/message/corpconversation/getsendresult', { agent_id: '123', task_id: '42' })
  expect(api.robot).not.toHaveBeenCalled()
})

it('外部受理后数据库失败，恢复时不重发；超过24小时的未知查询停止', async () => {
  const { item } = await fixture(), api = client(), service = new NotificationService(db, api, options)
  const target = service as unknown as { record: (...args: unknown[]) => Promise<void> }
  const spy = vi.spyOn(target, 'record').mockRejectedValue(new Error('模拟事务失败'))
  try { await expect(service.flush(now)).rejects.toThrow('模拟事务失败') } finally { spy.mockRestore() }
  expect(await log(item.id)).toMatchObject({ state: 'SENDING', channel: 'robot' })
  await due(item.id); await service.flush(now)
  expect((await log(item.id)).state).toBe('UNKNOWN')
  expect(api.robot).toHaveBeenCalledTimes(1)
  const second = await fixture()
  await service.flush(now); await due(second.item.id)
  api.robot.mockResolvedValue({})
  await service.flush(new Date(now.getTime() + 25 * 60 * 60_000))
  expect((await log(second.item.id)).state).toBe('UNKNOWN')
  expect(api.robot.mock.calls.filter(([path]) => path === 'batchSend')).toHaveLength(2)
})

it('已受理通知删除项目仍保留回执并查询，不重发已删业务', async () => {
  const { item, project, user } = await fixture(), api = client(), service = new NotificationService(db, api, options)
  await service.flush(now)
  const actor = await db.user.findUniqueOrThrow({ where: { id: 'user-manager-chen' } })
  await db.$transaction(tx => deleteProjectGroup(tx, actor, project.id, project.version))
  expect((await log(item.id)).state).toBe('ACCEPTED')
  await due(item.id)
  api.robot.mockResolvedValue({ messageReadInfoList: [{ userId: user.dingUserId, readStatus: 'read' }] })
  await service.flush(now)
  expect((await log(item.id)).state).toBe('SENT')
  expect(api.robot.mock.calls.filter(([path]) => path === 'batchSend')).toHaveLength(1)
})

it('管理汇总遵守名单与启用时间，同日从测试切到全员不会吞掉其他员工来源', async () => {
  const monday = new Date('2030-01-07T02:00:00Z'), cutoff = new Date('2030-01-07T00:00:00Z')
  const old = await fixture(new Date(cutoff.getTime() - 1), 'MANAGER')
  const a = await fixture(cutoff, 'MANAGER'), b = await fixture(cutoff, 'MANAGER')
  const scope = { startAt: cutoff, recipientUserIds: [a.user.dingUserId!] }, all = { startAt: cutoff }
  keys.push(`manager-risk-digest:2030-01-07${scopeKey(scope)}`, `manager-risk-digest:2030-01-07${scopeKey(all)}`)
  expect(await prepareManagerRiskDigest(db, monday, '09:00', scope)).toBe(1)
  expect(await db.notificationLog.count({ where: { outboxId: b.item.id } })).toBe(0)
  expect(await prepareManagerRiskDigest(db, monday, '09:00', all)).toBe(1)
  expect(await prepareManagerRiskDigest(db, monday, '09:00', all)).toBe(0)
  expect(await db.notificationOutbox.count({ where: { recipientId: { in: [a.user.id, b.user.id] }, eventType: 'MANAGER_RISK_DIGEST' } })).toBe(2)
  expect(await db.notificationLog.count({ where: { outboxId: old.item.id } })).toBe(0)
})

it('新API不接收旧机器人事件，不执行回复或业务写入', async () => {
  const { app } = await buildApp(env, { db, logging: false })
  try {
    const before = await db.notificationOutbox.count()
    const result = await app.inject({ method: 'POST', url: '/api/dingtalk/bot-events',
      headers: { origin: env.WEB_ORIGIN }, payload: { messageId: 'fixture', senderStaffId: 'fixture', text: '创建项目' } })
    expect(result.statusCode).toBe(404)
    expect(await db.notificationOutbox.count()).toBe(before)
  } finally { await app.close() }
})

it('官方HTTP400限流进入退避，恢复后只受理一次', async () => {
  const { item } = await fixture()
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ accessToken: 'fixture', expireIn: 7200 }))
    .mockResolvedValueOnce(Response.json({ code: 'send.too.fast' }, { status: 400 }))
    .mockResolvedValueOnce(Response.json({ processQueryKey: 'recovered' }))
  const api = new DingTalkClient({ clientId: 'fixture', clientSecret: 'fixture' }, fetcher)
  const service = new NotificationService(db, api, options)
  await service.flush(now)
  expect((await log(item.id)).state).toBe('RETRY')
  expect((await row(item.id)).availableAt.getTime() - now.getTime()).toBe(2 * 60_000)
  await service.flush(now)
  expect(fetcher).toHaveBeenCalledTimes(2)
  await due(item.id); await service.flush(now)
  expect(await log(item.id)).toMatchObject({ state: 'ACCEPTED', taskId: 'recovered' })
  expect(fetcher).toHaveBeenCalledTimes(3)
})
