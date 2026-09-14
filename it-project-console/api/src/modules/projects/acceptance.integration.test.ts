import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.js'
import { parseEnv } from '../../config/env.js'
import { createPrisma } from '../../plugins/prisma.js'
import { createProject } from './project-service.js'
import { refreshProjectRisks } from '../risks/risk-scan-job.js'
const env = parseEnv(process.env), url = new URL(env.DATABASE_URL)
if (env.NODE_ENV !== 'test' || !['localhost', '127.0.0.1'].includes(url.hostname) || !url.searchParams.get('schema')?.startsWith('itpc_test_') || !env.S3_BUCKET.startsWith('itpc-test-')) throw new Error('必须由隔离集成入口运行')
const db = createPrisma(env.DATABASE_URL)
let runtime: Awaited<ReturnType<typeof buildApp>>
const manager = 'user-manager-chen', engineer = 'user-engineer-wang', collab = 'user-engineer-zhao', business = 'user-business-li'
const cookies: Record<string, string> = {}, key = () => randomUUID()
const plan = { stage: '验收交付', startDate: '2026-09-11', endDate: '2026-09-11', originalStartDate: '2026-09-11', originalEndDate: '2026-09-11' }
const row = (id: string) => db.project.findUniqueOrThrow({ where: { id } })
function call(path: string, payload: Record<string, unknown>, user = engineer) {
  return runtime.app.inject({ method: 'POST', url: path, payload, headers: { cookie: cookies[user], origin: env.WEB_ORIGIN } })
}
function act(id: string, version: number, action: string, user = engineer, extra: Record<string, unknown> = {}) {
  return call(`/api/projects/${id}/acceptance`, { requestId: key(), version, action, ...(action === 'accept' ? {} : { summary: '交付说明或处理原因' }), ...extra }, user)
}
async function fixture(ownerId: string | null = business) {
  return db.project.create({ data: { name: '业务验收集成项目', primaryOwnerId: engineer, acceptanceOwnerId: ownerId,
    stage: '验收交付', stagePlans: [plan], currentDeliveryDate: new Date(plan.endDate), stageExpectedDate: new Date(plan.endDate),
    members: { create: { userId: collab } }, stageHistories: { create: { stage: '验收交付', status: 'current', enteredAt: new Date() } } } })
}
beforeAll(async () => {
  runtime = await buildApp(env, { logging: false }); await runtime.app.ready()
  for (const userId of [manager, engineer, collab, business]) {
    const response = await runtime.app.inject({ method: 'POST', url: '/api/auth/dev-login', payload: { userId }, headers: { origin: env.WEB_ORIGIN } })
    expect(response.statusCode).toBe(200); cookies[userId] = response.cookies.map(c => `${c.name}=${c.value}`).join('; ')
  }
})
afterAll(async () => { await runtime?.app.close(); await db.$disconnect() })
describe('业务确认验收真实API', () => {
  it('角色越权、缺负责人、无排期和旧完成入口均拒绝，严格字段校验', async () => {
    const { id } = await fixture(null)
    for (const user of [manager, business, collab]) expect((await act(id, 1, 'submit', user)).statusCode).toBe(403)
    expect((await act(id, 1, 'submit')).statusCode).toBe(400)
    expect((await act(id, 1, 'assign', engineer, { ownerId: business })).statusCode).toBe(403)
    expect((await act(id, 1, 'assign', manager, { ownerId: engineer })).statusCode).toBe(400)
    expect((await act(id, 1, 'assign', manager, { ownerId: business })).statusCode).toBe(200)
    for (const user of [engineer, manager]) expect((await call(`/api/projects/${id}/progress`, { requestId: key(), version: 2, kind: 'overall', status: 'completed' }, user)).statusCode).toBe(400)
    expect((await act(id, 2, 'submit', engineer, { url: 'http://unsafe.com' })).statusCode).toBe(400)
    await db.project.update({ where: { id }, data: { stagePlans: [] } })
    expect((await act(id, 2, 'submit')).statusCode).toBe(400)
    expect(await row(id)).toMatchObject({ acceptanceStatus: 'none', version: 2 })
  })
  it('提交-退回-重提-通过不覆盖历史，通过只允许当前业务并生成去重完成通知', async () => {
    const demand = await db.demand.create({ data: { name: '验收需求', ownerId: business } }), project = await fixture()
    const id = project.id
    await db.project.update({ where: { id }, data: { demandId: demand.id } })
    expect((await act(id, 1, 'submit', engineer, { summary: '首轮交付', url: 'https://example.com/result' })).statusCode).toBe(200)
    for (const user of [manager, engineer, collab]) expect((await act(id, 2, 'accept', user)).statusCode).toBe(403)
    expect((await act(id, 2, 'submit')).statusCode).toBe(400)
    expect((await call(`/api/projects/${id}/progress`, { requestId: key(), version: 2, kind: 'overall', status: 'in-progress' })).statusCode).toBe(400)
    expect((await call(`/api/projects/${id}/correct`, { requestId: key(), version: 2, stage: '验收交付', status: 'in-progress', reason: '覆盖尝试' }, manager)).statusCode).toBe(400)
    expect((await act(id, 2, 'return', business, { summary: '缺少场景' })).statusCode).toBe(200)
    expect((await row(id)).lastOverallUpdatedAt.getTime()).toBeGreaterThanOrEqual(project.lastOverallUpdatedAt.getTime())
    expect((await act(id, 3, 'submit', engineer, { summary: '补齐场景' })).statusCode).toBe(200)
    const payload = { requestId: key(), version: 4, action: 'accept' }
    const accepted = await Promise.all([call(`/api/projects/${id}/acceptance`, payload, business), call(`/api/projects/${id}/acceptance`, payload, business)])
    expect(accepted.map(response => response.statusCode)).toEqual([200, 200]); expect(accepted[0].json()).toEqual(accepted[1].json())
    const completed = await row(id)
    expect(completed).toMatchObject({ status: 'COMPLETED', archived: false, acceptanceStatus: 'accepted', acceptanceRound: 2, acceptanceSummary: '补齐场景', version: 5 })
    expect(completed.actualCompletedAt).toBeInstanceOf(Date)
    expect(completed.acceptanceHistory).toEqual(expect.arrayContaining([expect.objectContaining({ action: 'submit', round: 1, summary: '首轮交付', url: 'https://example.com/result' }), expect.objectContaining({ action: 'return', actorId: business, summary: '缺少场景' })]))
    expect(await db.stageHistory.count({ where: { projectId: id, status: 'completed' } })).toBe(1)
    expect((await db.notificationOutbox.findMany({ where: { projectId: id, eventType: 'PROJECT_COMPLETED' } })).map(n => n.recipientId).sort()).toEqual([engineer, collab, business].sort())
    expect((await act(id, 5, 'submit')).statusCode).toBe(409)
  })
  it('身份停用与角色变更即时失权；改派、撤回过期消息不再投递，已受理保留回执', async () => {
    const { id } = await fixture()
    expect((await act(id, 1, 'submit')).statusCode).toBe(200)
    const notice = await db.notificationOutbox.findFirstOrThrow({ where: { projectId: id, eventType: 'ACCEPTANCE_SUBMITTED' } })
    await db.notificationLog.create({ data: { outboxId: notice.id, state: 'ACCEPTED', taskId: 'accepted-task' } })
    await db.user.update({ where: { id: business }, data: { role: 'MANAGER' } })
    try { expect((await act(id, 2, 'accept', business)).statusCode).toBe(403) }
    finally { await db.user.update({ where: { id: business }, data: { role: 'BUSINESS' } }) }
    await db.user.update({ where: { id: business }, data: { active: false } })
    try { expect((await act(id, 2, 'accept', business)).statusCode).toBe(401) }
    finally { await db.user.update({ where: { id: business }, data: { active: true } }) }
    expect((await act(id, 2, 'withdraw')).statusCode).toBe(200)
    expect(await db.notificationLog.findUniqueOrThrow({ where: { outboxId: notice.id } })).toMatchObject({ state: 'ACCEPTED', taskId: 'accepted-task' })
    expect((await act(id, 3, 'submit')).statusCode).toBe(200)
    const pending = await db.notificationOutbox.findFirstOrThrow({ where: { projectId: id, eventType: 'ACCEPTANCE_SUBMITTED', deliveryLog: null } })
    const substitute = await db.user.create({ data: { name: '临时业务验收', department: '财务部', role: 'BUSINESS' } })
    try {
      expect((await act(id, 4, 'assign', manager, { ownerId: substitute.id })).statusCode).toBe(200)
      expect(await db.notificationLog.findUniqueOrThrow({ where: { outboxId: pending.id } })).toMatchObject({ state: 'SKIPPED' })
      expect((await act(id, 5, 'accept', business)).statusCode).toBe(403)
      expect((await row(id)).acceptanceSummary).toBe('交付说明或处理原因')
      expect((await act(id, 5, 'assign', manager, { ownerId: business })).statusCode).toBe(200)
      expect(await db.notificationLog.findUniqueOrThrow({ where: { outboxId: pending.id } })).toMatchObject({ state: 'SKIPPED' })
    } finally { await db.notificationOutbox.deleteMany({ where: { recipientId: substitute.id } }); await db.user.delete({ where: { id: substitute.id } }) }
  })
  it('通过/退回/撤回并发只有一次生效，完成通知故障原子回滚', async () => {
    const { id } = await fixture()
    await act(id, 1, 'submit')
    const payload = { requestId: key(), version: 2, action: 'accept' }
    await db.$executeRaw`ALTER TABLE notification_outbox ADD CONSTRAINT acceptance_test_fault CHECK (event_type <> 'PROJECT_COMPLETED') NOT VALID`
    try {
      expect((await call(`/api/projects/${id}/acceptance`, payload, business)).statusCode).toBe(500)
      expect(await row(id)).toMatchObject({ version: 2, acceptanceStatus: 'pending', status: 'ACTIVE' })
      expect(await db.commandReceipt.count({ where: { actorId: business, key: payload.requestId } })).toBe(0)
    } finally { await db.$executeRaw`ALTER TABLE notification_outbox DROP CONSTRAINT acceptance_test_fault` }
    const results = await Promise.all([call(`/api/projects/${id}/acceptance`, payload, business), act(id, 2, 'return', business), act(id, 2, 'withdraw')])
    expect(results.map(r => r.statusCode).sort()).toEqual([200, 409, 409])
    expect((await row(id)).acceptanceHistory).toHaveLength(2)
  })
  it('取消/归档终止待验收，重新打开清结果且保留历史，删除清待办', async () => {
    for (const action of ['cancel', 'archive']) {
      const { id } = await fixture(); await act(id, 1, 'submit')
      expect((await call(`/api/projects/${id}/action`, { requestId: key(), version: 2, action, reason: '终止本轮' }, manager)).statusCode).toBe(200)
      expect(await row(id)).toMatchObject({ acceptanceStatus: 'none', acceptanceSubmittedAt: null })
      expect((await act(id, 3, 'accept', business)).statusCode).toBe(409)
      expect((await call(`/api/projects/${id}/action`, { requestId: key(), version: 3, action: 'reopen' }, manager)).statusCode).toBe(200)
      expect((await act(id, 4, 'submit')).statusCode).toBe(200)
      expect((await row(id)).acceptanceRound).toBe(2)
      expect((await call(`/api/projects/${id}/action`, { requestId: key(), version: 5, action: 'delete' }, manager)).statusCode).toBe(200)
      expect(await db.project.findUnique({ where: { id } })).toBeNull()
      expect(await db.notificationOutbox.count({ where: { projectId: id } })).toBe(0)
    }
  })
  it('迁移不伪造旧完成，默认有效业务提交人，重复迁移不覆盖改派', async () => {
    const demand = await db.demand.create({ data: { name: '旧需求', ownerId: business } })
    const input = { requestId: key(), name: '默认验收人', department: '财务部', priority: 'P1' as const, primaryOwnerId: engineer, collaboratorIds: [], approvedLaunchDate: '2099-10-10' }
    const created = await db.$transaction(tx => createProject(tx, input, demand.id))
    expect(created.acceptanceOwnerId).toBe(business)
    await db.project.update({ where: { id: created.id }, data: { status: 'COMPLETED', acceptanceOwnerId: null } })
    const migration = await readFile(new URL('../../../prisma/migrations/20260914050000_business_acceptance/migration.sql', import.meta.url), 'utf8')
    for (let i = 0; i < 2; i++) for (const statement of migration.split(';').filter(s => s.trim())) await db.$executeRawUnsafe(statement)
    expect(await row(created.id)).toMatchObject({ status: 'COMPLETED', acceptanceOwnerId: null, acceptanceStatus: 'none', acceptanceHistory: [] })
  })
  it('等待期间管理风险汇总收件、无工程师催办，阈值及天数去重', async () => {
    const { id } = await fixture()
    await db.project.update({ where: { id }, data: { acceptanceStatus: 'pending', acceptanceSubmittedAt: new Date('2026-09-11T04:00:00Z'), lastOverallUpdatedAt: new Date('2026-09-01') } })
    await db.$transaction(tx => refreshProjectRisks(tx, id, new Date('2026-09-16T04:00:00Z')))
    const count = await db.notificationOutbox.count({ where: { projectId: id } })
    expect(count).toBeGreaterThan(0)
    expect(await db.notificationOutbox.count({ where: { projectId: id, recipientId: engineer } })).toBe(0)
    expect((await row(id)).risks).toContain('验收等待 3 个工作日：等待业务确认')
    await db.$transaction(tx => refreshProjectRisks(tx, id, new Date('2026-09-17T04:00:00Z')))
    expect(await db.notificationOutbox.count({ where: { projectId: id } })).toBe(count)
  })
})
