import {readFileSync} from 'node:fs'
import {csvHash,mapCsv} from './csv-map.mjs'
import {placeholderId} from './legacy-map.mjs'
import {parseEnv} from '/app/dist/config/env.js'
import {createPrisma} from '/app/dist/plugins/prisma.js'
import {computeRisks} from '/app/dist/modules/risks/risk-engine.js'
const env=parseEnv(process.env),url=new URL(env.DATABASE_URL)
if(env.DINGTALK_NOTIFICATIONS_ENABLED||env.DEV_LOGIN)throw Error('ENVIRONMENT_GUARD')
if(process.env.CSV_DATABASE){
 if(!/^itpc_csv_rehearsal_[a-z0-9_]+$/.test(process.env.CSV_DATABASE))throw Error('INVALID_REHEARSAL_DATABASE')
 url.pathname='/'+process.env.CSV_DATABASE
}
const db=createPrisma(url.toString()),input=JSON.parse(readFileSync(process.env.CSV_INPUT??'/tmp/itpc-csv-replace/input.json','utf8'))
const marker=`csv-replacement:${csvHash}`,apply=process.env.CSV_APPLY==='true',now=new Date()
try{
 if(input.format!=='projects-csv-v1'||input.sha256!==csvHash||input.rows.length!==20||new Set(input.rows.map(r=>r.row)).size!==20)throw Error('CSV_SCOPE_GUARD')
 if(input.rows.filter(r=>r.fields['状态']==='交付中').length!==18||input.rows.filter(r=>r.fields['状态']==='IT 审批中').length!==2)throw Error('CSV_STATES_GUARD')
 const result=await db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended('csv-replacement-20260909',0))::text`
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(current_schema() || ':project-risk-scan',0))::text`
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(current_schema() || ':notification-flush',0))::text`
  if(await tx.systemSetting.findUnique({where:{key:marker}}))return {alreadyApplied:true,projects:await tx.project.count(),demands:await tx.demand.count()}
  const users=await tx.user.findMany(),sources=await tx.auditLog.findMany({where:{action:'legacy_import'}})
  if(sources.length!==74)throw Error('OLD_BATCH_AUDIT_GUARD')
  const mapped=input.rows.map(r=>mapCsv(r,users,sources.map(s=>s.payload.source),now))
  const managers=await tx.managerGrant.findMany({where:{active:true},include:{user:true}})
  if(managers.length!==2||!managers.every(g=>['林炳辰','姚泽攀'].includes(g.user.name)))throw Error('MANAGER_ROSTER_GUARD')
  const placeholder=users.find(u=>u.id===placeholderId)
  if(!placeholder||placeholder.dingUnionId||placeholder.dingUserId||placeholder.role!=='BUSINESS')throw Error('PLACEHOLDER_GUARD')
  const testProject='cmttxi4zv004r07r1ui8u7b81',testDemand='6086c9c6-cf9d-4f26-8b53-e7888a0dec57'
  const allowed=new Set([...sources.map(s=>s.entityId),testProject]),projects=await tx.project.findMany(),demands=await tx.demand.findMany()
  if(projects.length!==75||projects.some(p=>!allowed.has(p.id))||demands.length!==1||demands[0].id!==testDemand)throw Error('UNEXPECTED_DATA_DO_NOT_CLEAR')
  if(!projects.find(p=>p.id===testProject)?.name.startsWith('【联调测试】')||!demands[0].name.startsWith('【联调测试】'))throw Error('TEST_DATA_IDENTITY_GUARD')
  const files=await tx.attachment.findMany()
  if(files.length!==2||files.some(f=>f.demandId!==testDemand))throw Error('UNEXPECTED_FILES_DO_NOT_CLEAR')
  const pids=projects.map(p=>p.id)
  const queue=await tx.notificationOutbox.findMany()
  if(queue.some(n=>!pids.includes(n.projectId)&&n.demandId!==testDemand))throw Error('UNRELATED_NOTIFICATIONS')
  const plan={alreadyApplied:false,applied:apply,removeProjects:75,removeDemands:1,removeAttachmentRecords:2,removePendingNotifications:queue.length,
    projects:18,demands:2,placeholderProjects:mapped.filter(r=>r.kind==='project'&&r.mapped.project.primaryOwnerId===placeholderId).map(r=>r.raw.fields['项目名称']),
    preservedAttachmentObjects:files.map(f=>({key:f.objectKey,size:f.size}))}
  if(!apply)return plan
  await tx.notificationOutbox.deleteMany({where:{id:{in:queue.map(n=>n.id)}}})
  await tx.lifecycleEvent.deleteMany({where:{OR:[{entityType:'project',entityId:{in:pids}},{entityType:'demand',entityId:testDemand}]}})
  await tx.project.deleteMany({where:{id:{in:pids}}})
  await tx.objectDeletion.deleteMany({where:{objectKey:{in:files.map(f=>f.objectKey)}}})
  await tx.attachment.deleteMany({where:{id:{in:files.map(f=>f.id)}}})
  await tx.demand.delete({where:{id:testDemand}})
  const policy=(await tx.systemSetting.findUnique({where:{key:'risk-policy'}}))?.value
  for(const row of mapped){
   if(row.kind==='project'){
    const m=row.mapped
    await tx.project.create({data:{...m.project,risks:computeRisks(m.project,false,now,policy??undefined),
     members:{create:m.memberIds.map(userId=>({userId}))},progressUpdates:{create:m.updates},stageHistories:{create:m.histories}}})
   }else await tx.demand.create({data:row.data})
   await tx.auditLog.create({data:{action:'csv_import',entityType:row.kind,entityId:row.id,payload:{sourceHash:csvHash,csv:row.raw,fieldSources:row.kind==='project'?row.mapped.fieldSources:row.mapping}}})
  }
  if(await tx.project.count()!==18||await tx.demand.count()!==2||await tx.notificationOutbox.count()!==0)throw Error('CSV_RESULT_GUARD')
  await tx.systemSetting.create({data:{key:marker,value:{completedAt:now.toISOString(),projects:18,demands:2}}})
  await tx.auditLog.create({data:{action:'csv_replacement',entityType:'migration_batch',entityId:csvHash,payload:{...plan,backup:'20260909-before-csv20.dump',clearedProjectIds:pids}}})
  return plan
 },{timeout:120000})
 console.log(JSON.stringify(result))
}finally{await db.$disconnect()}
