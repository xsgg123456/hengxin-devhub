import { mapProject } from '../workspace/read-model.js'
import { projectEditSchema } from '../projects/project-edit-schemas.js'
import { randomUUID, randomBytes, createHash } from 'node:crypto'
import { beforeAll, afterAll, expect, it } from 'vitest'
import { buildApp } from '../../app.js'
import { parseEnv } from '../../config/env.js'
import { createPrisma } from '../../plugins/prisma.js'
import { NotificationService } from '../notifications/notification-service.js'

const base = parseEnv(process.env)
if (base.NODE_ENV !== 'test' || !new URL(base.DATABASE_URL).searchParams.get('schema')?.startsWith('itpc_test_') || !base.S3_BUCKET.startsWith('itpc-test-')) throw new Error('必须通过隔离入口')
const db = createPrisma(base.DATABASE_URL)
const approver = randomUUID(), other = randomUUID(), employee = randomUUID()
const deputy = randomUUID(), deputyEmployee = randomUUID()
const env = { ...base, PROJECT_APPROVER_DING_USER_ID: employee }
let runtime: Awaited<ReturnType<typeof buildApp>>
const cookies: Record<string, string> = {}
const owner = 'user-engineer-wang'
const input = () => ({ requestId: randomUUID(), name: '审批边界回归', department: 'IT部', primaryOwnerId: owner, collaboratorIds: [], priority: 'P1', approvedLaunchDate: '2099-10-08' })
function call(path: string, payload?: Record<string, unknown>, user: string = approver) {
  return runtime.app.inject({ method: payload ? 'POST' : 'GET', url: path, payload, headers: { cookie: cookies[user] ?? '', origin: env.WEB_ORIGIN } })
}
beforeAll(async () => {
  await db.user.createMany({ data: [
    { id: approver, name: '审批人同名测试', department: 'IT部', role: 'MANAGER', dingUserId: employee },
    { id: deputy, name: '维护管理员', department: 'IT部', role: 'ENGINEER', maintenanceAdmin: true, dingUserId: deputyEmployee },
    { id: other, name: '审批人同名测试', department: 'IT部', role: 'MANAGER', dingUserId: randomUUID() }
  ] })
  runtime = await buildApp(env, { logging: false }); await runtime.app.ready()
  for (const userId of [approver, deputy, other, owner]) {
    const token = randomBytes(32).toString('hex')
    await db.session.create({ data: { userId, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 3600000) } })
    cookies[userId] = `itpc_session=${token}`
  }
})
afterAll(async () => { await db.user.updateMany({ where: { id: deputy }, data: { maintenanceAdmin: false } }); await runtime?.app.close(); await db.$disconnect() })

it('能力由员工绑定决定；同名管理员保留查看/管理接口，不得直接创建或重提', async () => {
  expect((await call('/api/me')).json().data.canApproveProjects).toBe(true)
  expect((await call('/api/me', undefined, other)).json().data.canApproveProjects).toBe(false)
  const ws = await call('/api/workspace', undefined, other)
  expect(ws.statusCode).toBe(200)
  expect(ws.json().data.database.users.find((u: { id: string }) => u.id === approver).canApproveProjects).toBe(true)
  expect((await call('/api/admin/settings', undefined, other)).statusCode).toBe(200)
  const body = input()
  const created = await call('/api/projects', body)
  expect(created.statusCode, created.body).toBe(200)
  const id = created.json().data.id
  for (const user of [other, owner]) {
    expect((await call('/api/projects', input(), user)).statusCode).toBe(403)
    const result = await call(`/api/project-proposals/${id}/resubmit`, { ...input(), version: 1 }, user)
    expect(result.statusCode).toBe(403)
  }
  const resubmitted = await call(`/api/project-proposals/${id}/resubmit`, { ...input(), version: 1 })
  expect(resubmitted.statusCode, resubmitted.body).toBe(200)
  expect((await db.projectProposal.findUniqueOrThrow({ where: { id } })).version).toBe(2)
})

