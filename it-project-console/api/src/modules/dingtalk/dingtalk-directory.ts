import { isItDepartment } from '../../lib/it-department.js'
import type { PrismaClient, Prisma } from '../../generated/prisma/client.js'
import { AppError } from '../../lib/errors.js'
import type { DingTalkClient, DingIdentity } from './dingtalk-client.js'
import { bootstrapAdmin } from './bootstrap-admin.js'

type Client = Pick<DingTalkClient, 'legacy' | 'staff'>
type Department = { id: string; name: string; parentId: string | null }
const invalid = () => new AppError(502, 'DINGTALK_DATA', '钉钉通讯录数据不完整，请稍后重试')
const denied = () => new AppError(403, 'DINGTALK_MEMBER', '仅限已同步且有效的本公司成员使用')
const conflict = () => new AppError(409, 'DINGTALK_IDENTITY_CONFLICT', '钉钉身份与现有账号冲突，请联系管理员')
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid()
  return value as Record<string, unknown>
}
function deptId(value: unknown) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) throw invalid()
  return String(value)
}
export async function directoryMap<T, R>(items: T[], worker: (item: T) => Promise<R>): Promise<R[]> {
  const output: R[] = new Array(items.length)
  let cursor = 0
  await Promise.all(Array.from({ length: Math.min(5, items.length) }, async () => {
    while (cursor < items.length) { const i = cursor++; output[i] = await worker(items[i]!) }
  }))
  return output
}
export async function fetchDirectory(client: Client) {
  const root = record((await client.legacy('/topapi/v2/department/get', { dept_id: 1 })).result)
  if (typeof root.name !== 'string' || !root.name.trim()) throw invalid()
  const departments: Department[] = [{ id: '1', name: root.name.trim(), parentId: null }]
  const seen = new Set(['1'])
  for (let i = 0; i < departments.length; i++) {
    const parentId = departments[i]!.id
    const result = (await client.legacy('/topapi/v2/department/listsub', { dept_id: Number(parentId) })).result
    if (!Array.isArray(result)) throw invalid()
    for (const item of result) {
      const row = record(item), id = deptId(row.dept_id)
      if (seen.has(id) || typeof row.name !== 'string' || !row.name.trim()) throw invalid()
      if (row.parent_id !== undefined && deptId(row.parent_id) !== parentId) throw invalid()
      seen.add(id); departments.push({ id, name: row.name.trim(), parentId })
      if (departments.length > 2000) throw invalid()
    }
  }
  const staffIds = new Set<string>()
  for (const department of departments) {
    let cursor = 0, complete = false
    for (let page = 0; page < 100; page++) {
      const result = record((await client.legacy('/topapi/user/listsimple', {
        dept_id: Number(department.id), cursor, size: 100, order_field: 'entry_asc'
      })).result)
      if (!Array.isArray(result.list) || typeof result.has_more !== 'boolean') throw invalid()
      for (const item of result.list) {
        const id = record(item).userid
        if (typeof id !== 'string' || !id.trim()) throw invalid()
        staffIds.add(id)
      }
      if (!result.has_more) { complete = true; break }
      if (typeof result.next_cursor !== 'number' || !Number.isSafeInteger(result.next_cursor) || result.next_cursor <= cursor) throw invalid()
      cursor = result.next_cursor
    }
    if (!complete) throw invalid()
  }
  const users = await directoryMap([...staffIds], async id => {
    const user = await client.staff(id)
    if (user.userId !== id || !user.unionId || !user.name || !user.departmentIds.length || user.departmentIds.some(id => !seen.has(id))) throw invalid()
    return user
  })
  if (new Set(users.map(user => user.unionId)).size !== users.length) throw conflict()
  return { departments, users }
}

export class DingtalkDirectory {
  constructor(private readonly db: PrismaClient, private readonly client: Client,
    private readonly options: { corpId: string; bootstrapAdminId?: string }) {}

