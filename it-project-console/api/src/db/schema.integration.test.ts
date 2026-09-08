import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { parseEnv } from '../config/env.js'
import { createPrisma } from '../plugins/prisma.js'
import { seedDevelopment } from './seed.js'

const env = parseEnv(process.env)
if (
  env.NODE_ENV !== 'test' ||
  !new URL(env.DATABASE_URL).searchParams.get('schema')?.startsWith('itpc_test_') ||
  !env.S3_BUCKET.startsWith('itpc-test-')
)
  throw new Error('必须由隔离集成测试入口运行')
const db = createPrisma(env.DATABASE_URL)
afterAll(async () => {
  await db.$disconnect()
})

describe('real PostgreSQL foundation constraints', () => {
  it('uses the isolated schema for both raw SQL and ORM data', async () => {
    const schema = new URL(env.DATABASE_URL).searchParams.get('schema')
    expect(schema).toBeTruthy()
    expect(schema).not.toBe('public')
    const current = await db.$queryRaw<{ schema: string }[]>`SELECT current_schema() AS schema`
    expect(current[0]?.schema).toBe(schema)
    const tables = await db.$queryRaw<{ schema: string }[]>`
      SELECT DISTINCT n.nspname AS schema FROM users u
      JOIN pg_class c ON c.oid = u.tableoid JOIN pg_namespace n ON n.oid = c.relnamespace`
    expect(tables).toEqual([{ schema }])
    expect(await db.user.count()).toBe(4)
  })

  it('repeated seed preserves existing user edits and unique fixture relationships', async () => {
    const id = 'user-engineer-zhao'
    const user = await db.user.findUniqueOrThrow({ where: { id } })
    try {
      await db.user.update({
        where: { id },
        data: { name: '用户编辑后的名字' }
      })
      await seedDevelopment(db)
      await seedDevelopment(db)
      expect((await db.user.findUniqueOrThrow({ where: { id } })).name).toBe('用户编辑后的名字')
      expect(await db.user.count()).toBe(4)
      expect(
        await db.managerGrant.count({
          where: { userId: 'user-manager-chen', active: true }
        })
      ).toBe(1)
      expect(
        await db.projectMember.count({
          where: { projectId: 'project-demo', userId: id }
        })
      ).toBe(1)
      expect(
        (await db.project.findUniqueOrThrow({ where: { id: 'project-demo' } })).primaryOwnerId
      ).toBe('user-engineer-wang')
    } finally {
      await db.user.update({ where: { id }, data: { name: user.name } })
    }
  })

  it('outbox and a business write roll back together when idempotency collides', async () => {
    const key = `outbox-test-${randomUUID()}`
    const demandId = `demand-test-${randomUUID()}`
    const data = {
      recipientId: 'user-manager-chen',
      eventType: 'TEST',
      idempotencyKey: key,
      payload: { test: true }
    }
    await db.notificationOutbox.create({ data })
    try {
      await expect(
        db.$transaction(async (tx) => {
          await tx.demand.create({
            data: {
              id: demandId,
              name: '事务回滚测试',
              ownerId: 'user-business-li'
            }
          })
          await tx.notificationOutbox.create({ data })
        })
      ).rejects.toMatchObject({ code: 'P2002' })
      expect(await db.demand.findUnique({ where: { id: demandId } })).toBeNull()
      expect(await db.notificationOutbox.count({ where: { idempotencyKey: key } })).toBe(1)
    } finally {
      await db.notificationOutbox.deleteMany({
        where: { idempotencyKey: key }
      })
      await db.demand.deleteMany({ where: { id: demandId } })
    }
  })

  it('a demand can produce only one project', async () => {
    const demandId = `demand-test-${randomUUID()}`
    await db.demand.create({
      data: { id: demandId, name: '唯一立项测试', ownerId: 'user-business-li' }
    })
    const data = {
      name: '唯一项目',
      demandId,
      primaryOwnerId: 'user-engineer-wang'
    }
    try {
      await db.project.create({ data })
      await expect(db.project.create({ data })).rejects.toMatchObject({
        code: 'P2002'
      })
      expect(await db.project.count({ where: { demandId } })).toBe(1)
    } finally {
      await db.project.deleteMany({ where: { demandId } })
      await db.demand.delete({ where: { id: demandId } })
    }
  })

  it('rejects duplicate memberships and missing referenced users', async () => {
    await expect(
      db.projectMember.create({
        data: { projectId: 'project-demo', userId: 'user-engineer-zhao' }
      })
    ).rejects.toMatchObject({ code: 'P2002' })
    await expect(
      db.projectMember.create({
        data: { projectId: 'project-demo', userId: `missing-${randomUUID()}` }
      })
    ).rejects.toMatchObject({ code: 'P2003' })
    await expect(
      db.project.create({
        data: { name: '无效主责', primaryOwnerId: `missing-${randomUUID()}` }
      })
    ).rejects.toMatchObject({ code: 'P2003' })
  })
})
