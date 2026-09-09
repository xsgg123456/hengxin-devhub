import { randomUUID } from 'node:crypto'
import { afterAll, expect, it } from 'vitest'
import { parseEnv } from '../../config/env.js'
import { createPrisma } from '../../plugins/prisma.js'
import type { Actor } from '../../plugins/auth.js'
import { ManagerGrantService } from './manager-grant-service.js'
import { buildApp } from '../../app.js'

const env = parseEnv(process.env)
if (
  env.NODE_ENV !== 'test' ||
  !new URL(env.DATABASE_URL).searchParams.get('schema')?.startsWith('itpc_test_') ||
  !env.S3_BUCKET.startsWith('itpc-test-')
)
  throw new Error('必须通过隔离入口')
const db = createPrisma(env.DATABASE_URL)
const service = new ManagerGrantService(db)
afterAll(() => db.$disconnect())
const manager: Actor = {
  id: 'user-manager-chen',
  name: '陈立峰',
  department: '信息技术部',
  role: 'MANAGER',
  active: true
}
const business: Actor = { ...manager, id: 'user-business-li', role: 'BUSINESS' }
const input = (userId: string, enabled: boolean) => ({ userId, enabled, requestId: randomUUID() })

it('IT部成员撤销管理员后恢复工程师权限', async () => {
  const id = randomUUID(), departmentId = randomUUID()
  await db.department.create({ data: { id: departmentId, name: 'IT部' } })
  await db.user.create({ data: { id, name: '真实部门回归', department: 'IT部', departmentId, role: 'ENGINEER' } })
  try {
    await service.set(manager, input(id, true))
    expect((await db.user.findUniqueOrThrow({ where: { id } })).role).toBe('MANAGER')
    await service.set(manager, input(id, false))
    expect((await db.user.findUniqueOrThrow({ where: { id } })).role).toBe('ENGINEER')
  } finally {
    await db.managerGrant.deleteMany({ where: { userId: id } })
    await db.auditLog.deleteMany({ where: { entityId: id } })
    await db.user.delete({ where: { id } })
    await db.department.delete({ where: { id: departmentId } })
  }
})

it('企业模式排除样例授权且始终保留真实管理员，允许清理遗留样例授权', async () => {
  const ids = Array.from({ length: 3 }, () => randomUUID())
  const [firstId, secondId] = ids as [string, string, string]
  const enterpriseManager: Actor = { ...manager, id: firstId }
  const seedManager = await db.user.findUniqueOrThrow({ where: { id: manager.id } })
  expect(await db.systemSetting.findUnique({ where: { key: 'dingtalk.directory' } })).toBeNull()
  try {
    await db.user.createMany({ data: ids.map((id, index) => ({
      id, name: `企业授权回归${index}`, department: '信息技术部', departmentId: seedManager.departmentId,
      dingUnionId: `grant-union-${id}`, active: index !== 2,
      role: index === 0 ? 'MANAGER' as const : 'ENGINEER' as const
    })) })
    await db.managerGrant.create({ data: { userId: firstId, active: true } })
    await db.systemSetting.create({ data: { key: 'dingtalk.directory', value: { userIds: ids } } })
    // Keep the seed grant active: it must never count toward enterprise availability.
    expect((await db.managerGrant.findUniqueOrThrow({ where: { userId: manager.id } })).active).toBe(true)
    expect((await service.list(enterpriseManager)).map((user) => user.id)).toEqual([firstId])
    expect((await service.candidates(enterpriseManager)).map((user) => user.id)).toEqual([secondId])
    await expect(service.candidates(manager)).rejects.toMatchObject({ statusCode: 403 })
    await expect(service.set(manager, input(secondId, true))).rejects.toMatchObject({ statusCode: 403 })
    await expect(service.set(enterpriseManager, input(business.id, true))).rejects.toMatchObject({ code: 'INVALID_MEMBER' })
    await expect(service.set(enterpriseManager, input(firstId, false))).rejects.toMatchObject({ code: 'LAST_MANAGER' })
    await service.set(enterpriseManager, input(manager.id, false))
    expect((await db.managerGrant.findUniqueOrThrow({ where: { userId: firstId } })).active).toBe(true)
    await service.set(enterpriseManager, input(secondId, true))
    await service.set(enterpriseManager, input(firstId, false))
    expect((await service.list({ ...manager, id: secondId })).map((user) => user.id)).toEqual([secondId])
    await expect(service.set({ ...manager, id: secondId }, input(secondId, false))).rejects.toMatchObject({ code: 'LAST_MANAGER' })
  } finally {
    await db.systemSetting.deleteMany({ where: { key: 'dingtalk.directory' } })
    await db.user.update({ where: { id: manager.id }, data: { role: 'MANAGER' } })
    await db.managerGrant.update({ where: { userId: manager.id }, data: { active: true } })
    await db.managerGrant.deleteMany({ where: { userId: { in: ids } } })
    await db.auditLog.deleteMany({ where: { actorId: { in: ids } } })
    await db.commandReceipt.deleteMany({ where: { actorId: { in: ids } } })
    await db.user.deleteMany({ where: { id: { in: ids } } })
  }
})

