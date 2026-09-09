import { randomUUID } from 'node:crypto'
import { afterAll, expect, it } from 'vitest'
import { parseEnv } from '../../config/env.js'
import { createPrisma } from '../../plugins/prisma.js'
import { DingtalkDirectory } from './dingtalk-directory.js'
import type { DingIdentity } from './dingtalk-client.js'

const env = parseEnv(process.env)
if (env.NODE_ENV !== 'test' || !new URL(env.DATABASE_URL).searchParams.get('schema')?.startsWith('itpc_test_') || !env.S3_BUCKET.startsWith('itpc-test-')) throw new Error('必须通过隔离入口')
const db = createPrisma(env.DATABASE_URL)
afterAll(() => db.$disconnect())

it.each(['信息技术部', 'IT部'])('%s：完整快照、稳定身份、角色映射、首次管理员、冲突回滚及离职撤会话', async (itDepartmentName) => {
  const prefix = randomUUID()
  const identity = (suffix: string, department = '902'): DingIdentity => ({ userId: `${prefix}-${suffix}`, unionId: `${prefix}-union-${suffix}`, name: '陈立峰', departmentIds: [department], active: true })
  let users = [identity('admin'), identity('business', '903')]
  let fail = false
  const client = {
    legacy: async (path: string, body: unknown): Promise<Record<string, unknown>> => {
      if (fail) throw new Error('分页权限失败')
      const input = body as { dept_id: number }
      if (path.endsWith('department/get')) return { result: { name: '测试企业' } }
      if (path.endsWith('listsub')) return { result: input.dept_id === 1 ? [{ dept_id: 902, parent_id: 1, name: itDepartmentName }, { dept_id: 903, parent_id: 1, name: '市场部' }] : [] }
      return { result: { list: users.filter(u => u.departmentIds.includes(String(input.dept_id))).map(u => ({ userid: u.userId })), has_more: false } }
    },
    staff: async (id: string) => {
      const user = users.find(u => u.userId === id)
      if (!user) throw new Error('企业不存在此人')
      return user
    }
  }
  const initialGrants = await db.managerGrant.findMany()
  const directory = new DingtalkDirectory(db, client, { corpId: prefix, bootstrapAdminId: users[0]!.userId })
  const adminIdentity = users[0]!
  const businessIdentity = users[1]!
  try {
    // Keep the development seed's manager grant: it must not block company bootstrap.
    const result = await directory.sync()
    expect(result.bootstrapAdminInitialized).toBe(true)
    const admin = await directory.resolve(adminIdentity)
    const business = await directory.resolve(businessIdentity)
    expect(admin.role).toBe('MANAGER')
    expect(business.role).toBe('BUSINESS')
    expect(admin.id).not.toBe('user-manager-chen')
    expect((await db.user.findUniqueOrThrow({ where: { id: 'user-manager-chen' } })).dingUnionId).toBeNull()
    expect((await directory.sync()).bootstrapAdminInitialized).toBe(false)
    await db.managerGrant.update({ where: { userId: admin.id }, data: { active: false } })
    await directory.sync()
    expect((await directory.resolve(adminIdentity)).role).toBe('ENGINEER')
    expect((await db.managerGrant.findUniqueOrThrow({ where: { userId: admin.id } })).active).toBe(false)
    users = [adminIdentity, { ...businessIdentity, departmentIds: ['902'] }]
    expect((await directory.resolve(businessIdentity)).role).toBe('ENGINEER')
    await expect(directory.resolve({ ...adminIdentity, unionId: 'foreign' })).rejects.toMatchObject({ statusCode: 403 })
    await expect(new DingtalkDirectory(db, client, { corpId: 'foreign' }).resolve(adminIdentity)).rejects.toMatchObject({ statusCode: 403 })
    const before = await db.systemSetting.findUniqueOrThrow({ where: { key: 'dingtalk.directory' } })
    fail = true
    await expect(directory.sync()).rejects.toThrow('分页权限失败')
    expect((await db.systemSetting.findUniqueOrThrow({ where: { key: 'dingtalk.directory' } })).value).toEqual(before.value)
    expect((await db.user.findUniqueOrThrow({ where: { id: admin.id } })).active).toBe(true)
    fail = false
    users = [{ ...adminIdentity, unionId: 'conflicting-union' }, businessIdentity]
    await expect(directory.sync()).rejects.toMatchObject({ statusCode: 409 })
    expect((await db.user.findUniqueOrThrow({ where: { id: admin.id } })).dingUnionId).toBe(adminIdentity.unionId)
    users = [businessIdentity]
    await db.managerGrant.update({ where: { userId: admin.id }, data: { active: true } })
    await db.session.create({ data: { userId: admin.id, tokenHash: randomUUID(), expiresAt: new Date(Date.now() + 100000) } })
    expect((await directory.sync()).managerMissing).toBe(true)
    expect((await db.user.findUniqueOrThrow({ where: { id: admin.id } })).active).toBe(false)
    expect((await db.managerGrant.findUniqueOrThrow({ where: { userId: admin.id } })).active).toBe(false)
    expect(await db.session.count({ where: { userId: admin.id } })).toBe(0)
    users = [adminIdentity, businessIdentity]
    await directory.sync()
    expect((await directory.resolve(adminIdentity)).role).toBe('ENGINEER')
  } finally {
    const saved = await db.user.findMany({ where: { dingUserId: { startsWith: prefix } }, select: { id: true } })
    await db.auditLog.deleteMany({ where: { OR: [{ entityId: prefix }, { entityId: { in: saved.map(u => u.id) } }] } })
    await db.managerGrant.deleteMany({ where: { userId: { in: saved.map(u => u.id) } } })
    await db.user.deleteMany({ where: { id: { in: saved.map(u => u.id) } } })
    await db.department.deleteMany({ where: { dingDeptId: { in: ['1', '902', '903'] } } })
    await db.systemSetting.deleteMany({ where: { key: { in: ['dingtalk.directory', 'dingtalk.bootstrap-admin'] } } })
    await db.managerGrant.createMany({ data: initialGrants, skipDuplicates:true })
  }
})
