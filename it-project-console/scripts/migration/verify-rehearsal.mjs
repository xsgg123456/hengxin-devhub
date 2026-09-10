import {randomBytes,createHash} from 'node:crypto'
import {parseEnv} from '/app/dist/config/env.js'
import {createPrisma} from '/app/dist/plugins/prisma.js'
import {buildApp} from '/app/dist/app.js'
const env=parseEnv(process.env),url=new URL(env.DATABASE_URL)
if(!/^itpc_migration_rehearsal_[a-z0-9_]+$/.test(process.env.MIGRATION_DATABASE??''))throw Error('ONLY_ISOLATED_DATABASE')
url.pathname='/'+process.env.MIGRATION_DATABASE;env.DATABASE_URL=url.toString()
const db=createPrisma(env.DATABASE_URL),{app}=await buildApp(env,{db,logging:false})
const token=randomBytes(32).toString('hex'),tokenHash=createHash('sha256').update(token).digest('hex')
try{
 const actor=await db.user.findFirstOrThrow({where:{name:'张帅',dingUnionId:{not:null},active:true}})
 await db.session.create({data:{userId:actor.id,tokenHash,expiresAt:new Date(Date.now()+60000)}})
 const headers={cookie:`itpc_session=${token}`,'user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/132.0.0.0'}
 const checks=[]
 for(const path of ['/api/workspace','/api/dashboard?scope=all','/api/gantt?scope=all&month=2026-09','/api/workload?scope=all&month=2026-09']){
   const res=await app.inject({method:'GET',url:path,headers})
   if(res.statusCode!==200)throw Error(`${path}:${res.statusCode}`)
   if(path==='/api/workspace'){
     const data=res.json().data.database,projects=data.projects.filter(p=>p.id.startsWith('legacy-'))
     if(projects.length!==74||projects.filter(p=>p.status==='active').length!==18||projects.filter(p=>p.status==='completed').length!==56)throw Error('WORKSPACE_COUNTS')
     if(!data.users.some(u=>u.id==='legacy-migration-placeholder'&&u.name==='迁移占位（待核实）'))throw Error('PLACEHOLDER_NOT_VISIBLE')
     if(projects.some(p=>!data.progressUpdates.some(u=>u.projectId===p.id&&u.summary.startsWith('迁移说明'))))throw Error('NOTES_MISSING')
   }
   checks.push({path,status:res.statusCode})
 }
 const id=(await db.project.findFirstOrThrow({where:{id:{startsWith:'legacy-'}},orderBy:{id:'asc'}})).id
 const marker='【演练人工修正】不允许重跑覆盖'
 if(process.env.VERIFY_AFTER_REPEAT==='true'){
   if((await db.project.findUniqueOrThrow({where:{id}})).name!==marker)throw Error('MANUAL_EDIT_OVERWRITTEN')
 }else await db.project.update({where:{id},data:{name:marker}})
 const counts={projects:await db.project.count(),audit:await db.auditLog.count({where:{action:'legacy_import'}}),managers:await db.managerGrant.count({where:{active:true}}),notifications:await db.notificationOutbox.count()}
 if(counts.audit!==74||counts.managers!==2)throw Error('AUDIT_OR_ROSTER')
 console.log(JSON.stringify({checks,counts,manualEditPreserved:process.env.VERIFY_AFTER_REPEAT==='true'}))
}finally{await db.session.deleteMany({where:{tokenHash}});await app.close();await db.$disconnect()}
