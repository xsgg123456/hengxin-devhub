import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.js'
import { parseEnv } from '../../config/env.js'
import { createPrisma } from '../../plugins/prisma.js'
import { PLAN_STAGES } from '../projects/project-plan-state.js'
const env = parseEnv(process.env)
if (env.NODE_ENV !== 'test' || !env.S3_BUCKET.startsWith('itpc-test-') ||
  !new URL(env.DATABASE_URL).searchParams.get('schema')?.startsWith('itpc_test_')) throw new Error('必须由隔离集成入口运行')
const db = createPrisma(env.DATABASE_URL)
let runtime: Awaited<ReturnType<typeof buildApp>>
const owner = 'user-engineer-wang', collab = 'user-engineer-zhao', manager = 'user-manager-chen', business = 'user-business-li'
const cookies: Record<string, string> = {}
const key = () => randomUUID()
function call(path: string, body: Record<string, unknown>, user = owner) {
  return runtime.app.inject({ method: 'POST', url: path, payload: body, headers: { cookie: cookies[user], origin: env.WEB_ORIGIN } })
}
async function create() {
  const response = await call('/api/projects', { requestId: key(), name: '排期集成项目', department: '财务部', priority: 'P1',
    primaryOwnerId: owner, collaboratorIds: [collab] }, manager)
  expect(response.statusCode, response.body).toBe(200)
  return response.json<{ data: { id: string } }>().data.id
}
const plans = () => PLAN_STAGES.map((stage, index) => ({ stage, startDate: `2099-10-${String(index * 2 + 1).padStart(2, '0')}`,
  endDate: `2099-10-${String(index * 2 + 3).padStart(2, '0')}` }))