it.each([approver, deputy].flatMap(user => ['approve', 'return', 'reject'].map(decision => ({ user, decision }))))('审批 $decision 两名指定人员均可执行，拒绝不写入', async ({ user, decision }) => {
  const attachmentId = randomUUID()
  const demand = await db.demand.create({ data: { name: '材料齐全的权限验证', description: '验证', ownerId: owner, status: 'PENDING', expectedLaunchDate: new Date('2099-10-08'), attachmentIds: [attachmentId],
    attachments: { create: { id: attachmentId, uploaderId: owner, kind: 'FILE', name: '需求.txt', mime: 'text/plain', size: 5, objectKey: randomUUID(), status: 'READY', expiresAt: new Date('2099-10-08') } } } })
  const { name: _name, department: _department, ...projectFields } = input()
  const body = { ...projectFields, version: 1, decision }
  // Review schema accepts project fields only for approval.
  const payload = decision === 'approve' ? body : { requestId: randomUUID(), version: 1, decision, reason: '审核意见' }
  for (const user of [other, owner]) expect((await call(`/api/demands/${demand.id}/review`, payload, user)).statusCode).toBe(403)
  expect((await db.demand.findUniqueOrThrow({ where: { id: demand.id } })).version).toBe(1)
  const result = await call(`/api/demands/${demand.id}/review`, payload, user)
  expect(result.statusCode, result.body).toBe(200)
})

it('失效/降级/员工解绑即失权，缺配置不回退；幂等重放也校验', async () => {
  const body = input()
  expect((await call('/api/projects', body)).statusCode).toBe(200)
  for (const data of [{ role: 'ENGINEER' as const }, { dingUserId: null }, { active: false }]) {
    await db.user.update({ where: { id: approver }, data })
    try { expect([401, 403]).toContain((await call('/api/projects', body)).statusCode) }
    finally { await db.user.update({ where: { id: approver }, data: { role: 'MANAGER', active: true, dingUserId: employee } }) }
  }
  const closed = await buildApp({ ...env, PROJECT_APPROVER_DING_USER_ID: '' }, { logging: false })
  try {
    const result = await closed.app.inject({ method: 'POST', url: '/api/projects', payload: input(), headers: { cookie: cookies[approver], origin: env.WEB_ORIGIN } })
    expect(result.statusCode).toBe(403)
  } finally { await closed.app.close() }
})

it('工程师退回仅通知指定审批人；旧管理员待发消息跳过，指定人员可重提', async () => {
  const created = await call('/api/projects', input())
  const id = created.json().data.id
  const returned = await call(`/api/project-proposals/${id}/confirm`, { requestId: randomUUID(), version: 1, decision: 'return', reason: '需要重新评估' }, owner)
  expect(returned.statusCode, returned.body).toBe(200)
  const messages = await db.notificationOutbox.findMany({ where: { eventType: 'PROPOSAL_RETURNED', payload: { path: ['proposalId'], equals: id } } })
  expect(messages.map(m => m.recipientId).sort()).toEqual([approver, deputy].sort())
  const legacy = await db.notificationOutbox.create({ data: { eventType: 'PROPOSAL_RETURNED', recipientId: other, idempotencyKey: randomUUID(), payload: { proposalId: id }, availableAt: new Date(0) } })
  const sent: string[] = []
  const client = { legacy: async (_path: string, body: Record<string, unknown>) => { sent.push(String(body.userid_list)); return { errcode: 0, task_id: 1 } } }
  const otherUser = await db.user.findUniqueOrThrow({ where: { id: other } })
  const service = new NotificationService(db, client, { enabled: true, agentId: '123', webOrigin: env.WEB_ORIGIN, projectApproverDingUserId: employee, recipientUserIds: [otherUser.dingUserId!] })
  await service.flush(new Date('2099-10-09T00:00:00Z'))
  expect(sent).toEqual([])
  expect((await db.notificationLog.findUniqueOrThrow({ where: { outboxId: legacy.id } })).state).toBe('SKIPPED')
  const result = await call(`/api/project-proposals/${id}/resubmit`, { ...input(), version: 2 })
  expect(result.statusCode, result.body).toBe(200)
})

