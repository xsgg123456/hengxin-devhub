import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { parseEnv } from '../../config/env.js'
import { createPrisma } from '../../plugins/prisma.js'
import { DemandService } from './demand-service.js'
import { ApprovalService } from '../approvals/approval-service.js'
import { createProject } from '../projects/project-service.js'

const env = parseEnv(process.env)
if (env.NODE_ENV !== 'test' || !env.S3_BUCKET.startsWith('itpc-test-') ||
  !new URL(env.DATABASE_URL).searchParams.get('schema')?.startsWith('itpc_test_'))
  throw new Error('必须由隔离集成测试入口运行')
const db = createPrisma(env.DATABASE_URL)
afterAll(() => db.$disconnect())
const demands = new DemandService(db, env.PROJECT_APPROVER_DING_USER_ID)
const approvals = new ApprovalService(db, env.PROJECT_APPROVER_DING_USER_ID)
const key = () => randomUUID()
const draft = () => ({ requestId: key(), name: '首次日期审计专项', description: '实际业务需求',
  expectedLaunchDate: '2099-12-31', submit: false })

describe('需求首次日期与独立流转审计', () => {
  it('提交、退回、重提原子持久化；重复请求不重复事件，旧版本不产生事件', async () => {
    const actor = await db.user.findUniqueOrThrow({ where: { id: 'user-business-li' } })
    const manager = await db.user.findUniqueOrThrow({ where: { id: 'user-manager-chen' } })
    const input = draft()
    const created = await demands.create(actor, input)
    expect((await db.demand.findUniqueOrThrow({where:{id:created.id}})).firstRequestedOn).toBeNull()
    expect(await db.lifecycleEvent.count({ where: { entityId: created.id } })).toBe(0)
    const attachment = await db.attachment.create({ data: { demandId: created.id, uploaderId: actor.id,
      kind: 'FILE', name: 'fixture.txt', mime: 'text/plain', size: 1, objectKey: `attachments/${key()}`,
      status: 'READY', expiresAt: new Date('2099-01-01') } })
    const submission = { ...draft(), version: 1, attachmentIds: [attachment.id], submit: true }
    await expect(demands.save(actor,created.id,{...submission,attachmentIds:[]})).rejects.toThrow()
    expect((await db.demand.findUniqueOrThrow({where:{id:created.id}})).firstRequestedOn).toBeNull()
    await demands.save(actor, created.id, submission)
    await demands.save(actor, created.id, submission)
    const submitted = await db.demand.findUniqueOrThrow({ where: { id: created.id } })
    const day = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(submitted.submittedAt!)
    expect(submitted.firstRequestedOn?.toISOString()).toBe(`${day}T00:00:00.000Z`)
    const returned = { requestId: key(), version: 2, decision: 'return', reason: '请补充业务背景' }
    await approvals.review(manager, created.id, returned)
    await approvals.review(manager, created.id, returned)
    const resubmission = { ...submission, requestId: key(), version: 3, description: '已补充业务背景' }
    await demands.save(actor, created.id, resubmission)
    await demands.save(actor, created.id, resubmission)
    await expect(demands.save(actor, created.id, { ...resubmission, requestId: key() }))
      .rejects.toMatchObject({ code: 'VERSION_CONFLICT' })
    const updated = await db.demand.findUniqueOrThrow({ where: { id: created.id } })
    expect(updated.firstRequestedOn).toEqual(submitted.firstRequestedOn)
    expect(updated.submittedAt!.getTime()).toBeGreaterThanOrEqual(submitted.submittedAt!.getTime())
    expect(updated.ownerId).toBe(actor.id)
    const events = await db.lifecycleEvent.findMany({ where: { entityType: 'demand', entityId: created.id }, orderBy: { createdAt: 'asc' } })
    expect(events.map(event => event.action)).toEqual(['submit', 'return', 'resubmit'])
    expect(events.map(event => event.authorId)).toEqual([actor.id, manager.id, actor.id])
    expect(events[0]).toMatchObject({ before: { status: 'DRAFT' }, after: { status: 'PENDING' } })
    expect(events[1]).toMatchObject({ reason: returned.reason, before: { status: 'PENDING' }, after: { status: 'RETURNED' } })
    expect(events[2]).toMatchObject({ before: { status: 'RETURNED', reviewReason: returned.reason }, after: { status: 'PENDING', reviewReason: '' } })
    expect(events.every(event => event.createdAt instanceof Date && event.reason.length > 0)).toBe(true)
    const project = await db.$transaction(tx => createProject(tx, { requestId: key(), name: updated.name,
      department: updated.department, priority: 'P1', approvedLaunchDate: '2099-12-31',
      primaryOwnerId: 'user-engineer-wang', collaboratorIds: [] }, created.id))
    expect(project).toMatchObject({ firstRequestedOn: updated.firstRequestedOn, businessOwnerId: actor.id,
      description: updated.description })
  })

  it('业务接口拒绝篡改或清空首次日期，已补录历史日期不覆盖', async () => {
    const actor = await db.user.findUniqueOrThrow({ where: { id: 'user-business-li' } })
    const created = await demands.create(actor, draft())
    expect((await db.demand.findUniqueOrThrow({ where: { id: created.id } })).firstRequestedOn).toBeNull()
    await expect(demands.save(actor, created.id, { ...draft(), version: 1, firstRequestedOn: '9999-12-31' })).rejects.toThrow()
    await expect(demands.save(actor, created.id, { ...draft(), version: 1, firstRequestedOn: '2020-01-01' })).rejects.toThrow()
    await expect(demands.save(actor, created.id, { ...draft(), version: 1, firstRequestedOn: null })).rejects.toThrow()
    expect((await db.demand.findUniqueOrThrow({ where: { id: created.id } })).firstRequestedOn).toBeNull()
    await db.demand.update({where:{id:created.id},data:{status:'RETURNED',submittedAt:new Date('2020-01-01'),firstRequestedOn:new Date('2020-01-01')}})
    await demands.save(actor,created.id,{...draft(),version:1})
    expect((await db.demand.findUniqueOrThrow({where:{id:created.id}})).firstRequestedOn?.toISOString()).toBe('2020-01-01T00:00:00.000Z')
  })
})
