import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { parseEnv } from '../../config/env.js'
import { createPrisma } from '../../plugins/prisma.js'
import { prepareManagerRiskDigest } from './manager-risk-digest.js'
import { notificationContent, NotificationService } from './notification-service.js'

const env = parseEnv(process.env)
if (env.NODE_ENV !== 'test' || !new URL(env.DATABASE_URL).searchParams.get('schema')?.startsWith('itpc_test_') ||
  !env.S3_BUCKET.startsWith('itpc-test-')) throw new Error('必须通过隔离入口')
const db = createPrisma(env.DATABASE_URL)
const users: string[] = []
const days: string[] = []
let previousQueue: Array<{ id: string; availableAt: Date }> = []
beforeAll(async () => {
  // Other integration files share this isolated schema; their backlog must not occupy
  // this suite's five-item delivery batch or become part of its dated digest.
  previousQueue = await db.notificationOutbox.findMany({ select: { id: true, availableAt: true } })
  await db.notificationOutbox.updateMany({ where: { id: { in: previousQueue.map(item => item.id) } },
    data: { availableAt: new Date('2100-01-01T00:00:00Z') } })
})
const instant = (day: string, time = '09:00') => { days.push(day); return new Date(`${day}T${time}:00+08:00`) }
const options = { agentId: '123', webOrigin: 'https://console.example.test', enabled: true }
async function user(role: 'MANAGER' | 'ENGINEER') {
  const row = await db.user.create({ data: { name: role === 'MANAGER' ? '汇总管理员' : '工程师甲', department: '测试部', role, dingUserId: randomUUID() } })
  users.push(row.id)
  return row
}
async function source(recipientId: string, projectId: string, at: Date) {
  return db.notificationOutbox.create({ data: { recipientId, projectId, eventType: 'PROJECT_RISKS_CHANGED',
    idempotencyKey: randomUUID(), payload: { risks: ['交付延期 2 天'] }, availableAt: at, createdAt: at } })
}
afterAll(async () => {
  await db.notificationOutbox.deleteMany({ where: { recipientId: { in: users } } })
  await db.project.deleteMany({ where: { primaryOwnerId: { in: users } } })
  await db.user.deleteMany({ where: { id: { in: users } } })
  await db.systemSetting.deleteMany({ where: { key: { in: [...new Set(days)].map(day => `manager-risk-digest:${day}`) } } })
  for (const item of previousQueue) {
    await db.notificationOutbox.updateMany({ where: { id: item.id }, data: { availableAt: item.availableAt } })
  }
  await db.$disconnect()
})

