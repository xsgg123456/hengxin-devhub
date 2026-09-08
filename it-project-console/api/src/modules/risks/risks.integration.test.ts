import { randomUUID } from 'node:crypto'
import { afterAll, expect, it } from 'vitest'
import { parseEnv } from '../../config/env.js'
import { createPrisma } from '../../plugins/prisma.js'
import { refreshProjectRisks, scanProjectRisks } from './risk-scan-job.js'
const env = parseEnv(process.env)
if (
  env.NODE_ENV !== 'test' ||
  !new URL(env.DATABASE_URL).searchParams.get('schema')?.startsWith('itpc_test_') ||
  !env.S3_BUCKET.startsWith('itpc-test-')
)
  throw new Error('必须通过隔离入口')
const db = createPrisma(env.DATABASE_URL)
const now = new Date('2026-09-16T04:00:00Z')
async function project() {
  return db.project.create({
    data: {
      id: randomUUID(),
      name: '风险边界项目',
      primaryOwnerId: 'user-engineer-wang',
      stageExpectedDate: new Date('2026-09-14'),
      currentDeliveryDate: new Date('2026-10-01'),
      originalDeliveryDate: new Date('2026-10-01'),
      createdAt: new Date('2026-09-11T04:00:00Z'),
      lastOverallUpdatedAt: new Date('2026-09-11T04:00:00Z'),
      members: { create: { userId: 'user-engineer-zhao' } }
    }
  })
}
afterAll(() => db.$disconnect())
it('并发扫描只写一个风险版本，同状态重扫不重复收件通知', async () => {
  const row = await project()
  await Promise.all([scanProjectRisks(db, now), scanProjectRisks(db, now)])
  const updated = await db.project.findUniqueOrThrow({ where: { id: row.id } })
  expect(updated.risks).toEqual(['环节延期 2 天', '已有 3 个工作日未更新整体进度'])
  expect(updated.riskVersion).toBe(1)
  expect(await db.riskSnapshot.count({ where: { projectId: row.id } })).toBe(1)
  const messages = await db.notificationOutbox.findMany({ where: { projectId: row.id } })
  expect(messages.map((message) => message.recipientId).sort()).toEqual([
    'user-engineer-wang',
    'user-manager-chen'
  ])
  await scanProjectRisks(db, now)
  expect(await db.notificationOutbox.count({ where: { projectId: row.id } })).toBe(2)
  await db.$transaction(async (tx) => {
    await tx.project.update({
      where: { id: row.id },
      data: { currentDeliveryDate: new Date('2026-10-02') }
    })
    await tx.scheduleChange.create({
      data: {
        projectId: row.id,
        authorId: 'user-manager-chen',
        field: 'expectedDeliveryDate',
        oldValue: '2026-10-01',
        newValue: '2026-10-02',
        reason: '其他',
        description: 'fixture历史'
      }
    })
    await refreshProjectRisks(tx, row.id, now)
  })
  expect(
    await db.notificationOutbox.count({
      where: { projectId: row.id, recipientId: 'user-engineer-wang' }
    })
  ).toBe(1)
  expect(
    await db.notificationOutbox.count({
      where: { projectId: row.id, recipientId: 'user-manager-chen' }
    })
  ).toBe(2)
})
it('风险解除保留历史不发送空提醒，再发生分配新版本', async () => {
  const row = await project()
  await db.$transaction((tx) => refreshProjectRisks(tx, row.id, now))
  await db.project.update({ where: { id: row.id }, data: { archived: true } })
  await scanProjectRisks(db, now)
  expect((await db.project.findUniqueOrThrow({ where: { id: row.id } })).risks).toEqual([])
  expect(await db.notificationOutbox.count({ where: { projectId: row.id } })).toBe(2)
  await db.project.update({ where: { id: row.id }, data: { archived: false } })
  await scanProjectRisks(db, now)
  expect((await db.project.findUniqueOrThrow({ where: { id: row.id } })).riskVersion).toBe(3)
  expect(await db.riskSnapshot.count({ where: { projectId: row.id } })).toBe(3)
  expect(await db.notificationOutbox.count({ where: { projectId: row.id } })).toBe(4)
})
it('扫描锁被持有时跳过，故障事务不留下快照和通知', async () => {
  const row = await project()
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(current_schema() || ':project-risk-scan', 0))::text`
    expect((await scanProjectRisks(db, now)).skipped).toBe(true)
  })
  await expect(
    db.$transaction(async (tx) => {
      await refreshProjectRisks(tx, row.id, now)
      throw new Error('模拟事务故障')
    })
  ).rejects.toThrow('模拟事务故障')
  expect((await db.project.findUniqueOrThrow({ where: { id: row.id } })).riskVersion).toBe(0)
  expect(await db.riskSnapshot.count({ where: { projectId: row.id } })).toBe(0)
  expect(await db.notificationOutbox.count({ where: { projectId: row.id } })).toBe(0)
})
it('运行时工作日配置从数据库读取，阈值变化重算', async () => {
  const row = await project()
  try {
    await db.systemSetting.create({
      data: { key: 'risk-policy', value: { staleWorkdays: 4, weekdays: [1, 2, 3, 4, 5] } }
    })
    await db.$transaction((tx) => refreshProjectRisks(tx, row.id, now))
    expect((await db.project.findUniqueOrThrow({ where: { id: row.id } })).risks).toEqual([
      '环节延期 2 天'
    ])
  } finally {
    await db.systemSetting.deleteMany({ where: { key: 'risk-policy' } })
  }
})
