import {readFileSync} from 'node:fs'
import {mapLegacy,placeholderId} from './legacy-map.mjs'
const {parseEnv}=await import('/app/dist/config/env.js')
const {createPrisma}=await import('/app/dist/plugins/prisma.js')
const {computeRisks}=await import('/app/dist/modules/risks/risk-engine.js')
const env=parseEnv(process.env)
if(env.DINGTALK_NOTIFICATIONS_ENABLED||env.DEV_LOGIN)throw Error('PRODUCTION_AUTH_AND_NOTIFICATIONS_GUARD')
const url=new URL(env.DATABASE_URL)
if(process.env.MIGRATION_DATABASE){
  if(!/^itpc_migration_rehearsal_[a-z0-9_]+$/.test(process.env.MIGRATION_DATABASE))throw Error('INVALID_REHEARSAL_DATABASE')
  url.pathname='/'+process.env.MIGRATION_DATABASE
}
const db=createPrisma(url.toString()),data=JSON.parse(readFileSync(process.env.MIGRATION_INPUT??'/tmp/itpc-legacy-migration/snapshot.json','utf8'))
const apply=process.env.MIGRATION_APPLY==='true',now=new Date()
try{
 if(data.format!==1||data.projects.length!==74||new Set(data.projects.map(p=>p.id)).size!==74)throw Error('SNAPSHOT_SCOPE_MISMATCH')
 if(data.projects.filter(p=>p.status==='ACTIVE').length!==18||data.projects.filter(p=>p.status==='COMPLETED').length!==56)throw Error('STATE_COUNTS_MISMATCH')
 const users=await db.user.findMany(),mapped=data.projects.map(p=>mapLegacy(p,users,now))
 const managers=await db.managerGrant.findMany({where:{active:true},include:{user:true}})
 if(managers.length!==2||!managers.every(g=>['林炳辰','姚泽攀'].includes(g.user.name)))throw Error('MANAGER_ROSTER_MISMATCH')
 const placeholder=users.find(u=>u.id===placeholderId)
 if(placeholder&&(placeholder.dingUnionId||placeholder.dingUserId||placeholder.role!=='BUSINESS'||placeholder.name!=='迁移占位（待核实）'))throw Error('PLACEHOLDER_COLLISION')
 let result={inserted:0,existing:0}
 if(apply)result=await db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended('legacy-migration-20260909',0))::text`
   await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(current_schema() || ':project-risk-scan',0))::text`
   const count=await tx.notificationOutbox.count()
   const policy=(await tx.systemSetting.findUnique({where:{key:'risk-policy'}}))?.value
   await tx.user.upsert({where:{id:placeholderId},create:{id:placeholderId,name:'迁移占位（待核实）',department:'迁移占位',role:'BUSINESS',active:true},update:{}})
   let inserted=0,existing=0
   for(let i=0;i<mapped.length;i++){
     const row=mapped[i],id=row.project.id
     const present=await tx.project.findUnique({where:{id}})
     if(present){
       if(!await tx.auditLog.findFirst({where:{action:'legacy_import',entityId:id}}))throw Error('PROJECT_ID_COLLISION')
       existing++;continue
     }
     const risks=computeRisks(row.project,false,now,policy??undefined)
     await tx.project.create({data:{...row.project,risks,
       members:{create:row.memberIds.map(userId=>({userId}))},
       progressUpdates:{create:row.updates},stageHistories:{create:row.histories}}})
     await tx.auditLog.create({data:{action:'legacy_import',entityType:'project',entityId:id,payload:{
       batch:'legacy-20260909-v1',sourceProjectId:data.projects[i].id,source:data.projects[i],
       syntheticNotes:row.notes,fieldSources:row.fieldSources,skippedProgress:row.skippedProgress,skippedMembers:row.skippedMembers,operator:'user-authorized-migration',exportedAt:data.exportedAt}}})
     inserted++
   }
   if(await tx.notificationOutbox.count()!==count)throw Error('UNEXPECTED_NOTIFICATION')
   return {inserted,existing}
 },{timeout:120000})
 const imported=await db.project.count({where:{id:{in:mapped.map(p=>p.project.id)}}})
 if(apply&&imported!==74)throw Error('IMPORT_COUNT_MISMATCH')
 console.log(JSON.stringify({applied:apply,database:url.pathname,sourceCount:74,active:18,completed:56,...result,imported,
   placeholderOwnerCount:mapped.filter(r=>r.project.primaryOwnerId===placeholderId).length,
   markedProjects:mapped.length,compatibleProgress:mapped.reduce((n,r)=>n+r.updates.filter(u=>u.id.startsWith('legacy-progress-')).length,0),
   skippedProgress:mapped.reduce((n,r)=>n+r.skippedProgress,0),skippedMembers:mapped.reduce((n,r)=>n+r.skippedMembers,0),skippedMaterials:data.skipped,notificationsEnabled:env.DINGTALK_NOTIFICATIONS_ENABLED}))
}finally{await db.$disconnect()}

