// Run inside the API container from /app; credentials stay in its environment.
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
const { createPrisma } = await import(pathToFileURL(`${process.cwd()}/dist/plugins/prisma.js`))
const { canApproveProjects } = await import(pathToFileURL(`${process.cwd()}/dist/lib/project-approver.js`))
const args = process.argv.slice(2)
const option = name => args[args.indexOf(name) + 1]
for (const name of ['--user-id', '--ding-user-id', '--source-id', '--source-ding-id', '--reason', '--action']) {
  assert(args.includes(name) && option(name) && !option(name).startsWith('--'), `缺少参数：${name}`)
}
assert(['grant', 'revoke'].includes(option('--action')), '操作必须是 grant 或 revoke')
assert(process.env.NODE_ENV === 'production', '此入口仅用于已核对的生产运维')
const db = createPrisma(process.env.DATABASE_URL)
const select = { id: true, name: true, dingUserId: true, department: true, role: true,
  active: true, maintenanceAdmin: true, managerGrant: true }
try {
  const result = await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended('dingtalk-directory', 0))::text`
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended('manager-grants', 0))::text`
    const source = await tx.user.findUniqueOrThrow({ where: { id: option('--source-id') }, select })
    const target = await tx.user.findUniqueOrThrow({ where: { id: option('--user-id') }, select })
    assert.equal(source.dingUserId, option('--source-ding-id'), '参照人员钉钉身份不符')
    assert.equal(target.dingUserId, option('--ding-user-id'), '目标人员钉钉身份不符')
    assert.notEqual(source.id, target.id, '目标与参照人员不得相同')
    assert(canApproveProjects(source, process.env.PROJECT_APPROVER_DING_USER_ID ?? ''), '参照人员无指定操作权限')
    const enabled = option('--action') === 'grant'
    if (enabled) {
      assert(target.active && target.role === 'ENGINEER', '目标必须是有效工程师，禁止改角色')
      assert(!target.managerGrant?.active, '目标已有管理名单授权，需先核对现状')
    }
    if (!args.includes('--apply')) return { dryRun: true, before: target, requested: { maintenanceAdmin: enabled } }
    if (target.maintenanceAdmin === enabled) return { changed: false, after: target }
    const after = await tx.user.update({ where: { id: target.id }, data: { maintenanceAdmin: enabled }, select })
    assert.equal(after.role, target.role)
    assert.deepEqual(after.managerGrant, target.managerGrant)
    const audit = await tx.auditLog.create({ data: {
      actorId: null, action: enabled ? 'grant' : 'revoke', entityType: 'maintenance_access', entityId: target.id,
      payload: { authorization: '用户在运维会话中明确授权', reason: option('--reason'), sourceUserId: source.id,
        targetDingUserId: target.dingUserId, old: { maintenanceAdmin: target.maintenanceAdmin, role: target.role },
        new: { maintenanceAdmin: enabled, role: after.role }, execution: 'maintenance-access.mjs' }
    } })
    return { changed: true, before: target, after, auditId: audit.id }
  })
  console.log(JSON.stringify(result, null, 2))
} finally { await db.$disconnect() }