it('维护工程师可创建与重提；撤销标记后能力与HTTP写入同时拒绝', async () => {
  expect((await call('/api/me', undefined, deputy)).json().data.canApproveProjects).toBe(true)
  const created = await call('/api/projects', input(), deputy)
  expect(created.statusCode, created.body).toBe(200)
  expect((await call(`/api/project-proposals/${created.json().data.id}/resubmit`, { ...input(), version: 1 }, deputy)).statusCode).toBe(200)
  await db.user.update({ where: { id: deputy }, data: { maintenanceAdmin: false } })
  const single = await buildApp({ ...base, PROJECT_APPROVER_DING_USER_ID: employee }, { logging: false })
  try {
    const headers = { cookie: cookies[deputy], origin: env.WEB_ORIGIN }
    expect((await single.app.inject({ method: 'GET', url: '/api/me', headers })).json().data.canApproveProjects).toBe(false)
    expect((await single.app.inject({ method: 'POST', url: '/api/projects', payload: input(), headers })).statusCode).toBe(403)
  } finally { await single.app.close(); await db.user.update({ where: { id: deputy }, data: { maintenanceAdmin: true } }) }
})

it('维护授权保持工程师身份/接单和管理能力，撤销/停用立即拒绝', async () => {
  expect((await call('/api/me', undefined, deputy)).json().data).toMatchObject({ role: 'ENGINEER', maintenanceAdmin: true, canApproveProjects: true })
  expect(await db.managerGrant.findUnique({ where: { userId: deputy } })).toBeNull()
  const ws = (await call('/api/workspace', undefined, deputy)).json().data
  expect(ws.database.users.find((u: { id: string }) => u.id === deputy)).toMatchObject({ role: 'engineer', maintenanceAdmin: true, engineerEligible: true })
  expect((await call('/api/admin/settings', undefined, deputy)).statusCode).toBe(200)
  expect((await call('/api/admin/settings', undefined, owner)).statusCode).toBe(403)
  const created = await call('/api/projects', { ...input(), primaryOwnerId: deputy }, deputy)
  expect(created.statusCode, created.body).toBe(200)
  const accepted = await call(`/api/project-proposals/${created.json().data.id}/confirm`, { requestId: randomUUID(), version: 1, decision: 'accept' }, deputy)
  expect(accepted.statusCode, accepted.body).toBe(200)
  const project = await db.project.findFirstOrThrow({ where: { primaryOwnerId: deputy } })
  const cancel = { requestId: randomUUID(), version: project.version, action: 'cancel', reason: '维护授权验证' }
  expect((await call(`/api/projects/${project.id}/action`, cancel, owner)).statusCode).toBe(403)
  const changed = await call(`/api/projects/${project.id}/action`, cancel, deputy)
  expect(changed.statusCode, changed.body).toBe(200)
  expect(await db.auditLog.findFirst({ where: { actorId: deputy, entityId: cancel.requestId, payload: { path: ['authorizationSource'], equals: 'maintenanceAdmin' } } })).not.toBeNull()
  for (const data of [{ maintenanceAdmin: false }, { active: false }]) {
    await db.user.update({ where: { id: deputy }, data })
    try {
      expect([401, 403]).toContain((await call('/api/admin/settings', undefined, deputy)).statusCode)
      expect([401, 403]).toContain((await call('/api/projects', input(), deputy)).statusCode)
      expect([401, 403]).toContain((await call(`/api/projects/${project.id}/action`, cancel, deputy)).statusCode)
    } finally { await db.user.update({ where: { id: deputy }, data: { active: true, maintenanceAdmin: true } }) }
  }
  expect((await db.user.findUniqueOrThrow({ where: { id: deputy } })).role).toBe('ENGINEER')
  expect(await db.managerGrant.findUnique({ where: { userId: deputy } })).toBeNull()
})

