import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.js'
import { parseEnv } from '../../config/env.js'
import { createPrisma } from '../../plugins/prisma.js'
import { mapProject } from '../workspace/read-model.js'
import { projectEditSchema } from './project-edit-schemas.js'
import { ProjectEditService } from './project-edit-service.js'
import { AcceptanceService } from './acceptance-service.js'
import { assigned } from '../dashboard/dashboard-service.js'
const env = parseEnv(process.env), url = new URL(env.DATABASE_URL)
if (env.NODE_ENV !== 'test' || !['localhost','127.0.0.1'].includes(url.hostname) ||
  !url.searchParams.get('schema')?.startsWith('itpc_test_') || !env.S3_BUCKET.startsWith('itpc-test-')) throw new Error('必须使用隔离测试环境')
const db = createPrisma(env.DATABASE_URL), key = () => randomUUID()
const manager = 'user-manager-chen', engineer = 'user-engineer-wang', collab = 'user-engineer-zhao', business = 'user-business-li'
let runtime: Awaited<ReturnType<typeof buildApp>>
const cookies: Record<string,string> = {}
beforeAll(async () => {
  runtime = await buildApp(env, { logging:false }); await runtime.app.ready()
  for (const userId of [manager,engineer,collab,business]) {
    const response = await runtime.app.inject({ method:'POST',url:'/api/auth/dev-login',payload:{userId},headers:{origin:env.WEB_ORIGIN} })
    expect(response.statusCode).toBe(200); cookies[userId] = response.cookies.map(c=>`${c.name}=${c.value}`).join('; ')
  }
})
afterAll(async()=>{await runtime?.app.close(); await db.$disconnect()})
const row = (id:string) => db.project.findUniqueOrThrow({where:{id},include:{members:true}})
async function fixture(pending=true) {
  const demand=await db.demand.create({data:{name:'原业务需求',ownerId:business,status:'APPROVED',submittedAt:new Date('2024-01-01')}})
  return db.project.create({data:{name:'【迁移待核实】权限测试',description:'原说明',department:'测试部',primaryOwnerId:engineer,
    demandId:demand.id,businessOwnerId:business,acceptanceOwnerId:business,migrationVerified:!pending,
    firstRequestedOn:new Date('2024-01-01'),currentLaunchDate:new Date('2026-12-01'),currentDeliveryDate:new Date('2026-12-02'),
    members:{create:{userId:collab}}},include:{members:true}})
}
function input(p:Awaited<ReturnType<typeof row>>,extra:Record<string,unknown>={}) {
  const mapped=mapProject(p)
  const fields=Object.fromEntries(Object.keys(projectEditSchema.shape).filter(k=>k in mapped).map(k=>[k,mapped[k as keyof typeof mapped]]))
  fields.stagePlans=(mapped.stagePlans??[]).map(({stage,startDate,endDate})=>({stage,startDate,endDate}))
  return {...fields,requestId:key(),version:p.version,reason:'按业务原始资料核对',verify:false,...extra}
}
const save=(id:string,payload:Record<string,unknown>,user=manager)=>runtime.app.inject({method:'POST',url:`/api/projects/${id}/edit`,payload,headers:{cookie:cookies[user],origin:env.WEB_ORIGIN}})
describe('正式完整编辑API',()=>{
  it('显式清空业务负责人不恢复原提出人，后续完成通知只按当前人员产生',async()=>{
    const p=await fixture(), next=await db.user.create({data:{name:'业务验收专员',department:'业务',role:'BUSINESS'}})
    const plan={stage:'验收交付',startDate:'2026-12-02',endDate:'2026-12-02',originalStartDate:'2026-12-02',originalEndDate:'2026-12-02'}
    await db.project.update({where:{id:p.id},data:{stage:'验收交付',stagePlans:[plan],simpleStatus:'in-progress',acceptanceStatus:'pending',acceptanceRound:1}})
    const pending=await row(p.id)
    expect((await save(p.id,input(pending,{businessOwnerId:null,acceptanceOwnerId:next.id}))).statusCode).toBe(200)
    const changed=await row(p.id)
    expect(assigned(mapProject(changed),business)).toBe(false)
    expect(assigned(mapProject(changed),next.id)).toBe(true)
    await new AcceptanceService(db).act(next,p.id,{requestId:key(),version:changed.version,action:'accept'})
    const notifications=await db.notificationOutbox.findMany({where:{projectId:p.id,eventType:'PROJECT_COMPLETED'}})
    expect(notifications.map(n=>n.recipientId).sort()).toEqual([engineer,collab].sort())
    expect((await db.demand.findUniqueOrThrow({where:{id:p.demandId!}})).ownerId).toBe(business)
  })
  it('仅当前迁移主责与指定管理员获权，正常及名称伪造不得提权',async()=>{
    const p=await fixture()
    for(const user of [collab,business]) expect((await save(p.id,input(p,{primaryOwnerId:user}),user)).statusCode).toBe(403)
    const actual=await db.user.findUniqueOrThrow({where:{id:manager}})
    await expect(new ProjectEditService(db,'different-employee').save(actual,p.id,input(p))).rejects.toMatchObject({statusCode:403})
    const normal=await fixture(false)
    expect((await save(normal.id,input(normal),engineer)).statusCode).toBe(403)
    expect((await save(p.id,input(p,{description:'主责已核对'}),engineer)).statusCode).toBe(200)
    expect((await row(p.id)).description).toBe('主责已核对')
    expect((await db.lifecycleEvent.findFirstOrThrow({where:{entityId:p.id}})).authorId).toBe(engineer)
    expect((await save(normal.id,input(normal,{description:'管理员纠正'}))).statusCode).toBe(200)
  })
  it('转交后旧主责失权、核实后新主责失权，重复请求不重复修改',async()=>{
    const p=await fixture(), first=input(p,{primaryOwnerId:collab,collaboratorIds:[]})
    const calls=await Promise.all([save(p.id,first,engineer),save(p.id,first,engineer)])
    expect(calls.map(c=>c.statusCode)).toEqual([200,200]); expect(calls[0].json()).toEqual(calls[1].json())
    const transferred=await row(p.id)
    expect(transferred.version).toBe(2)
    expect((await save(p.id,input(transferred),engineer)).statusCode).toBe(403)
    expect((await save(p.id,input(transferred,{verify:true}),collab)).statusCode).toBe(200)
    const verified=await row(p.id)
    expect(verified.migrationVerified).toBe(true); expect(verified.name).not.toContain('迁移待核实')
    expect((await save(p.id,input(verified),collab)).statusCode).toBe(403)
    expect((await save(p.id,input(verified,{name:'管理员修订'}))).statusCode).toBe(200)
    expect(await db.lifecycleEvent.count({where:{entityId:p.id,entityType:'project'}})).toBe(3)
  })
  it('同步需求日期且保留历史时间，版本冲突及无效字段原子拒绝',async()=>{
    const initial=await fixture()
    await db.project.update({where:{id:initial.id},data:{stageExpectedDate:new Date('2026-11-15')}})
    const p=await row(initial.id), oldDemand=await db.demand.findUniqueOrThrow({where:{id:p.demandId!}})
    for(const extra of [{firstRequestedOn:'2999-01-01'},{firstRequestedOn:'2024-02-30'}, {status:'COMPLETED'},
      {acceptanceStatus:'accepted'}, {collaboratorIds:[engineer]}, {verify:true,firstRequestedOn:null},
      {simpleStatus:'completed'}, {stagePlans:[{stage:'方案设计',startDate:'2026-12-02',endDate:'2026-12-01'}]}])
      expect((await save(p.id,input(p,extra))).statusCode).toBe(400)
    expect((await row(p.id)).version).toBe(1)
    expect((await save(p.id,input(p,{firstRequestedOn:'2023-12-15'}))).statusCode).toBe(200)
    expect((await save(p.id,input(p))).statusCode).toBe(409)
    const d=await db.demand.findUniqueOrThrow({where:{id:p.demandId!}}), changed=await row(p.id)
    expect(d.firstRequestedOn?.toISOString().slice(0,10)).toBe('2023-12-15')
    expect(d.submittedAt).toEqual(oldDemand.submittedAt); expect(changed.createdAt).toEqual(p.createdAt)
    expect(changed.lastOverallUpdatedAt).toEqual(p.lastOverallUpdatedAt)
    expect(changed.stageExpectedDate).toEqual(p.stageExpectedDate)
    expect(await db.lifecycleEvent.count({where:{entityType:'demand',entityId:d.id,action:'edit'}})).toBe(1)
  })
  it('待验收改派保留历史并让旧待办失效，七环节计划可读取',async()=>{
    const p=await fixture()
    const second=await db.user.create({data:{name:'新业务负责人',department:'业务',role:'BUSINESS'}})
    await db.project.update({where:{id:p.id},data:{stage:'验收交付',simpleStatus:'in-progress',acceptanceStatus:'pending',acceptanceRound:1}})
    const notice=await db.notificationOutbox.create({data:{projectId:p.id,recipientId:business,eventType:'ACCEPTANCE_SUBMITTED',idempotencyKey:key(),payload:{acceptanceRound:1}}})
    const pending=await row(p.id)
    expect((await save(p.id,input(pending,{acceptanceOwnerId:second.id,businessOwnerId:second.id}))).statusCode).toBe(200)
    expect((await db.notificationOutbox.findUniqueOrThrow({where:{id:notice.id}})).status).toBe('FAILED')
    expect(await db.notificationOutbox.count({where:{projectId:p.id,eventType:'ACCEPTANCE_SUBMITTED',recipientId:second.id,status:'PENDING'}})).toBe(1)
    const changed=await row(p.id)
    expect(changed.acceptanceHistory).toEqual(expect.arrayContaining([expect.objectContaining({action:'assign',actorId:manager,ownerId:second.id})]))
    expect((await save(p.id,input(changed,{stage:'开发编码'}))).statusCode).toBe(400)
    const fresh=await fixture()
    const stages=['需求受理','立项评审','方案设计','开发编码','联调测试','上线部署','验收交付']
    const plans=stages.map(stage=>({stage,startDate:'2026-12-01',endDate:'2026-12-01'}))
    expect((await save(fresh.id,input(fresh,{stagePlans:plans,expectedDeliveryDate:'2026-12-01'}))).statusCode).toBe(200)
    expect(mapProject(await row(fresh.id)).stagePlans).toHaveLength(7)
  })
})
