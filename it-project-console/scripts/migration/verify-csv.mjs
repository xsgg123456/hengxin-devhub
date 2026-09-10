import {randomBytes,createHash} from 'node:crypto'
import {readFileSync,writeFileSync,unlinkSync} from 'node:fs'
import {spawnSync} from 'node:child_process'
import {parseEnv} from '/app/dist/config/env.js'
import {createPrisma} from '/app/dist/plugins/prisma.js'
import {buildApp} from '/app/dist/app.js'
const env=parseEnv(process.env),url=new URL(env.DATABASE_URL)
if(!/^itpc_csv_rehearsal_[a-z0-9_]+$/.test(process.env.CSV_DATABASE??''))throw Error('ONLY_ISOLATED_DATABASE')
url.pathname='/'+process.env.CSV_DATABASE;env.DATABASE_URL=url.toString()
const db=createPrisma(env.DATABASE_URL),token=randomBytes(32).toString('hex'),tokenHash=createHash('sha256').update(token).digest('hex')
let app
const counts=async()=>({projects:await db.project.count(),demands:await db.demand.count(),attachments:await db.attachment.count(),notifications:await db.notificationOutbox.count(),imports:await db.auditLog.count({where:{action:'csv_import'}})})
const models=['department','user','managerGrant','session','demand','project','projectMember','attachment','notificationOutbox','systemSetting','auditLog','stageHistory','commandReceipt','objectDeletion','progressUpdate','scheduleChange','lifecycleEvent','riskSnapshot','notificationLog','authChallenge']
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value
const fingerprints=async()=>Object.fromEntries(await Promise.all(models.map(async model=>{
 const rows=JSON.parse(JSON.stringify(await db[model].findMany())).map(row=>JSON.stringify(canonical(row))).sort()
 return [model,createHash('sha256').update(JSON.stringify(rows)).digest('hex')]
})))
try{
 if(process.env.CSV_VERIFY_MODE==='fault'){
  if(process.env.CSV_DATABASE!=='itpc_csv_rehearsal_fault')throw Error('ONLY_FAULT_DATABASE')
  const before=await counts(),beforeHashes=await fingerprints(),bad=JSON.parse(readFileSync('/tmp/itpc-csv-replace/input.json','utf8')),path='/tmp/itpc-csv-fault.json'
  bad.rows.at(-1).fields['部门']={intentional:'last-row-invalid-type'}
  writeFileSync(path,JSON.stringify(bad))
  const child=spawnSync(process.execPath,['/tmp/itpc-csv-replace/replace-csv.mjs'],{env:{...process.env,CSV_APPLY:'true',CSV_INPUT:path},encoding:'utf8',timeout:120000})
  unlinkSync(path)
  const after=await counts(),afterHashes=await fingerprints()
  if(child.status===0||!child.stderr.includes('PrismaClientValidationError')||JSON.stringify(before)!==JSON.stringify(after)||JSON.stringify(beforeHashes)!==JSON.stringify(afterHashes))throw Error('ROLLBACK_FAILED')
  console.log(JSON.stringify({rollback:'PASS',tablesVerified:models.length,contentsUnchanged:true,before,after}));
 }else{
  const actor=await db.user.findFirstOrThrow({where:{name:'吴永杰',active:true,dingUnionId:{not:null}}})
  await db.session.create({data:{userId:actor.id,tokenHash,expiresAt:new Date(Date.now()+60000)}})
  ;({app}=await buildApp(env,{db,logging:false}))
  const checks=[]
  for(const path of ['/api/workspace','/api/dashboard?scope=all','/api/gantt?scope=all&month=2026-09','/api/demand-statistics?scope=all']){
   const res=await app.inject({method:'GET',url:path,headers:{cookie:`itpc_session=${token}`,'user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/132.0.0.0'}})
   if(res.statusCode!==200)throw Error(`${path}:${res.statusCode}`)
   if(path==='/api/workspace'){
    const d=res.json().data.database
    if(d.projects.length!==18||d.projects.some(p=>p.status!=='active'||!p.id.startsWith('csv-'))||d.demands.length!==2||d.demands.some(p=>p.status!=='pending'))throw Error('WORKSPACE_MISMATCH')
    if(d.projects.some(p=>!d.progressUpdates.some(u=>u.projectId===p.id&&u.summary.startsWith('CSV原始资料'))))throw Error('CSV_NOTES_MISSING')
   }
   checks.push({path,status:res.statusCode})
  }
  const id=(await db.project.findFirstOrThrow({orderBy:{id:'asc'}})).id,marker='仅演练人工修正，重复替换不得覆盖'
  if(process.env.CSV_VERIFY_MODE==='repeat'){
   if((await db.project.findUniqueOrThrow({where:{id}})).name!==marker)throw Error('MANUAL_CHANGE_OVERWRITTEN')
  }else await db.project.update({where:{id},data:{name:marker}})
  console.log(JSON.stringify({checks,counts:await counts(),manualChangePreserved:process.env.CSV_VERIFY_MODE==='repeat'}))
 }
}finally{await db.session.deleteMany({where:{tokenHash}});if(app)await app.close();await db.$disconnect()}