it('组织名单只读、真实授权、幂等、审计、撤销回落与并发最后管理员保护', async () => {
  const id = randomUUID()
  await db.user.create({
    data: {
      id,
      name: '名单集成测试',
      department: '市场运营部',
      departmentId: 'department-marketing'
    }
  })
  try {
    expect((await service.list(business)).length).toBeGreaterThan(0)
    await expect(service.candidates(business)).rejects.toMatchObject({ statusCode: 403 })
    await expect(service.set(business, input(id, true))).rejects.toMatchObject({ statusCode: 403 })
    await expect(service.set(manager, input('missing-member', true))).rejects.toMatchObject({
      statusCode: 422
    })
    await db.user.update({ where: { id }, data: { active: false } })
    expect((await service.candidates(manager)).some((user) => user.id === id)).toBe(false)
    await expect(service.set(manager, input(id, true))).rejects.toMatchObject({ statusCode: 422 })
    await db.user.update({ where: { id }, data: { active: true } })
    const grant = input(id, true)
    await service.set(manager, grant)
    await service.set(manager, grant)
    expect((await db.user.findUniqueOrThrow({ where: { id } })).role).toBe('MANAGER')
    expect(await db.auditLog.count({ where: { entityId: id } })).toBe(1)
    await expect(service.set(manager, { ...grant, enabled: false })).rejects.toMatchObject({
      statusCode: 409
    })
    await service.set(manager, input(id, false))
    expect((await db.user.findUniqueOrThrow({ where: { id } })).role).toBe('BUSINESS')
    expect(
      (await db.auditLog.findFirstOrThrow({ where: { entityId: id, action: 'revoke' } })).payload
    ).toEqual({
      old: { enabled: true, role: 'MANAGER' },
      new: { enabled: false, role: 'BUSINESS' }
    })
    await expect(service.set(manager, input(manager.id, false))).rejects.toMatchObject({
      statusCode: 409
    })
    await service.set(manager, input(id, true))
    const second: Actor = { ...manager, id }
    const results = await Promise.allSettled([
      service.set(manager, input(manager.id, false)),
      service.set(second, input(id, false))
    ])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(await db.managerGrant.count({ where: { active: true, user: { active: true } } })).toBe(1)
    const removed = await db.user.findFirstOrThrow({
      where: { id: { in: [id, manager.id] }, role: { not: 'MANAGER' } }
    })
    await expect(
      service.set({ ...manager, id: removed.id }, input(removed.id, true))
    ).rejects.toMatchObject({ statusCode: 403 })
  } finally {
    await db.user.update({ where: { id: manager.id }, data: { role: 'MANAGER' } })
    await db.managerGrant.update({ where: { userId: manager.id }, data: { active: true } })
    await db.managerGrant.deleteMany({ where: { userId: id } })
    await db.auditLog.deleteMany({ where: { OR: [{ entityId: id }, { actorId: id }] } })
    await db.commandReceipt.deleteMany({ where: { actorId: id } })
    await db.user.delete({ where: { id } })
  }
})

it('HTTP鉴权、入参校验与已登录会话在授权撤销后立即识别角色', async () => {
  const { app } = await buildApp(env, { logging: false })
  const headers = { origin: env.WEB_ORIGIN }
  const login = async (userId: string) => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/dev-login',
      headers,
      payload: { userId }
    })
    expect(response.statusCode).toBe(200)
    const cookie = response.cookies.find((item) => item.name === 'itpc_session')!
    return { ...headers, cookie: `itpc_session=${cookie.value}` }
  }
  try {
    expect((await app.inject('/api/manager-grants')).statusCode).toBe(401)
    const managerHeaders = await login(manager.id)
    const businessHeaders = await login(business.id)
    expect(
      (await app.inject({ url: '/api/manager-grants', headers: businessHeaders })).statusCode
    ).toBe(200)
    expect(
      (await app.inject({ url: '/api/manager-grants/candidates', headers: businessHeaders }))
        .statusCode
    ).toBe(403)
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/manager-grants',
          headers: managerHeaders,
          payload: { userId: business.id, enabled: true }
        })
      ).statusCode
    ).toBe(400)
    const post = (enabled: boolean) =>
      app.inject({
        method: 'POST',
        url: '/api/manager-grants',
        headers: managerHeaders,
        payload: input(business.id, enabled)
      })
    expect((await post(true)).statusCode).toBe(200)
    expect((await app.inject({ url: '/api/me', headers: businessHeaders })).json().data.role).toBe(
      'MANAGER'
    )
    expect((await post(false)).statusCode).toBe(200)
    expect((await app.inject({ url: '/api/me', headers: businessHeaders })).json().data.role).toBe(
      'BUSINESS'
    )
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/manager-grants',
          headers: businessHeaders,
          payload: input(business.id, true)
        })
      ).statusCode
    ).toBe(403)
  } finally {
    await db.user.update({ where: { id: business.id }, data: { role: 'BUSINESS' } })
    await db.managerGrant.updateMany({ where: { userId: business.id }, data: { active: false } })
    await app.close()
  }
})
