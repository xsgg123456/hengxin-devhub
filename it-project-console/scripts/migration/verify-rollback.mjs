import {readFileSync} from 'node:fs'
import {spawnSync} from 'node:child_process'
import {parseEnv} from '/app/dist/config/env.js'
import {createPrisma} from '/app/dist/plugins/prisma.js'
if(process.env.MIGRATION_DATABASE!=='itpc_migration_rehearsal_rollback')throw Error('ONLY_FAULT_TEST_DATABASE')
const env=parseEnv(process.env),url=new URL(env.DATABASE_URL)
url.pathname='/'+process.env.MIGRATION_DATABASE
const db=createPrisma(url.toString()),data=JSON.parse(readFileSync('/tmp/itpc-legacy-migration/snapshot.json','utf8'))
try{
 const owner=await db.user.findFirstOrThrow({where:{active:true,department:'IT部'}})
 const last=data.projects.at(-1)
 await db.project.create({data:{id:`legacy-${last.id}`,name:'仅隔离故障测试：ID冲突',primaryOwnerId:owner.id}})
 const before={projects:await db.project.count(),outbox:await db.notificationOutbox.count()}
 const child=spawnSync(process.execPath,['/tmp/itpc-legacy-migration/import-legacy.mjs'],{env:{...process.env,MIGRATION_APPLY:'true'},encoding:'utf8',timeout:120000})
 if(child.status===0||!child.stderr.includes('PROJECT_ID_COLLISION'))throw Error('EXPECTED_COLLISION_NOT_RAISED')
 const after={projects:await db.project.count(),outbox:await db.notificationOutbox.count()}
 if(JSON.stringify(before)!==JSON.stringify(after)||await db.auditLog.count({where:{action:'legacy_import'}})!==0||await db.user.findUnique({where:{id:'legacy-migration-placeholder'}}))throw Error('PARTIAL_WRITES_NOT_ROLLED_BACK')
 console.log(JSON.stringify({rollback:'PASS',failureAt:'last-project-id-collision',before,after,partialImports:0}))
}finally{await db.$disconnect()}
