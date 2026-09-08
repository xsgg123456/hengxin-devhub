import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.js'
import { parseEnv } from '../../config/env.js'
import { createPrisma } from '../../plugins/prisma.js'
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
  const response = await call('/api/projects', { requestId: key(), name: '进度集成项目', department: '财务部', priority: 'P1',
    primaryOwnerId: owner, collaboratorIds: [collab], originalLaunchDate: '2099-11-01', originalDeliveryDate: '2099-12-01', stageExpectedDate: '2099-10-01' }, manager)
  expect(response.statusCode, response.body).toBe(200)
  return response.json<{ data: { id: string } }>().data.id
}
const overall = (version: number, extra: Record<string, unknown> = {}) => ({ requestId: key(), version, kind: 'overall', summary: '公开进展', overallProgress: 25, status: 'in-progress', ...extra })
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
describe('进度、阶段、纠正和生命周期真实事务', () => {
  it('越权及个人整体字段注入拒绝；个人记录不改变整体与停更时间', async () => {
    const id = await create(), before = await row(id), url = `/api/projects/${id}/progress`
    for (const user of [collab, business]) expect((await call(url, overall(1), user)).statusCode).toBe(403)
    for (const extra of [{ overallProgress: 55 }, { stage: '验收交付' }, { expectedDeliveryDate: '2099-12-02' }])
      expect((await call(url, { requestId: key(), version: 1, kind: 'personal', summary: '个人说明', ...extra }, collab)).statusCode).toBe(400)
    const res = await call(url, { requestId: key(), version: 1, kind: 'personal', summary: '等待接口', status: 'blocked', blocker: '外部等待' }, collab)
    expect(res.statusCode, res.body).toBe(200)
    const after = await row(id)
    expect(after.lastOverallUpdatedAt).toEqual(before.lastOverallUpdatedAt)
    expect([after.overallProgress, after.simpleStatus, after.stageExpectedDate, after.blocker]).toEqual([before.overallProgress, before.simpleStatus, before.stageExpectedDate, before.blocker])
    expect(await db.progressUpdate.count({ where: { projectId: id } })).toBe(1)
  })
  it('同key并发幂等、旧version冲突、日期原始承诺与调整历史保留', async () => {
    const id = await create(), url = `/api/projects/${id}/progress`
    const input = overall(1, { overallProgress: 33.5, expectedLaunchDate: '2099-11-02', expectedDeliveryDate: '2099-12-03', stageExpectedDate: '2099-10-02', changeReason: '技术问题', changeDescription: '兼容验证' })
    const responses = await Promise.all([call(url, input), call(url, input)])
    expect(responses.map(r => r.statusCode)).toEqual([200, 200]); expect(responses[0].json()).toEqual(responses[1].json())
    expect((await call(url, overall(1))).statusCode).toBe(409)
    expect((await call(url, { ...input, summary: '变更key内容' })).statusCode).toBe(409)
    const project = await row(id)
    expect(project.overallProgress).toBe(33.5); expect(project.originalDeliveryDate?.toISOString().slice(0, 10)).toBe('2099-12-01')
    expect(project.currentDeliveryDate?.toISOString().slice(0, 10)).toBe('2099-12-03')
    expect(await db.scheduleChange.count({ where: { projectId: id } })).toBe(3)
    expect(await db.progressUpdate.count({ where: { projectId: id } })).toBe(1)
    expect((await call(url, overall(2, { expectedLaunchDate: '2099-11-05' }))).statusCode).toBe(400)
    expect((await row(id)).version).toBe(2)
  })
  it('100%不关闭；阶段推进需下一日期；纠正保留中断与已完成episode', async () => {
    const id = await create(), url = `/api/projects/${id}/progress`
    expect((await call(url, overall(1, { overallProgress: 100 }))).statusCode).toBe(200)
    expect((await row(id)).status).toBe('ACTIVE')
    expect((await action(id, 2, 'complete', owner)).statusCode).toBe(400)
    expect((await call(url, overall(2, { status: 'completed' }))).statusCode).toBe(400)
    expect((await call(url, overall(2, { status: 'completed', nextStageExpectedDate: '2099-10-05' }))).statusCode).toBe(200)
    const old = await db.stageHistory.findFirstOrThrow({ where: { projectId: id, stage: '方案设计', status: 'completed' } })
    const correction = { requestId: key(), version: 3, stage: '方案设计', overallProgress: 20, status: 'in-progress', reason: '重新核对方案' }
    expect((await call(`/api/projects/${id}/correct`, correction, owner)).statusCode).toBe(403)
    expect((await call(`/api/projects/${id}/correct`, correction, manager)).statusCode).toBe(200)
    expect((await db.stageHistory.findUniqueOrThrow({ where: { id: old.id } })).completedAt).toEqual(old.completedAt)
    expect(await db.stageHistory.count({ where: { projectId: id, stage: '方案设计', enteredAt: { not: null } } })).toBe(2)
    expect(await db.stageHistory.count({ where: { projectId: id, stage: '开发编码', interruptedAt: { not: null } } })).toBe(1)
    expect((await action(id, 4, 'delete')).statusCode).toBe(409)
    expect((await action(id, 4, 'cancel')).statusCode).toBe(200)
    expect((await call(url, overall(5))).statusCode).toBe(409)
    expect((await action(id, 5, 'archive')).statusCode).toBe(200)
    expect((await action(id, 6, 'reopen')).statusCode).toBe(200)
    expect((await call(url, overall(7))).statusCode).toBe(200)
  })
  it('依序完成验收后只有主责可关闭，直接项目不伪造收件人，重开保留完成历史', async () => {
    const id = await create(), url = `/api/projects/${id}/progress`
    for (let version = 1; version <= 5; version++) {
      const res = await call(url, overall(version, { status: 'completed', overallProgress: 100, ...(version < 5 ? { nextStageExpectedDate: '2099-11-01' } : {}) }))
      expect(res.statusCode, res.body).toBe(200)
    }
    expect((await row(id)).stage).toBe('验收交付')
    expect((await action(id, 6, 'complete')).statusCode).toBe(403)
    expect((await action(id, 6, 'complete', owner)).statusCode).toBe(200)
    expect(await row(id)).toMatchObject({ status: 'COMPLETED', archived: true })
    expect(await db.notificationOutbox.count({ where: { projectId: id, eventType: 'PROJECT_COMPLETED' } })).toBe(0)
    expect((await action(id, 7, 'reopen')).statusCode).toBe(200)
    expect(await db.stageHistory.count({ where: { projectId: id, stage: '验收交付', completedAt: { not: null } } })).toBe(1)
    expect(await db.stageHistory.count({ where: { projectId: id, stage: '验收交付', completedAt: null, enteredAt: { not: null } } })).toBe(1)
  })
  it('无进度物理删除保留outbox历史与生命周期，幂等重放', async () => {
    const id = await create(), before = await db.notificationOutbox.findMany({ where: { projectId: id } })
    const body = { requestId: key(), version: 1, action: 'delete' }
    expect((await call(`/api/projects/${id}/action`, body, manager)).statusCode).toBe(200)
    expect((await call(`/api/projects/${id}/action`, body, manager)).statusCode).toBe(200)
    expect(await db.project.findUnique({ where: { id } })).toBeNull()
    for (const event of before) expect(await db.notificationOutbox.findUniqueOrThrow({ where: { id: event.id } })).toMatchObject({ projectId: null, payload: event.payload })
    expect(await db.lifecycleEvent.count({ where: { entityId: id, action: 'delete' } })).toBe(1)
  })
  it('验收完成后普通进度重开创建新episode，再完成不覆盖旧实际时间', async () => {
    const id = await create(), url = `/api/projects/${id}/progress`
    for (let version = 1; version <= 5; version++)
      expect((await call(url, overall(version, { status: 'completed', nextStageExpectedDate: '2099-11-01' }))).statusCode).toBe(200)
    const previous = await db.stageHistory.findFirstOrThrow({ where: { projectId: id, stage: '验收交付', completedAt: { not: null } } })
    expect((await call(url, overall(6))).statusCode).toBe(200)
    expect((await call(url, overall(7, { status: 'completed' }))).statusCode).toBe(200)
    expect(await db.stageHistory.count({ where: { projectId: id, stage: '验收交付', completedAt: { not: null } } })).toBe(2)
    expect((await db.stageHistory.findUniqueOrThrow({ where: { id: previous.id } })).completedAt).toEqual(previous.completedAt)
  })
  it('关联需求删除恢复待评估version递增；完成通知同事务，故障整体回滚后可重试', async () => {
    async function approved() {
      const response = await call('/api/demands', { requestId: key(), name: '完成需求', description: '说明', expectedLaunchDate: '2099-12-01',
        prd: { kind: 'link', url: 'https://example.com/prd' }, prototype: { kind: 'link', url: 'https://example.com/prototype' }, submit: true }, business)
      expect(response.statusCode, response.body).toBe(200)
      const demandId = response.json<{ data: { id: string } }>().data.id
      const review = await call(`/api/demands/${demandId}/review`, { requestId: key(), version: 1, decision: 'approve', priority: 'P1',
        primaryOwnerId: owner, collaboratorIds: [], originalLaunchDate: '2099-11-01', originalDeliveryDate: '2099-12-01', stageExpectedDate: '2099-10-01' }, manager)
      expect(review.statusCode, review.body).toBe(200)
      return { demandId, projectId: (await db.project.findUniqueOrThrow({ where: { demandId } })).id }
    }
    const removed = await approved()
    expect((await action(removed.projectId, 1, 'delete')).statusCode).toBe(200)
    expect(await db.demand.findUniqueOrThrow({ where: { id: removed.demandId } })).toMatchObject({ status: 'PENDING', version: 3, reviewedAt: null, reviewedBy: null })
    const { projectId: id, demandId } = await approved()
    for (let version = 1; version <= 5; version++)
      expect((await call(`/api/projects/${id}/progress`, overall(version, { status: 'completed', nextStageExpectedDate: '2099-11-01' }))).statusCode).toBe(200)
    const body = { requestId: key(), version: 6, action: 'complete' }
    await db.$executeRaw`ALTER TABLE notification_outbox ADD CONSTRAINT progress_test_fault CHECK (event_type <> 'PROJECT_COMPLETED') NOT VALID`
    try {
      expect((await call(`/api/projects/${id}/action`, body)).statusCode).toBe(500)
      expect(await row(id)).toMatchObject({ status: 'ACTIVE', archived: false, version: 6 })
      expect(await db.lifecycleEvent.count({ where: { entityId: id, action: 'complete' } })).toBe(0)
      expect(await db.commandReceipt.count({ where: { actorId: owner, key: body.requestId } })).toBe(0)
    } finally { await db.$executeRaw`ALTER TABLE notification_outbox DROP CONSTRAINT progress_test_fault` }
    expect((await call(`/api/projects/${id}/action`, body)).statusCode).toBe(200)
    expect((await call(`/api/projects/${id}/action`, body)).statusCode).toBe(200)
    const events = await db.notificationOutbox.findMany({ where: { projectId: id, eventType: 'PROJECT_COMPLETED' } })
    expect(events).toHaveLength(1); expect(events[0]).toMatchObject({ recipientId: business, demandId })
  })

})
