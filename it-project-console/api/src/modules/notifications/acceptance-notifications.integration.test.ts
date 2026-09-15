import { randomUUID } from 'node:crypto'
import { afterAll, expect, it, vi } from 'vitest'
import { parseEnv } from '../../config/env.js'
import { createPrisma } from '../../plugins/prisma.js'
import { NotificationService } from './notification-service.js'
const env = parseEnv(process.env), database = new URL(env.DATABASE_URL)
if (env.NODE_ENV !== 'test' || !['127.0.0.1', 'localhost'].includes(database.hostname) || !database.searchParams.get('schema')?.startsWith('itpc_test_') || !env.S3_BUCKET.startsWith('itpc-test-')) throw new Error('必须通过隔离入口')
const db = createPrisma(env.DATABASE_URL), users: string[] = []
const now = new Date('2030-01-01T00:00:00Z')
async function fixture(eventType = 'ACCEPTANCE_SUBMITTED') {
  const user = await db.user.create({ data: { name: '验收通知测试', department: '测试部', role: eventType === 'ACCEPTANCE_SUBMITTED' ? 'BUSINESS' : 'ENGINEER', dingUserId: randomUUID() } })
  users.push(user.id)
  const project = await db.project.create({ data: { name: '验收通知项目', primaryOwnerId: user.id, acceptanceOwnerId: user.id,
    acceptanceStatus: eventType === 'ACCEPTANCE_RETURNED' ? 'returned' : 'pending', acceptanceRound: 2 } })
  const item = await db.notificationOutbox.create({ data: { projectId: project.id, recipientId: user.id, eventType,
    idempotencyKey: randomUUID(), payload: { acceptanceRound: 2 }, createdAt: new Date('2026-01-01'), availableAt: new Date('2026-01-01') } })
  const legacy = vi.fn().mockResolvedValue({ task_id: '501' })
  const service = new NotificationService(db, { legacy }, { agentId: '123', webOrigin: 'https://console.example.test', enabled: true, recipientUserIds: [user.dingUserId!] })
  return { user, project, item, legacy, service }
}
afterAll(async () => {
  await db.notificationOutbox.deleteMany({ where: { recipientId: { in: users } } })
  await db.project.deleteMany({ where: { primaryOwnerId: { in: users } } })
  await db.user.deleteMany({ where: { id: { in: users } } })
  await db.$disconnect()
})
it('提交消息真实深链和当前业务收件，回执已受理后撤回仍查原回执不重发', async () => {
  const { user, project, item, legacy, service } = await fixture()
  await service.flush(now)
  expect(legacy).toHaveBeenCalledOnce()
  expect(legacy.mock.calls[0]![1].msg.text.content).toContain('项目待业务验收')
  expect(legacy.mock.calls[0]![1].msg.text.content).toContain(`projectId=${project.id}`)
  await db.project.update({ where: { id: project.id }, data: { acceptanceStatus: 'none' } })
  await db.notificationOutbox.update({ where: { id: item.id }, data: { availableAt: new Date('2026-01-01') } })
  legacy.mockClear().mockResolvedValue({ send_result: { unread_user_id_list: [user.dingUserId] } })
  await service.flush(now)
  expect(legacy).toHaveBeenCalledOnce()
  expect(legacy.mock.calls[0]![0]).toContain('getsendresult')
  expect(await db.notificationLog.findUniqueOrThrow({ where: { outboxId: item.id } })).toMatchObject({ state: 'SENT', taskId: '501' })
})
it('撤回、改派、轮次、取消、归档、停用使待发送验收消息失效', async () => {
  for (const data of [{ acceptanceStatus: 'none' }, { acceptanceOwnerId: null }, { acceptanceRound: 3 }, { status: 'CANCELLED' as const }, { archived: true }]) {
    const { project, item, legacy, service } = await fixture()
    await db.project.update({ where: { id: project.id }, data })
    await service.flush(now)
    expect(legacy).not.toHaveBeenCalled()
    expect(await db.notificationLog.findUniqueOrThrow({ where: { outboxId: item.id } })).toMatchObject({ state: 'SKIPPED' })
  }
  const { user, legacy, service } = await fixture()
  await db.user.update({ where: { id: user.id }, data: { active: false } })
  await service.flush(now)
  expect(legacy).not.toHaveBeenCalled()
})
it('指定验收人为管理员或工程师仍投递待验收通知', async () => {
  for (const role of ['MANAGER', 'ENGINEER'] as const) {
    const { user, item, legacy, service } = await fixture()
    await db.user.update({ where: { id: user.id }, data: { role } })
    await service.flush(now)
    expect(legacy).toHaveBeenCalledOnce()
    expect(await db.notificationLog.findUniqueOrThrow({ where: { outboxId: item.id } })).toMatchObject({ state: 'ACCEPTED' })
  }
})
it('退回消息重提后失效，待验收时旧工程师风险消息不能新发', async () => {
  for (const eventType of ['ACCEPTANCE_RETURNED', 'PROJECT_RISKS_CHANGED']) {
    const { project, item, legacy, service } = await fixture(eventType)
    await db.project.update({ where: { id: project.id }, data: { acceptanceStatus: 'pending' } })
    await service.flush(now)
    expect(legacy).not.toHaveBeenCalled()
    expect(await db.notificationLog.findUniqueOrThrow({ where: { outboxId: item.id } })).toMatchObject({ state: 'SKIPPED' })
  }
})
