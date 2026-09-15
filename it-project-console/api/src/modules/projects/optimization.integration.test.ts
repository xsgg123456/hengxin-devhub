import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.js'
import { parseEnv } from '../../config/env.js'
import { createPrisma } from '../../plugins/prisma.js'
import { mapProject } from '../workspace/read-model.js'
const env = parseEnv(process.env), url = new URL(env.DATABASE_URL)
if (env.NODE_ENV !== 'test' || !['localhost', '127.0.0.1'].includes(url.hostname) || !url.searchParams.get('schema')?.startsWith('itpc_test_') || !env.S3_BUCKET.startsWith('itpc-test-')) throw new Error('必须由隔离集成入口运行')
const db = createPrisma(env.DATABASE_URL)
let runtime: Awaited<ReturnType<typeof buildApp>>
const manager = 'user-manager-chen', engineer = 'user-engineer-wang', business = 'user-business-li'
const cookies: Record<string, string> = {}, key = () => randomUUID()
const row = (id: string) => db.project.findUniqueOrThrow({ where: { id }, include: { members: true } })
function call(path: string, payload: Record<string, unknown>, user = business, method: 'POST' | 'PATCH' | 'DELETE' = 'POST') {
  return runtime.app.inject({ method, url: path, payload, headers: { cookie: cookies[user], origin: env.WEB_ORIGIN } })
}
function get(path: string) { return runtime.app.inject({ method: 'GET', url: path, headers: { cookie: cookies[business] } }) }
function demandInput(parentProjectId: string | null, extra: Record<string, unknown> = {}) {
  return { requestId: key(), name: '后续优化', description: '当前问题', optimizationOutcome: '验收标准', parentProjectId,
    submit: true, attachmentIds: [], expectedLaunchDate: '2099-12-31', ...extra }
}
async function parent() {
  const demand = await db.demand.create({ data: { name: '原需求', ownerId: business } })
  return db.project.create({ data: { name: '已交付主项目', demandId: demand.id, primaryOwnerId: engineer,
    status: 'COMPLETED', stage: '验收交付', simpleStatus: 'completed', archived: true, actualCompletedAt: new Date('2026-09-10') } })
}
async function create(parentId: string) {
  const response = await call('/api/demands', demandInput(parentId)); expect(response.statusCode).toBe(200)
  return response.json().data.id as string
}
async function establish(parentId: string) {
  const id = await create(parentId)
  const approved = await call(`/api/demands/${id}/review`, { requestId: key(), version: 1, decision: 'approve',
    primaryOwnerId: engineer, collaboratorIds: [], priority: 'P1', approvedLaunchDate: '2099-12-31' }, manager)
  expect(approved.statusCode, approved.body).toBe(200)
  const proposalId = approved.json().data.proposalId as string
  expect(await db.project.count({ where: { demandId: id } })).toBe(0)
  const confirmed = await call(`/api/project-proposals/${proposalId}/confirm`, { requestId: key(), version: 1, decision: 'accept' }, engineer)
  expect(confirmed.statusCode, confirmed.body).toBe(200)
  return row(confirmed.json().data.projectId as string)
}
const plans = [{ stage: '验收交付', startDate: '2099-12-29', endDate: '2099-12-31' }]
async function editInput(id: string, extra: Record<string, unknown> = {}) {
  const p = mapProject(await row(id))
  return { requestId: key(), version: p.version, reason: '优化编辑', verify: false, name: p.name,
    description: p.description, department: p.department, priority: p.priority, firstRequestedOn: p.firstRequestedOn,
    primaryOwnerId: p.primaryOwnerId, collaboratorIds: p.collaboratorIds, businessOwnerId: p.businessOwnerId,
    acceptanceOwnerId: p.acceptanceOwnerId, stage: p.stage, simpleStatus: p.simpleStatus, blocker: p.blocker,
    approvedLaunchDate: p.approvedLaunchDate, originalLaunchDate: p.originalLaunchDate, originalDeliveryDate: p.originalDeliveryDate,
    expectedLaunchDate: p.expectedLaunchDate, expectedDeliveryDate: p.expectedDeliveryDate,
    stagePlans: p.stagePlans.map(({ stage, startDate, endDate }) => ({ stage, startDate, endDate })),
    acceptanceUrl: p.acceptanceUrl, acceptanceSummary: p.acceptanceSummary, ...extra }
}
beforeAll(async () => {
  runtime = await buildApp(env, { logging: false }); await runtime.app.ready()
  for (const userId of [manager, engineer, business]) {
    const response = await runtime.app.inject({ method: 'POST', url: '/api/auth/dev-login', payload: { userId }, headers: { origin: env.WEB_ORIGIN } })
    expect(response.statusCode).toBe(200); cookies[userId] = response.cookies.map(c => `${c.name}=${c.value}`).join('; ')
  }
})
afterAll(async () => { await runtime?.app.close(); await db.$disconnect() })
describe('交付后单节点优化真实API', () => {
  it('关联仅限已完成主项目，优化验收标准必填、普通附件仍必填，草稿及提交后父关联锁定', async () => {
    const p = await parent(), other = await parent()
    expect((await call('/api/demands', demandInput(null))).statusCode).toBe(400)
    expect((await call('/api/demands', demandInput(p.id, { optimizationOutcome: '' }))).statusCode).toBe(400)
    for (const status of ['ACTIVE', 'CANCELLED'] as const) {
      await db.project.update({ where: { id: other.id }, data: { status } })
      expect((await call('/api/demands', demandInput(other.id))).statusCode).toBe(400)
    }
    const nested = await db.project.create({ data: { name: '已完成优化', parentProjectId: p.id, primaryOwnerId: engineer, status: 'COMPLETED' } })
    expect((await call('/api/demands', demandInput(nested.id))).statusCode).toBe(400)
    const draft = await call('/api/demands', demandInput(p.id, { submit: false, optimizationOutcome: '' }))
    expect(draft.statusCode).toBe(200)
    const id = draft.json().data.id as string
    expect((await call(`/api/demands/${id}`, demandInput(p.id, { version: 1 }), business, 'PATCH')).statusCode).toBe(200)
    expect((await db.demand.findUniqueOrThrow({ where: { id } })).firstRequestedOn).toBeInstanceOf(Date)
    expect((await call(`/api/demands/${id}`, demandInput(null, { version: 2, submit: false }), business, 'PATCH')).statusCode).toBe(409)
    const reject = { requestId: key(), version: 2, decision: 'return', reason: '补充标准' }
    expect((await call(`/api/demands/${id}/review`, reject, engineer)).statusCode).toBe(403)
    expect((await call(`/api/demands/${id}/review`, reject, manager)).statusCode).toBe(200)
    expect((await call(`/api/demands/${id}`, demandInput(p.id, { version: 3 }), business, 'PATCH')).statusCode).toBe(200)
    expect(await db.notificationOutbox.count({ where: { demandId: id, eventType: 'DEMAND_SUBMITTED' } })).toBe(2)
  })
  it('接单后仅单执行节点；必须排期并由指定验收人完成，编辑、纠正、历史完成不能绕过', async () => {
    const p = await parent(), original = await row(p.id), project = await establish(p.id), id = project.id
    expect(project).toMatchObject({ parentProjectId: p.id, stage: '验收交付', acceptanceOwnerId: business })
    expect((await db.stageHistory.findMany({ where: { projectId: id } })).map(h => h.stage)).toEqual(['需求受理', '立项评审', '验收交付'])
    const action = (action: string, user = engineer, extra: Record<string, unknown> = {}) => row(id).then(p => call(`/api/projects/${id}/acceptance`, { requestId: key(), version: p.version, action, ...(action === 'accept' ? {} : { summary: '交付验收说明' }), ...extra }, user))
    expect((await call(`/api/projects/${id}/edit`, await editInput(id, { simpleStatus: 'in-progress' }), manager)).statusCode).toBe(400)
    expect((await action('submit')).statusCode).toBe(400)
    expect((await call(`/api/projects/${id}/plan`, { requestId: key(), version: 1, plans }, engineer)).statusCode).toBe(200)
    expect(await row(id)).toMatchObject({ currentLaunchDate: new Date('2099-12-31'), currentDeliveryDate: new Date('2099-12-31') })
    expect((await call(`/api/projects/${id}/edit`, await editInput(id, { stage: '开发编码' }), manager)).statusCode).toBe(400)
    expect((await call(`/api/projects/${id}/correct`, { requestId: key(), version: 2, stage: '开发编码', reason: '绕过' }, manager)).statusCode).toBe(400)
    expect((await call(`/api/projects/${id}/historical-delivery`, { requestId: key(), version: 2, deliveredOn: '2026-09-15', reason: '绕过' }, manager)).statusCode).toBe(400)
    expect((await call(`/api/projects/${id}/progress`, { requestId: key(), version: 2, kind: 'overall', status: 'completed' }, engineer)).statusCode).toBe(400)
    const workload = (await get('/api/workload?month=2099-12&projectType=optimization')).json().data
    expect(workload.some((r: { projects: { id: string }[] }) => r.projects.some(p => p.id === id))).toBe(true)
    const load = workload.find((r: { user: { id: string } }) => r.user.id === engineer)
    expect(load.typeCounts.formal).toBe(0)
    expect(load.typeCounts.optimization).toBeGreaterThan(0)
    expect(load.stages).toEqual([{ stage: '优化完成验收', count: load.typeCounts.optimization }])
    const gantt = (await get('/api/gantt?month=2099-12')).json().data
    expect(gantt.some((r: { project: { id: string } }) => r.project.id === id)).toBe(true)
    const optimizedGantt = await get('/api/gantt?month=2099-12&projectType=optimization')
    expect(optimizedGantt.statusCode).toBe(200)
    expect(optimizedGantt.json().data.every((r: { project: { parentProjectId: string | null } }) => !!r.project.parentProjectId)).toBe(true)
    expect((await get('/api/gantt?month=2099-12&projectType=normal')).json().data.some((r: { project: { id: string } }) => r.project.id === id)).toBe(false)
    expect((await action('submit')).statusCode).toBe(200)
    expect((await call(`/api/projects/${id}/plan`, { requestId: key(), version: 3, plans }, engineer)).statusCode).toBe(400)
    expect((await call(`/api/projects/${id}/edit`, await editInput(id, { stagePlans: [] }), manager)).statusCode).toBe(400)
    expect((await action('accept', engineer)).statusCode).toBe(403)
    expect((await action('return', business)).statusCode).toBe(200)
    expect((await action('submit')).statusCode).toBe(200)
    const accept = { requestId: key(), version: 5, action: 'accept' }
    const responses = await Promise.all([call(`/api/projects/${id}/acceptance`, accept), call(`/api/projects/${id}/acceptance`, accept)])
    expect(responses.map(r => r.statusCode)).toEqual([200, 200])
    expect(await row(id)).toMatchObject({ status: 'COMPLETED', acceptanceRound: 2, version: 6 })
    expect(await row(p.id)).toEqual(original)
    expect(await db.notificationOutbox.count({ where: { projectId: id, eventType: 'PROJECT_COMPLETED' } })).toBe(2)
    const dashboard = (await get('/api/dashboard?projectType=optimization&includeArchived=true')).json().data
    expect(dashboard.projects.some((r: { id: string }) => r.id === id)).toBe(true)
    expect(dashboard.projects.some((r: { id: string }) => r.id === p.id)).toBe(false)
    const demands = (await get('/api/demand-statistics?projectType=optimization')).json().data.demands
    expect(demands.every((r: { parentProjectId: string | null }) => !!r.parentProjectId)).toBe(true)
  })
  it('原项目及原需求删除被关联优化阻止；删单个优化保留兄弟，创建/删除并发不产生孤儿', async () => {
    const p = await parent(), id = await create(p.id), sibling = await create(p.id)
    expect((await call(`/api/projects/${p.id}/action`, { requestId: key(), version: 1, action: 'delete' }, manager)).statusCode).toBe(409)
    expect((await call(`/api/demands/${p.demandId}`, { requestId: key(), version: 1 }, manager, 'DELETE')).statusCode).toBe(409)
    expect((await call(`/api/demands/${id}`, { requestId: key(), version: 1 }, business, 'DELETE')).statusCode).toBe(200)
    expect(await db.demand.findUnique({ where: { id: sibling } })).not.toBeNull()
    expect(await db.project.findUnique({ where: { id: p.id } })).not.toBeNull()
    const optimization = await establish(p.id)
    expect((await call(`/api/projects/${optimization.id}/action`, { requestId: key(), version: 1, action: 'delete' }, manager)).statusCode).toBe(200)
    expect(await db.demand.findUnique({ where: { id: optimization.demandId! } })).toBeNull()
    expect(await db.demand.findUnique({ where: { id: sibling } })).not.toBeNull()
    for (let i = 0; i < 3; i++) {
      const race = await parent()
      const responses = await Promise.all([call('/api/demands', demandInput(race.id)), call(`/api/projects/${race.id}/action`, { requestId: key(), version: 1, action: 'delete' }, manager)])
      expect(responses.some(r => r.statusCode === 200)).toBe(true)
      expect(responses.every(r => [200, 400, 409].includes(r.statusCode))).toBe(true)
      const children = await db.demand.count({ where: { parentProjectId: race.id } })
      const exists = await db.project.count({ where: { id: race.id } })
      expect(children > 0 ? exists === 1 : exists === 0).toBe(true)
    }
  })
  it('迁移可重复执行且保留普通项目与现有优化关联', async () => {
    const p = await parent(), id = await create(p.id)
    const migration = await readFile(new URL('../../../prisma/migrations/202609150002_optimization_projects/migration.sql', import.meta.url), 'utf8')
    for (let i = 0; i < 2; i++) for (const statement of migration.split(';').filter(s => s.trim())) await db.$executeRawUnsafe(statement)
    expect(await db.demand.findUniqueOrThrow({ where: { id } })).toMatchObject({ parentProjectId: p.id, optimizationOutcome: '验收标准' })
    expect(await row(p.id)).toMatchObject({ parentProjectId: null, status: 'COMPLETED' })
  })
})
