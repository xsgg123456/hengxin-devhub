import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {parseEnv} from '/app/dist/config/env.js'
import {createPrisma} from '/app/dist/plugins/prisma.js'
import {csvHash,csvDate} from './csv-map.mjs'
const env=parseEnv(process.env),db=createPrisma(env.DATABASE_URL)
try{
 const input=JSON.parse(readFileSync('/tmp/itpc-csv-replace/input.json','utf8'))
 const projects=await db.project.findMany(),demands=await db.demand.findMany(),audits=await db.auditLog.findMany({where:{action:'csv_import'}})
 assert.equal(projects.length,18);assert.equal(demands.length,2);assert.equal(audits.length,20)
 for(const row of input.rows){
  const f=row.fields,id=`csv-${csvHash.slice(0,12)}-${row.row}`,isProject=f['状态']==='交付中'
  const record=(isProject?projects:demands).find(r=>r.id===id)
  assert.ok(record);assert.equal(record.name,isProject?'【迁移待核实】'+f['项目名称']:f['项目名称'])
  assert.equal(record.department,f['部门']);assert.equal(record.status,isProject?'ACTIVE':'PENDING')
  assert.equal(record.createdAt.toISOString().slice(0,10),csvDate(f['开始时间']))
  assert.equal((isProject?record.currentDeliveryDate:record.expectedLaunchDate)?.toISOString().slice(0,10),csvDate(f['计划完成']))
  const audit=audits.find(a=>a.entityId===id)
  assert.equal(audit?.payload.sourceHash,csvHash);assert.deepEqual(audit.payload.csv.rawFields,row.rawFields)
 }
 const managers=(await db.managerGrant.findMany({where:{active:true},include:{user:true}})).map(g=>g.user.name).sort()
 assert.deepEqual(managers,['姚泽攀','林炳辰'].sort())
 assert.equal(await db.attachment.count(),0);assert.equal(await db.notificationOutbox.count(),0)
 assert.equal(env.DINGTALK_NOTIFICATIONS_ENABLED,false)
 assert.ok(await db.systemSetting.findUnique({where:{key:`csv-replacement:${csvHash}`}}))
 console.log(JSON.stringify({verified:true,projects:18,pendingDemands:2,csvRowsChecked:20,rawAuditRows:20,attachments:0,notifications:0,managers,notificationsEnabled:false,placeholderProjects:projects.filter(p=>p.primaryOwnerId==='legacy-migration-placeholder').map(p=>p.name)}))
}finally{await db.$disconnect()}