const schedule = (id: string, version = 1) => call(`/api/projects/${id}/plan`, { requestId: key(), version, plans: plans() })
const overall = (version: number, extra: Record<string, unknown> = {}) => ({ requestId: key(), version, kind: 'overall', status: 'in-progress', ...extra })
const action = (id: string, version: number, name: string, user = manager) => call(`/api/projects/${id}/action`, { requestId: key(), version, action: name, reason: '管理调整' }, user)
const row = (id: string) => db.project.findUniqueOrThrow({ where: { id } })
beforeAll(async () => {
  runtime = await buildApp(env, { logging: false }); await runtime.app.ready()
  for (const userId of [owner, collab, manager, business]) {
    const res = await runtime.app.inject({ method: 'POST', url: '/api/auth/dev-login', headers: { origin: env.WEB_ORIGIN }, payload: { userId } })
    expect(res.statusCode).toBe(200); cookies[userId] = res.cookies.map(c => `${c.name}=${c.value}`).join('; ')
  }
})
afterAll(async () => { await runtime?.app.close(); await db.$disconnect() })
describe('先排期后执行的真实事务', () => {
  it('完成计划冻结，纠正后改期及新一轮完成不改变上一轮结果', async () => {
    const id = await create(), url = `/api/projects/${id}/progress`
    expect((await schedule(id)).statusCode).toBe(200)
    expect((await call(url, overall(2, { status: 'completed' }))).statusCode).toBe(200)
    const first = await db.stageHistory.findFirstOrThrow({ where: { projectId: id, stage: '方案设计', status: 'completed' } })
    expect((await call(`/api/projects/${id}/correct`, { requestId: key(), version: 3, stage: '方案设计',
      status: 'in-progress', reason: '重新核实方案' }, manager)).statusCode).toBe(200)
    const changed = plans().map((p, i) => i === 0 ? { ...p, startDate: '2099-09-28', endDate: '2099-10-02' } : p)
    expect((await call(`/api/projects/${id}/plan`, { requestId: key(), version: 4, plans: changed,
      changeReason: '技术问题', changeDescription: '新一轮调整' })).statusCode).toBe(200)
    expect((await call(url, overall(5, { status: 'completed' }))).statusCode).toBe(200)
    const episodes = await db.stageHistory.findMany({ where: { projectId: id, stage: '方案设计', status: 'completed' }, orderBy: { createdAt: 'asc' } })
    expect(episodes).toHaveLength(2)
    expect(await db.stageHistory.findUniqueOrThrow({ where: { id: first.id } })).toEqual(first)
    expect(episodes[1]!.plannedStartDate?.toISOString().slice(0, 10)).toBe('2099-09-28')
    expect(episodes[1]!.plannedEndDate?.toISOString().slice(0, 10)).toBe('2099-10-02')
  })
  it('迁移仅回填有证据的完成时间，未知日期与重开项目不伪造，重复迁移不覆写', async () => {
    const actual = new Date('2026-08-10T23:30:00Z')
    const unknownId = await create(), finishedId = await create(), acceptedId = await create(), reopenedId = await create()
    await db.project.update({ where: { id: unknownId }, data: { status: 'COMPLETED', archived: true } })
    await db.project.update({ where: { id: finishedId }, data: { status: 'COMPLETED', archived: true } })
    await db.lifecycleEvent.create({ data: { entityType: 'project', entityId: finishedId, action: 'complete',
      authorId: owner, before: {}, after: {}, createdAt: actual } })
    for (const id of [acceptedId, reopenedId]) {
      await db.project.update({ where: { id }, data: { stage: '验收交付', simpleStatus: 'completed' } })
      await db.stageHistory.create({ data: { projectId: id, stage: '验收交付', status: 'completed',
        enteredAt: new Date('2026-08-09'), completedAt: actual } })
    }
    await db.lifecycleEvent.create({ data: { entityType: 'project', entityId: acceptedId, action: 'complete',
      authorId: owner, before: {}, after: {}, createdAt: new Date('2026-08-12T01:00:00Z') } })
    await db.lifecycleEvent.create({ data: { entityType: 'project', entityId: reopenedId, action: 'reopen',
      authorId: manager, before: {}, after: {}, createdAt: new Date('2026-08-11T01:00:00Z') } })
    const migration = await readFile(new URL('../../../prisma/migrations/202609110001_stage_plans/migration.sql', import.meta.url), 'utf8')
    const backfill = migration.slice(migration.indexOf('WITH evidence'))
    await db.$executeRawUnsafe(backfill)
    await db.$executeRawUnsafe(backfill)
    expect(await row(unknownId)).toMatchObject({ status: 'COMPLETED', actualCompletedAt: null, archived: true, stagePlans: [] })
    expect(await row(finishedId)).toMatchObject({ status: 'COMPLETED', actualCompletedAt: actual, archived: true, stagePlans: [] })
    expect(await row(acceptedId)).toMatchObject({ status: 'COMPLETED', actualCompletedAt: actual, archived: false, stagePlans: [] })
    expect(await row(reopenedId)).toMatchObject({ status: 'ACTIVE', actualCompletedAt: null, stagePlans: [] })
  })
  it('无日期立项、前两环节真实完成；缺排期不能整体更新，协作进展仍可记录', async () => {
    const id = await create(), before = await row(id), url = `/api/projects/${id}/progress`
    expect(before).toMatchObject({ stagePlans: [], currentLaunchDate: null, currentDeliveryDate: null, stageExpectedDate: null, actualCompletedAt: null })
    expect(await db.stageHistory.count({ where: { projectId: id, completedAt: { not: null } } })).toBe(2)
    expect((await call(url, overall(1))).statusCode).toBe(400)
    for (const user of [collab, business]) expect((await call(url, overall(1), user)).statusCode).toBe(403)
    for (const extra of [{ overallProgress: 55 }, { stage: '验收交付' }, { expectedDeliveryDate: '2099-12-02' }])
      expect((await call(url, { requestId: key(), version: 1, kind: 'personal', summary: '说明', ...extra }, collab)).statusCode).toBe(400)
    expect((await call(url, { requestId: key(), version: 1, kind: 'personal', summary: '等待接口', status: 'blocked', blocker: '外部等待' }, collab)).statusCode).toBe(200)
    const after = await row(id)
    expect(after.lastOverallUpdatedAt).toEqual(before.lastOverallUpdatedAt)
    expect([after.overallProgress, after.simpleStatus, after.blocker]).toEqual([before.overallProgress, before.simpleStatus, before.blocker])
  })
  it('排期全量、顺序、日期、权限校验全部在提交前拒绝，首排不需原因', async () => {
    const id = await create(), url = `/api/projects/${id}/plan`, input = { requestId: key(), version: 1, plans: plans() }
    for (const user of [collab, business]) expect((await call(url, input, user)).statusCode).toBe(403)
    for (const invalidPlans of [plans().slice(1), [...plans()].reverse(), [plans()[0], ...plans().slice(0, 4)],
      plans().map((p, i) => i === 1 ? { ...p, startDate: '2099-09-01' } : p),
      plans().map((p, i) => i === 0 ? { ...p, endDate: '2099-02-29' } : p)]) {
      expect((await call(url, { ...input, plans: invalidPlans })).statusCode).toBe(400)
      expect((await row(id)).version).toBe(1)
    }
    expect((await call(url, input)).statusCode).toBe(200)
    expect((await row(id)).currentDeliveryDate?.toISOString().slice(0, 10)).toBe('2099-10-11')
    expect(await db.scheduleChange.count({ where: { projectId: id } })).toBe(0)
    expect(await db.lifecycleEvent.count({ where: { entityId: id, action: 'plan' } })).toBe(1)
  })
  it('同key并发排期幂等、冲突回滚、调整逐字段记日志并保留最初计划', async () => {
    const id = await create(), url = `/api/projects/${id}/plan`
    expect((await schedule(id)).statusCode).toBe(200)
    const changedPlans = plans().map((p, i) => i === 4 ? { ...p, startDate: '2099-10-10', endDate: '2099-10-13' } : p)
    const input = { requestId: key(), version: 2, plans: changedPlans, changeReason: '技术问题', changeDescription: '兼容验证' }
    expect((await call(url, { requestId: key(), version: 2, plans: changedPlans })).statusCode).toBe(400)
    expect((await row(id)).version).toBe(2)
    const responses = await Promise.all([call(url, input), call(url, input)])
    expect(responses.map(r => r.statusCode)).toEqual([200, 200]); expect(responses[0].json()).toEqual(responses[1].json())
    expect((await call(url, { ...input, requestId: key() })).statusCode).toBe(409)
    expect((await call(url, { ...input, changeDescription: '不同请求' })).statusCode).toBe(409)
    expect(await db.scheduleChange.count({ where: { projectId: id } })).toBe(2)
    const result = await row(id)
    expect(result.originalDeliveryDate?.toISOString().slice(0, 10)).toBe('2099-10-11')
    expect(result.currentDeliveryDate?.toISOString().slice(0, 10)).toBe('2099-10-13')
    expect(result.stagePlans).toEqual(expect.arrayContaining([expect.objectContaining({ stage: '验收交付', originalStartDate: '2099-10-09', originalEndDate: '2099-10-11' })]))
  })
  it('执行不需说明日期百分比，自动沿排期前进，已完成阶段不可改写', async () => {
    const id = await create(), url = `/api/projects/${id}/progress`
    expect((await schedule(id)).statusCode).toBe(200)
    expect((await call(url, overall(2, { overallProgress: 100 }))).statusCode).toBe(400)
    expect((await call(url, overall(2, { status: 'completed' }))).statusCode).toBe(200)
    expect(await row(id)).toMatchObject({ stage: '开发编码', overallProgress: 0, version: 3, status: 'ACTIVE' })
    expect((await row(id)).stageExpectedDate?.toISOString().slice(0, 10)).toBe('2099-10-05')
    expect((await schedule(id, 3)).statusCode).toBe(400)
    const old = await db.stageHistory.findFirstOrThrow({ where: { projectId: id, stage: '方案设计', status: 'completed' } })
    expect(old.plannedStartDate?.toISOString().slice(0, 10)).toBe('2099-10-01')
    expect(old.plannedEndDate?.toISOString().slice(0, 10)).toBe('2099-10-03')
    const correction = { requestId: key(), version: 3, stage: '方案设计', status: 'in-progress', reason: '重新核对方案' }
    expect((await call(`/api/projects/${id}/correct`, correction, owner)).statusCode).toBe(403)
    expect((await call(`/api/projects/${id}/correct`, correction, manager)).statusCode).toBe(200)
    expect((await db.stageHistory.findUniqueOrThrow({ where: { id: old.id } })).completedAt).toEqual(old.completedAt)
    expect(await db.stageHistory.count({ where: { projectId: id, stage: '方案设计', enteredAt: { not: null } } })).toBe(2)
    expect(await db.stageHistory.count({ where: { projectId: id, stage: '开发编码', interruptedAt: { not: null } } })).toBe(1)
    expect((await action(id, 4, 'cancel')).statusCode).toBe(200)
    expect((await call(url, overall(5))).statusCode).toBe(409)
    expect((await action(id, 5, 'archive')).statusCode).toBe(200)
    expect((await action(id, 6, 'reopen')).statusCode).toBe(200)
    expect((await call(url, overall(7))).statusCode).toBe(200)
  })
  it('旧项目只补当前及未来排期，不填造既往阶段实际日期', async () => {
    const id = await create()
    await db.project.update({ where: { id }, data: { stage: '联调测试' } })
    await db.stageHistory.deleteMany({ where: { projectId: id } })
    expect((await call(`/api/projects/${id}/plan`, { requestId: key(), version: 1, plans: plans().slice(2) })).statusCode).toBe(200)
    expect(await db.stageHistory.count({ where: { projectId: id } })).toBe(0)
    expect(await row(id)).toMatchObject({ stagePlans: plans().slice(2).map(p => ({ ...p, originalStartDate: p.startDate, originalEndDate: p.endDate })) })
    expect((await call(`/api/projects/${id}/progress`, overall(2, { status: 'completed' }))).statusCode).toBe(200)
    const finished = await db.stageHistory.findFirstOrThrow({ where: { projectId: id, stage: '联调测试', status: 'completed' } })
    expect(finished.enteredAt).toBeNull()
    expect(finished.completedAt).toBeInstanceOf(Date)
    const workspace = await runtime.app.inject({ method: 'GET', url: '/api/workspace', headers: { cookie: cookies[owner] } })
    expect(workspace.statusCode).toBe(200)
    expect(workspace.json<{ data: { database: { stageHistories: unknown[] } } }>().data.database.stageHistories)
      .toContainEqual({ projectId: id, stage: '联调测试', startedAt: '', completedAt: finished.completedAt!.toISOString(),
        plannedStartDate: '2099-10-05', plannedEndDate: '2099-10-07' })
    const correction = await call(`/api/projects/${id}/correct`, { requestId: key(), version: 3, stage: '联调测试', status: 'in-progress', reason: '联调发现遗漏，回退处理' }, manager)
    expect(correction.statusCode, correction.body).toBe(200)
    expect((await row(id)).stage).toBe('联调测试')
  })
  it('验收即完成且不归档，重开清实际结果，重做保留原完成历史', async () => {
    const id = await create(), url = `/api/projects/${id}/progress`
    expect((await schedule(id)).statusCode).toBe(200)
    for (let version = 2; version <= 6; version++) expect((await call(url, overall(version, { status: 'completed' }))).statusCode).toBe(200)
    const completed = await row(id)
    expect(completed).toMatchObject({ status: 'COMPLETED', archived: false, version: 7 })
    expect(completed.actualCompletedAt).toBeInstanceOf(Date)
    expect((await call(url, overall(7))).statusCode).toBe(409)
    const previous = await db.stageHistory.findFirstOrThrow({ where: { projectId: id, stage: '验收交付', completedAt: { not: null } } })
    expect((await action(id, 7, 'reopen', owner)).statusCode).toBe(403)
    expect((await action(id, 7, 'reopen')).statusCode).toBe(200)
    expect((await row(id)).actualCompletedAt).toBeNull()
    expect((await call(url, overall(8, { status: 'completed' }))).statusCode).toBe(200)
    expect(await db.stageHistory.count({ where: { projectId: id, stage: '验收交付', completedAt: { not: null } } })).toBe(2)
    expect((await db.stageHistory.findUniqueOrThrow({ where: { id: previous.id } })).completedAt).toEqual(previous.completedAt)
    expect((await row(id)).actualCompletedAt!.getTime()).toBeGreaterThanOrEqual(completed.actualCompletedAt!.getTime())
    expect(await db.notificationOutbox.count({ where: { projectId: id, eventType: 'PROJECT_COMPLETED' } })).toBe(0)
  })
  it('完成通知故障回滚项目、阶段、日志与幂等收据，重试不重复通知', async () => {
    const id = await create()
    const demand = await db.demand.create({ data: { name: '关联完成', ownerId: business, status: 'APPROVED' } })
    await db.project.update({ where: { id }, data: { demandId: demand.id } })
    expect((await schedule(id)).statusCode).toBe(200)
    for (let version = 2; version <= 5; version++) expect((await call(`/api/projects/${id}/progress`, overall(version, { status: 'completed' }))).statusCode).toBe(200)
    const body = overall(6, { status: 'completed' })
    await db.$executeRaw`ALTER TABLE notification_outbox ADD CONSTRAINT progress_test_fault CHECK (event_type <> 'PROJECT_COMPLETED') NOT VALID`
    try {
      expect((await call(`/api/projects/${id}/progress`, body)).statusCode).toBe(500)
      expect(await row(id)).toMatchObject({ status: 'ACTIVE', actualCompletedAt: null, version: 6 })
      expect(await db.stageHistory.count({ where: { projectId: id, stage: '验收交付', completedAt: { not: null } } })).toBe(0)
      expect(await db.lifecycleEvent.count({ where: { entityId: id, action: 'complete' } })).toBe(0)
      expect(await db.commandReceipt.count({ where: { actorId: owner, key: body.requestId } })).toBe(0)
    } finally { await db.$executeRaw`ALTER TABLE notification_outbox DROP CONSTRAINT progress_test_fault` }
    const results = await Promise.all([call(`/api/projects/${id}/progress`, body), call(`/api/projects/${id}/progress`, body)])
    expect(results.map(r => r.statusCode)).toEqual([200, 200])
    expect(results[0].json()).toEqual(results[1].json())
    const events = await db.notificationOutbox.findMany({ where: { projectId: id, eventType: 'PROJECT_COMPLETED' } })
    expect(events).toHaveLength(1); expect(events[0]).toMatchObject({ recipientId: business, demandId: demand.id })
    expect(await db.progressUpdate.count({ where: { projectId: id } })).toBe(5)
  })
  it('无进度删除保留outbox历史与生命周期，幂等重放', async () => {
    const id = await create(), before = await db.notificationOutbox.findMany({ where: { projectId: id } })
    const body = { requestId: key(), version: 1, action: 'delete' }
    expect((await call(`/api/projects/${id}/action`, body, manager)).statusCode).toBe(200)
    expect((await call(`/api/projects/${id}/action`, body, manager)).statusCode).toBe(200)
    expect(await db.project.findUnique({ where: { id } })).toBeNull()
    for (const event of before) expect(await db.notificationOutbox.findUniqueOrThrow({ where: { id: event.id } })).toMatchObject({ projectId: null, payload: event.payload })
    expect(await db.lifecycleEvent.count({ where: { entityId: id, action: 'delete' } })).toBe(1)
  })
})