it('管理人员按工作日合并变化项目并隔离收件人，工程师实时发送，原事件原子消费且并发不重复', async () => {
  const manager = await user('MANAGER'), otherManager = await user('MANAGER'), engineer = await user('ENGINEER')
  const first = await db.project.create({ data: { name: '风险项目甲', primaryOwnerId: engineer.id, risks: ['交付延期 2 天'] } })
  const second = await db.project.create({ data: { name: '风险项目乙', primaryOwnerId: engineer.id, risks: ['存在阻塞'] } })
  const sample = await db.project.create({ data: { id: `sample-${randomUUID()}`, name: '样例不可外发', primaryOwnerId: engineer.id, risks: ['存在阻塞'] } })
  const before = instant('2030-01-07', '08:59')
  const originals = await Promise.all([source(manager.id, first.id, before), source(manager.id, second.id, before),
    source(manager.id, sample.id, before), source(otherManager.id, first.id, before)])
  const ownerEvent = await source(engineer.id, first.id, before)
  const legacy = vi.fn().mockResolvedValue({ task_id: 42 })
  const service = new NotificationService(db, { legacy }, options)
  await service.flush(before)
  expect(legacy.mock.calls.filter(([path]) => path.endsWith('asyncsend_v2'))).toHaveLength(1)
  expect((await db.notificationLog.findUniqueOrThrow({ where: { outboxId: ownerEvent.id } })).state).toBe('ACCEPTED')
  expect(await db.notificationLog.count({ where: { outboxId: { in: originals.map(item => item.id) } } })).toBe(0)
  const at = instant('2030-01-07')
  await Promise.all([service.flush(at), service.flush(at)])
  const managerCalls = legacy.mock.calls.filter(([path, body]) => path.endsWith('asyncsend_v2') && body.userid_list === manager.dingUserId)
  expect(managerCalls).toHaveLength(1)
  const text = managerCalls[0]![1].msg.text.content
  expect(text).toContain('风险项目甲')
  expect(text).toContain('风险项目乙')
  expect(text).toContain('负责人：工程师甲')
  expect(text).toContain('存在阻塞')
  expect(text).toContain(`/#/project-overview?projectId=${first.id}`)
  expect(text).not.toContain('样例不可外发')
  expect(legacy.mock.calls.filter(([path, body]) => path.endsWith('asyncsend_v2') && body.userid_list === otherManager.dingUserId)).toHaveLength(1)
  expect(await db.notificationLog.count({ where: { outboxId: { in: originals.map(item => item.id) }, state: 'SKIPPED' } })).toBe(4)
  expect(await prepareManagerRiskDigest(db, instant('2030-01-08'))).toBe(0)
  const later = await source(manager.id, first.id, instant('2030-01-08', '10:00'))
  expect(await prepareManagerRiskDigest(db, instant('2030-01-08', '11:00'))).toBe(0)
  expect(await db.notificationLog.findUnique({ where: { outboxId: later.id } })).toBeNull()
  expect(await prepareManagerRiskDigest(db, instant('2030-01-09'))).toBe(1)
  expect(await prepareManagerRiskDigest(db, instant('2030-01-10'))).toBe(0)
  const weekend = await source(manager.id, second.id, instant('2030-01-12'))
  expect(await prepareManagerRiskDigest(db, instant('2030-01-12'))).toBe(0)
  expect(await prepareManagerRiskDigest(db, instant('2030-01-13'))).toBe(0)
  expect(await db.notificationLog.findUnique({ where: { outboxId: weekend.id } })).toBeNull()
  expect(await prepareManagerRiskDigest(db, instant('2030-01-14'))).toBe(1)
})

it('汇总时间可配置，默认关闭不消费，无当前异常不生成汇总', async () => {
  const manager = await user('MANAGER'), engineer = await user('ENGINEER')
  const project = await db.project.create({ data: { name: '已解除风险', primaryOwnerId: engineer.id, risks: [] } })
  const item = await source(manager.id, project.id, instant('2030-02-04', '08:00'))
  const legacy = vi.fn()
  await new NotificationService(db, { legacy }, { ...options, enabled: false }).flush(instant('2030-02-04'))
  expect(await db.notificationLog.findUnique({ where: { outboxId: item.id } })).toBeNull()
  expect(await prepareManagerRiskDigest(db, instant('2030-02-04'), '10:30')).toBe(0)
  expect(await db.notificationLog.findUnique({ where: { outboxId: item.id } })).toBeNull()
  expect(await prepareManagerRiskDigest(db, instant('2030-02-04', '10:30'), '10:30')).toBe(0)
  expect((await db.notificationLog.findUniqueOrThrow({ where: { outboxId: item.id } })).state).toBe('SKIPPED')
  expect(legacy).not.toHaveBeenCalled()
  await expect(prepareManagerRiskDigest(db, instant('2030-02-05'), '25:00')).rejects.toThrow('HH:mm')
})

it('大量项目按UTF8预算保留完整项目块和总览链接，不截断深链', async () => {
  const manager = await user('MANAGER')
  const digest = await db.notificationOutbox.create({ data: {
    recipientId: manager.id, eventType: 'MANAGER_RISK_DIGEST', idempotencyKey: randomUUID(),
    payload: { projects: Array.from({ length: 40 }, (_, index) => ({
      projectId: `project-${index}`, name: `风险项目${index}`, owner: '工程师', risks: ['交付延期 2 天']
    })) }
  }, include: { recipient: true, demand: true, project: { include: { primaryOwner: true } }, deliveryLog: true } })
  const content = notificationContent(digest, options.webOrigin)
  expect(Buffer.byteLength(content, 'utf8')).toBeLessThanOrEqual(1800)
  expect(content).toContain('项目：风险项目0\n负责人：工程师\n交付延期 2 天\n查看详情：https://console.example.test/#/project-overview?projectId=project-0')
  expect(content).toMatch(/其余 \d+ 个项目请点总览\n查看全部：https:\/\/console.example.test\/#\/project-overview$/)
})