  async sync(actorId?: string) {
    if (!this.options.corpId.trim()) throw denied()
    // Serialize fetching too: an older snapshot cannot overwrite a newer completed sync.
    return this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended('dingtalk-directory', 0))::text`
      if (actorId) {
        const actor = await tx.user.findUnique({ where: { id: actorId }, include: { managerGrant: true } })
        if (!actor?.active || !actor.managerGrant?.active) throw denied()
      }
      const snapshot = await fetchDirectory(this.client)
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended('manager-grants', 0))::text`
      if (actorId) {
        const actor = await tx.user.findUnique({ where: { id: actorId }, include: { managerGrant: true } })
        if (!actor?.active || !actor.managerGrant?.active) throw denied()
      }
      const setting = await tx.systemSetting.findUnique({ where: { key: 'dingtalk.directory' } })
      if (setting && record(setting.value).corpId !== this.options.corpId) throw conflict()
      const departmentMap = new Map<string, { id: string; name: string }>()
      for (const department of snapshot.departments) {
        const saved = await tx.department.upsert({ where: { dingDeptId: department.id },
          create: { dingDeptId: department.id, name: department.name }, update: { name: department.name } })
        departmentMap.set(department.id, saved)
      }
      const ids: string[] = []
      for (const identity of snapshot.users) {
        const matches = await tx.user.findMany({ where: { OR: [{ dingUserId: identity.userId }, { dingUnionId: identity.unionId }] }, include: { managerGrant: true } })
        if (matches.length > 1) throw conflict()
        const existing = matches[0]
        if (existing?.dingUnionId && existing.dingUnionId !== identity.unionId) throw conflict()
        const department = identity.departmentIds.map(id => departmentMap.get(id)!).find(d => isItDepartment(d.name)) ?? departmentMap.get(identity.departmentIds[0]!)!
        const role = identity.active && existing?.managerGrant?.active ? 'MANAGER' : isItDepartment(department.name) ? 'ENGINEER' : 'BUSINESS'
        const data = { name: identity.name, dingUserId: identity.userId, dingUnionId: identity.unionId,
          department: department.name, departmentId: department.id, active: identity.active, role } as const
        const saved = existing ? await tx.user.update({ where: { id: existing.id }, data }) : await tx.user.create({ data })
        ids.push(saved.id)
      }
      const missing = await tx.user.findMany({ where: { dingUnionId: { not: null }, id: { notIn: ids } }, select: { id: true } })
      const disabledIds = [...missing.map(u => u.id), ...await tx.user.findMany({ where: { id: { in: ids }, active: false }, select: { id: true } }).then(users => users.map(u => u.id))]
      await tx.user.updateMany({ where: { id: { in: disabledIds } }, data: { active: false, role: 'BUSINESS' } })
      await tx.managerGrant.updateMany({ where: { userId: { in: disabledIds } }, data: { active: false } })
      await tx.session.deleteMany({ where: { userId: { in: disabledIds } } })
      const bootstrapAdminInitialized = await bootstrapAdmin(tx, this.options.bootstrapAdminId)
      const result = { departments: snapshot.departments.length, users: ids.length, disabled: disabledIds.length,
        syncedAt: new Date().toISOString(), bootstrapAdminInitialized,
        managerMissing: await tx.managerGrant.count({ where: { active: true, user: { active: true, dingUnionId:{not:null} } } }) === 0 }
      const value = { corpId: this.options.corpId, userIds: ids, departmentTree: snapshot.departments, ...result }
      await tx.systemSetting.upsert({ where: { key: 'dingtalk.directory' }, create: { key: 'dingtalk.directory', value }, update: { value } })
      await tx.auditLog.create({ data: { actorId, action: 'sync', entityType: 'dingtalk_directory', entityId: this.options.corpId, payload: result } })
      return result
    }, { maxWait: 10000, timeout: 180000 })
  }

  async resolve(identity: DingIdentity) {
    if (!identity.active || !identity.userId || !identity.unionId) throw denied()
    const verified = await this.client.staff(identity.userId)
    if (!verified.active || verified.userId !== identity.userId || verified.unionId !== identity.unionId) throw denied()
    return this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended('dingtalk-directory', 0))::text`
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended('manager-grants', 0))::text`
      const setting = await tx.systemSetting.findUnique({ where: { key: 'dingtalk.directory' } })
      if (!setting || record(setting.value).corpId !== this.options.corpId) throw denied()
      const user = await tx.user.findUnique({ where: { dingUserId: verified.userId }, include: { managerGrant: true } })
      const ids = record(setting.value).userIds
      if (!user?.active || user.dingUnionId !== verified.unionId || !Array.isArray(ids) || !ids.includes(user.id)) throw denied()
      return this.refreshRole(tx, user.id, verified, user.managerGrant?.active ?? false)
    })
  }

  private async refreshRole(tx: Prisma.TransactionClient, userId: string, identity: DingIdentity, manager: boolean) {
    const departments = await tx.department.findMany({ where: { dingDeptId: { in: identity.departmentIds } } })
    if (!departments.length) throw denied()
    const department = departments.find(d => isItDepartment(d.name)) ?? departments.find(d => d.dingDeptId === identity.departmentIds[0])
    if (!department) throw denied()
    return tx.user.update({ where: { id: userId }, data: { name: identity.name, department: department.name,
      departmentId: department.id, role: manager ? 'MANAGER' : isItDepartment(department.name) ? 'ENGINEER' : 'BUSINESS' } })
  }
}
