import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.js'
import { parseEnv } from '../../config/env.js'
import { createPrisma } from '../../plugins/prisma.js'
import { PLAN_STAGES } from './project-plan-state.js'
import { notificationContent } from '../notifications/notification-service.js'
const env = parseEnv(process.env)
const url = new URL(env.DATABASE_URL)
if (env.NODE_ENV !== 'test' || !['localhost', '127.0.0.1'].includes(url.hostname) || !url.searchParams.get('schema')?.startsWith('itpc_test_') || !env.S3_BUCKET.startsWith('itpc-test-')) throw new Error('必须由隔离集成入口运行')
const db = createPrisma(env.DATABASE_URL)
let runtime: Awaited<ReturnType<typeof buildApp>>
const manager = 'user-manager-chen', owner = 'user-engineer-wang', collab = 'user-engineer-zhao', business = 'user-business-li'
const cookies: Record<string, string> = {}
const key = () => randomUUID()
const input = () => ({ requestId: key(), name: '双阶段立项', department: '财务部', priority: 'P0', primaryOwnerId: owner, collaboratorIds: [collab], approvedLaunchDate: '2099-10-08' })
function call(method: 'POST' | 'PATCH' | 'DELETE' | 'GET', path: string, payload?: Record<string, unknown>, user = manager) {
  return runtime.app.inject({ method, url: path, payload, headers: { cookie: cookies[user], origin: env.WEB_ORIGIN } })
}
async function proposal() {
  const response = await call('POST', '/api/projects', input())
  expect(response.statusCode, response.body).toBe(200)
  return response.json<{ data: { id: string; version: number } }>().data
}
async function confirm(id: string, version = 1, user = owner) {
  return call('POST', `/api/project-proposals/${id}/confirm`, { requestId: key(), version, decision: 'accept' }, user)
}
beforeAll(async () => {
  runtime = await buildApp(env, { logging: false }); await runtime.app.ready()
  for (const userId of [manager, owner, collab, business]) {
    const response = await runtime.app.inject({ method: 'POST', url: '/api/auth/dev-login', payload: { userId }, headers: { origin: env.WEB_ORIGIN } })
    expect(response.statusCode).toBe(200); cookies[userId] = response.cookies.map(c => `${c.name}=${c.value}`).join('; ')
  }
})
afterAll(async () => { await runtime?.app.close(); await db.$disconnect() })
describe('工程师接单隔离数据库闭环', () => {
  it('待接单重新评估同事务同步名称，重试幂等，接单纠正旧名称且保留日期和历史', async () => {
    const demand=await db.demand.create({data:{name:'旧需求名称',ownerId:business,status:'AWAITING_ENGINEER',firstRequestedOn:new Date('2024-01-01')}})
    const p=await db.projectProposal.create({data:{...input(),approvedLaunchDate:new Date('2099-10-08'),demandId:demand.id,createdBy:manager}})
    const body={...input(),version:p.version,name:'重新评估名称'}
    const path=`/api/project-proposals/${p.id}/resubmit`
    await db.$executeRaw`ALTER TABLE notification_outbox ADD CONSTRAINT name_resubmit_test_fault CHECK (event_type <> 'PROPOSAL_ASSIGNED') NOT VALID`
    try {
      expect((await call('POST',path,body)).statusCode).toBe(500)
      expect(await db.demand.findUniqueOrThrow({where:{id:demand.id}})).toEqual(demand)
      expect(await db.projectProposal.findUniqueOrThrow({where:{id:p.id}})).toEqual(p)
      expect(await db.lifecycleEvent.count({where:{entityType:'demand',entityId:demand.id}})).toBe(0)
    } finally { await db.$executeRaw`ALTER TABLE notification_outbox DROP CONSTRAINT name_resubmit_test_fault` }
    const responses=await Promise.all([call('POST',path,body),call('POST',path,body)])
    expect(responses.map(r=>r.statusCode)).toEqual([200,200])
    expect(responses[0].json()).toEqual(responses[1].json())
    expect(await db.demand.findUniqueOrThrow({where:{id:demand.id}})).toMatchObject({name:body.name,version:2,firstRequestedOn:demand.firstRequestedOn})
    expect((await call('POST',path,{...body,requestId:key(),name:'过期名称'})).statusCode).toBe(409)
    const history=await db.lifecycleEvent.findFirstOrThrow({where:{entityType:'demand',entityId:demand.id}})
    expect(history).toMatchObject({authorId:manager,reason:'接单前重新评估项目名称',before:{name:demand.name},after:{name:body.name}})
    await db.demand.update({where:{id:demand.id},data:{name:'存量不一致'}})
    const accepted=await confirm(p.id,2)
    expect(accepted.statusCode,accepted.body).toBe(200)
    expect(await db.demand.findUniqueOrThrow({where:{id:demand.id}})).toMatchObject({name:body.name,version:3})
    expect(await db.project.findUniqueOrThrow({where:{id:accepted.json().data.projectId}})).toMatchObject({name:body.name,firstRequestedOn:demand.firstRequestedOn})
    expect(await db.lifecycleEvent.findUniqueOrThrow({where:{id:history.id}})).toEqual(history)
  })
  it('直接创建只存提案，通知深链，工程师唯一权限、幂等和并发接单', async () => {
    const demands = await db.demand.count(), projects = await db.project.count(), stages = await db.stageHistory.count()
    const body = input()
    const created = await call('POST', '/api/projects', body)
    expect(created.statusCode, created.body).toBe(200)
    expect((await call('POST', '/api/projects', body)).json()).toEqual(created.json())
    const { id } = created.json<{ data: { id: string } }>().data
    expect(await db.demand.count()).toBe(demands); expect(await db.project.count()).toBe(projects); expect(await db.stageHistory.count()).toBe(stages)
    const workspace = (await call('GET', '/api/workspace')).json().data.database
    expect(workspace.projectProposals.find((row: { id: string }) => row.id === id)).toMatchObject({ status: 'pending', approvedLaunchDate: body.approvedLaunchDate, demandId: null })
    const notification = await db.notificationOutbox.findFirstOrThrow({ where: { payload: { path: ['proposalId'], equals: id } }, include: { recipient: true, demand: true, project: { include: { primaryOwner: true } }, deliveryLog: true } })
    expect(notification.recipientId).toBe(owner)
    expect(notificationContent(notification, env.WEB_ORIGIN)).toContain(`/#/today-tasks?proposalId=${id}`)
    for (const user of [manager, collab, business]) expect((await confirm(id, 1, user)).statusCode).toBe(403)
    const accept = { requestId: key(), version: 1, decision: 'accept' }
    const results = await Promise.all([call('POST', `/api/project-proposals/${id}/confirm`, accept, owner), call('POST', `/api/project-proposals/${id}/confirm`, accept, owner)])
    expect(results.map(r => r.statusCode)).toEqual([200, 200]); expect(results[0].json()).toEqual(results[1].json())
    expect((await confirm(id)).statusCode).toBe(409)
    const projectId = results[0].json().data.projectId
    const project = await db.project.findUniqueOrThrow({ where: { id: projectId }, include: { stageHistories: true } })
    expect(project.code).toMatch(/^XM-/); expect(project.stageHistories).toHaveLength(7)
    expect(project).toMatchObject({ originalLaunchDate: null, currentLaunchDate: null, approvedLaunchDate: new Date(body.approvedLaunchDate) })
    expect(await db.project.count()).toBe(projects + 1)
    const history = (await call('GET', '/api/workspace')).json().data.database.lifecycleEvents.filter((row: { entityType: string; entityId: string }) => row.entityType === 'proposal' && row.entityId === id)
    expect(history).toHaveLength(2)
    expect(history.find((row: { action: string }) => row.action === 'submit')).toMatchObject({ authorId: manager, before: {}, after: { priority: 'P0', approvedLaunchDate: body.approvedLaunchDate, collaboratorIds: collab, primaryOwnerId: owner, status: 'pending' } })
    expect(history.find((row: { action: string }) => row.action === 'accept')).toMatchObject({ authorId: owner, before: { status: 'pending' }, after: { status: 'confirmed', projectId } })
    expect((await db.notificationOutbox.findMany({ where: { projectId, eventType: 'PROJECT_ASSIGNED' } })).map(row => row.recipientId).sort()).toEqual([owner, collab].sort())
  })
  it('退回原因必填，改派清旧通知、旧主责和旧版本失效，审计保留原因', async () => {
    const { id } = await proposal()
    const claimed = await db.notificationOutbox.findFirstOrThrow({ where: { payload: { path: ['proposalId'], equals: id } } })
    await db.notificationLog.create({ data: { outboxId: claimed.id, state: 'ACCEPTED', taskId: 'previous-owner-task' } })
    expect((await call('POST', `/api/project-proposals/${id}/confirm`, { requestId: key(), version: 1, decision: 'return', reason: ' ' }, owner)).statusCode).toBe(400)
    expect((await call('POST', `/api/project-proposals/${id}/confirm`, { requestId: key(), version: 1, decision: 'return', reason: '人员安排冲突' }, owner)).statusCode).toBe(200)
    expect(await db.projectProposal.findUniqueOrThrow({ where: { id } })).toMatchObject({ version: 2, status: 'returned', reviewReason: '人员安排冲突' })
    const resubmit = { ...input(), version: 2, primaryOwnerId: collab, collaboratorIds: [owner] }
    expect((await call('POST', `/api/project-proposals/${id}/resubmit`, resubmit, owner)).statusCode).toBe(403)
    expect((await call('POST', `/api/project-proposals/${id}/resubmit`, resubmit)).statusCode).toBe(200)
    expect((await confirm(id, 1, collab)).statusCode).toBe(409)
    expect((await confirm(id, 3, owner)).statusCode).toBe(403)
    const old = await db.notificationOutbox.findMany({ where: { recipientId: owner, payload: { path: ['proposalId'], equals: id } }, include: { deliveryLog: true } })
    expect(old.every(row => row.deliveryLog?.state === 'SKIPPED')).toBe(true)
    expect((await db.notificationLog.findUniqueOrThrow({ where: { outboxId: claimed.id } })).taskId).toBe('previous-owner-task')
    expect((await confirm(id, 3, collab)).statusCode).toBe(200)
    const changes = await db.lifecycleEvent.findMany({ where: { entityType: 'proposal', entityId: id, action: 'submit' }, orderBy: { createdAt: 'desc' } })
    expect(changes[0]).toMatchObject({ authorId: manager, before: { primaryOwnerId: owner, collaboratorIds: collab, status: 'returned' }, after: { primaryOwnerId: collab, collaboratorIds: owner, status: 'pending' } })
    expect((await db.auditLog.findMany({ where: { entityId: id, action: 'return' } }))[0]?.payload).toMatchObject({ reason: '人员安排冲突' })
  })
  it('需求审批、退回管理、重提和确认，期间业务修改被拒绝', async () => {
    const demand = await db.demand.create({ data: { name: '接单来源需求', ownerId: business, department: '财务部', description: '说明', status: 'PENDING', expectedLaunchDate: new Date('2099-12-31') } })
    const attachment = await db.attachment.create({ data: { demandId: demand.id, uploaderId: business, kind: 'FILE', name: '需求.txt', mime: 'text/plain', size: 1, objectKey: `test-${key()}`, status: 'READY', expiresAt: new Date('2099-12-31') } })
    await db.demand.update({ where: { id: demand.id }, data: { attachmentIds: [attachment.id] } })
    const { name: _name, department: _department, ...fields } = input()
    const reviewed = await call('POST', `/api/demands/${demand.id}/review`, { ...fields, version: 1, decision: 'approve' })
    expect(reviewed.statusCode, reviewed.body).toBe(200)
    const id = reviewed.json().data.proposalId
    expect(reviewed.json().data).toMatchObject({ id: demand.id, status: 'AWAITING_ENGINEER' })
    expect(await db.project.count({ where: { demandId: demand.id } })).toBe(0)
    expect((await call('PATCH', `/api/demands/${demand.id}`, { requestId: key(), version: 2, name: '覆盖', submit: false }, business)).statusCode).toBe(409)
    expect((await call('POST', `/api/project-proposals/${id}/confirm`, { requestId: key(), version: 1, decision: 'return', reason: '排期需调整' }, owner)).statusCode).toBe(200)
    expect(await db.demand.findUniqueOrThrow({ where: { id: demand.id } })).toMatchObject({ status: 'PENDING', version: 3, reviewReason: '工程师退回管理评估：排期需调整' })
    expect((await call('PATCH', `/api/demands/${demand.id}`, { requestId: key(), version: 3, name: '旧页覆盖', submit: false }, business)).statusCode).toBe(409)
    expect((await call('POST', `/api/demands/${demand.id}/withdraw`, { requestId: key(), version: 3 }, business)).statusCode).toBe(409)
    expect((await call('POST', '/api/attachments/upload', { demandId: demand.id, kind: 'FILE', name: '越权覆盖.txt', mime: 'text/plain', size: 1 }, business)).statusCode).toBe(409)
    expect((await call('POST', `/api/demands/${demand.id}/review`, { ...fields, requestId: key(), version: 3, decision: 'approve' })).statusCode).toBe(200)
    expect(await db.projectProposal.count({ where: { demandId: demand.id } })).toBe(1)
    expect((await confirm(id, 3)).statusCode).toBe(200)
    expect(await db.demand.findUniqueOrThrow({ where: { id: demand.id } })).toMatchObject({ status: 'APPROVED' })
  })
  it('待接单删除清记录和待发送通知，关联需求沿用原权限', async () => {
    const { id } = await proposal()
    expect((await call('DELETE', `/api/project-proposals/${id}`, { requestId: key(), version: 1 }, owner)).statusCode).toBe(403)
    expect((await call('DELETE', `/api/project-proposals/${id}`, { requestId: key(), version: 1 })).statusCode).toBe(200)
    expect(await db.projectProposal.findUnique({ where: { id } })).toBeNull()
    const notices = await db.notificationOutbox.findMany({ where: { payload: { path: ['proposalId'], equals: id } }, include: { deliveryLog: true } })
    expect(notices.every(row => row.deliveryLog?.state === 'SKIPPED')).toBe(true)
    const demand = await db.demand.create({ data: { name: '删除接单', ownerId: business, status: 'AWAITING_ENGINEER' } })
    const related = await db.projectProposal.create({ data: { ...input(), approvedLaunchDate: new Date('2099-10-08'), demandId: demand.id, createdBy: manager } })
    const notice = await db.notificationOutbox.create({ data: { demandId: demand.id, recipientId: owner, eventType: 'PROPOSAL_ASSIGNED', idempotencyKey: key(), payload: { proposalId: related.id } } })
    await db.notificationLog.create({ data: { outboxId: notice.id, state: 'ACCEPTED', taskId: 'deleted-proposal-task' } })
    expect((await call('DELETE', `/api/project-proposals/${related.id}`, { requestId: key(), version: 1 })).statusCode).toBe(409)
    expect((await call('DELETE', `/api/demands/${demand.id}`, { requestId: key(), version: 1 }, business)).statusCode).toBe(200)
    expect(await db.projectProposal.findUnique({ where: { id: related.id } })).toBeNull()
    expect(await db.notificationLog.findUniqueOrThrow({ where: { outboxId: notice.id } })).toMatchObject({ state: 'SKIPPED', taskId: 'deleted-proposal-task' })
  })
  it('管理退回业务使旧提案失效，补材料后旧页不能重提', async () => {
    const demand = await db.demand.create({ data: { name: '退回业务材料', ownerId: business, department: '财务部', description: '说明', status: 'PENDING', expectedLaunchDate: new Date('2099-12-31') } })
    const attachment = await db.attachment.create({ data: { demandId: demand.id, uploaderId: business, kind: 'FILE', name: '需求.txt', mime: 'text/plain', size: 1, objectKey: key(), status: 'READY', expiresAt: new Date('2099-12-31') } })
    await db.demand.update({ where: { id: demand.id }, data: { attachmentIds: [attachment.id] } })
    const { name: _name, department: _department, ...fields } = input()
    const review = await call('POST', '/api/demands/' + demand.id + '/review', { ...fields, version: 1, decision: 'approve' })
    expect(review.statusCode, review.body).toBe(200)
    const id = review.json().data.proposalId
    expect((await call('POST', '/api/project-proposals/' + id + '/confirm', { requestId: key(), version: 1, decision: 'return', reason: '材料仍需补充' }, owner)).statusCode).toBe(200)
    expect((await call('POST', '/api/demands/' + demand.id + '/review', { requestId: key(), version: 3, decision: 'return', reason: '请业务更新材料' })).statusCode).toBe(200)
    expect(await db.projectProposal.findUnique({ where: { id } })).toBeNull()
    expect((await call('PATCH', '/api/demands/' + demand.id, { requestId: key(), version: 4, name: '业务更新名称', description: '新说明', expectedLaunchDate: '2099-12-31', attachmentIds: [attachment.id], submit: true }, business)).statusCode).toBe(200)
    expect((await call('POST', '/api/project-proposals/' + id + '/resubmit', { ...input(), version: 2 })).statusCode).toBe(404)
    const fresh = await call('POST', '/api/demands/' + demand.id + '/review', { ...fields, requestId: key(), version: 5, decision: 'approve' })
    expect(fresh.statusCode, fresh.body).toBe(200)
    expect(fresh.json().data.proposalId).not.toBe(id)
    expect(await db.projectProposal.findUniqueOrThrow({ where: { demandId: demand.id } })).toMatchObject({ name: '业务更新名称' })
  })
  it('接单正式通知失败时整个项目创建事务回滚且可原请求重试', async () => {
    const { id } = await proposal(), body = { requestId: key(), version: 1, decision: 'accept' }
    await db.$executeRaw`ALTER TABLE notification_outbox ADD CONSTRAINT proposal_test_fault CHECK (event_type <> 'PROJECT_ASSIGNED') NOT VALID`
    try {
      expect((await call('POST', '/api/project-proposals/' + id + '/confirm', body, owner)).statusCode).toBe(500)
      expect(await db.projectProposal.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: 'pending', version: 1, projectId: null })
      expect(await db.commandReceipt.findUnique({ where: { actorId_key: { actorId: owner, key: body.requestId } } })).toBeNull()
    } finally { await db.$executeRaw`ALTER TABLE notification_outbox DROP CONSTRAINT proposal_test_fault` }
    expect((await call('POST', '/api/project-proposals/' + id + '/confirm', body, owner)).statusCode).toBe(200)
  })
  it('审批日期必填且合法，超期排期可保存、首次基准独立、历史项目不补基准', async () => {
    const { approvedLaunchDate: _date, ...missing } = input()
    expect((await call('POST', '/api/projects', missing)).statusCode).toBe(400)
    expect((await call('POST', '/api/projects', { ...input(), approvedLaunchDate: '2099-02-30' })).statusCode).toBe(400)
    const { id } = await proposal(), accepted = await confirm(id), projectId = accepted.json().data.projectId
    const plans = PLAN_STAGES.map((stage, index) => ({ stage, startDate: `2099-10-${String(index * 2 + 1).padStart(2, '0')}`, endDate: `2099-10-${String(index * 2 + 3).padStart(2, '0')}` }))
    const saved = await call('POST', `/api/projects/${projectId}/plan`, { requestId: key(), version: 1, plans }, owner)
    expect(saved.statusCode, saved.body).toBe(200)
    const row = await db.project.findUniqueOrThrow({ where: { id: projectId } })
    expect(row.approvedLaunchDate?.toISOString().slice(0, 10)).toBe('2099-10-08')
    expect(row.originalLaunchDate).toEqual(row.currentLaunchDate)
    expect(row.currentLaunchDate!.getTime()).toBeGreaterThan(row.approvedLaunchDate!.getTime())
    const legacy = await db.project.create({ data: { name: '历史正式项目', primaryOwnerId: owner } })
    expect(legacy.approvedLaunchDate).toBeNull()
    expect(await db.projectProposal.count({ where: { projectId: legacy.id } })).toBe(0)
  })
})