it('维护工程师无需管理名单即可执行企业管理授权，撤销后拒绝', async () => {
  const dept = await db.department.create({ data: { dingDeptId: randomUUID(), name: '维护授权组织' } })
  const target = await db.user.create({ data: { name: '授权目标', department: 'IT部', departmentId: dept.id, role: 'ENGINEER', dingUnionId: randomUUID() } })
  const previous = await db.systemSetting.findUnique({ where: { key: 'dingtalk.directory' } })
  await db.user.update({ where: { id: deputy }, data: { dingUnionId: randomUUID() } })
  await db.systemSetting.upsert({ where: { key: 'dingtalk.directory' }, create: { key: 'dingtalk.directory', value: {} }, update: {} })
  try {
    expect((await call('/api/manager-grants/candidates', undefined, deputy)).statusCode).toBe(200)
    const grant = await call('/api/manager-grants', { requestId: randomUUID(), userId: target.id, enabled: true }, deputy)
    expect(grant.statusCode, grant.body).toBe(200)
    await db.user.update({ where: { id: deputy }, data: { maintenanceAdmin: false } })
    expect((await call('/api/manager-grants/candidates', undefined, deputy)).statusCode).toBe(403)
    expect((await call('/api/manager-grants', { requestId: randomUUID(), userId: target.id, enabled: false }, deputy)).statusCode).toBe(403)
  } finally {
    await db.user.update({ where: { id: deputy }, data: { maintenanceAdmin: true } })
    if (!previous) await db.systemSetting.delete({ where: { key: 'dingtalk.directory' } })
  }
})

it('维护工程师可维护他人完整项目、排期进度、验收改派、补录日期和删除', async () => {
  const business = 'user-business-li'
  const p = await db.project.create({ data: { name: '维护授权全路径', department: 'IT部', primaryOwnerId: owner,
    acceptanceOwnerId: business, migrationVerified: true, firstRequestedOn: new Date('2024-01-01') }, include: { members: true } })
  const mapped = mapProject(p)
  const fields = Object.fromEntries(Object.keys(projectEditSchema.shape).filter(k => k in mapped).map(k => [k, mapped[k as keyof typeof mapped]]))
  const edit = { ...fields, requestId: randomUUID(), version: p.version, reason: '维护权限编辑', name: '维护授权完整编辑', verify: false }
  const edited = await call(`/api/projects/${p.id}/edit`, edit, deputy)
  expect(edited.statusCode, edited.body).toBe(200)
  async function act(path: string, extra: Record<string, unknown>) {
    const current = await db.project.findUniqueOrThrow({ where: { id: p.id } })
    const body = { requestId: randomUUID(), version: current.version, ...extra }
    const result = await call(`/api/projects/${p.id}/${path}`, body, deputy)
    expect(result.statusCode, result.body).toBe(200)
    return body
  }
  const plans = ['方案设计', '开发编码', '联调测试', '上线部署', '验收交付'].map(stage => ({ stage, startDate: '2099-10-01', endDate: '2099-10-01' }))
  await act('plan', { plans })
  const progress = await act('progress', { kind: 'overall', status: 'in-progress', summary: '维护整体进度' })
  await db.user.update({ where: { id: deputy }, data: { maintenanceAdmin: false } })
  try { expect((await call(`/api/projects/${p.id}/progress`, progress, deputy)).statusCode).toBe(403) }
  finally { await db.user.update({ where: { id: deputy }, data: { maintenanceAdmin: true } }) }
  await act('acceptance', { action: 'assign', ownerId: approver, summary: '维护改派验收人' })
  await act('correct', { stage: '方案设计', reason: '维护阶段纠正' })
  await act('historical-delivery', { deliveredOn: '2024-06-01', reason: '补录已交付项目' })
  await act('completion-dates', { dates: [{ stage: '验收交付', completedOn: '2024-06-02' }], reason: '修订实际日期' })
  await act('action', { action: 'delete', reason: '维护删除' })
  expect(await db.project.findUnique({ where: { id: p.id } })).toBeNull()
})
