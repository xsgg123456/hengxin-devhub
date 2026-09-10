import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mapLegacy,placeholderId} from './legacy-map.mjs'
const now=new Date('2026-09-09T12:00:00Z')
const user={id:'real',name:'真员工',dingUnionId:'union',department:'IT部',active:true}
const base={id:'p1',title:'真实项目',status:'ACTIVE',priorityCode:'P2',createdAt:'2026-08-01',updatedAt:'2026-09-01',members:[],progressLogs:[],progressUpdates:[]}
test('缺必填字段也保留项目；占位独立且全标记',()=>{
 const r=mapLegacy(base,[],now)
 assert.equal(r.project.primaryOwnerId,placeholderId)
 assert.equal(r.project.currentDeliveryDate.toISOString().slice(0,10),'2026-10-09')
 assert.equal(r.project.currentLaunchDate.toISOString().slice(0,10),'2026-10-02')
 assert.match(r.project.name,/迁移待核实/)
 assert.ok(r.updates.every(u=>u.authorId===placeholderId))
 assert.ok(r.histories.every(h=>!h.enteredAt&&!h.completedAt))
})
test('不按姓名冒配身份；非IT旧负责人使用占位',()=>{
 const p={...base,primaryEngineer:{name:user.name,dingTalkUnionId:'other'}}
 assert.equal(mapLegacy(p,[user],now).project.primaryOwnerId,placeholderId)
 p.primaryEngineer.dingTalkUnionId='union'
 assert.equal(mapLegacy(p,[{...user,department:'业务部'}],now).project.primaryOwnerId,placeholderId)
 assert.equal(mapLegacy(p,[user],now).project.primaryOwnerId,'real')
})
test('中国日期不偏一天；不把实际上线时间冒充计划',()=>{
 const r=mapLegacy({...base,plannedDoneAt:'2026-08-30T16:00:00Z',launchedAt:'2026-01-01',requirement:{status:'TRIAL',plannedDone:'2028-08-31'}},[],now)
 assert.equal(r.project.currentDeliveryDate.toISOString().slice(0,10),'2026-08-31')
 assert.equal(r.project.currentLaunchDate.toISOString().slice(0,10),'2026-08-24')
 assert.ok(r.notes.some(n=>n.includes('冲突')))
 assert.equal(r.project.overallProgress,90)
})
test('完成状态独立于交付阶段；范围外拒绝',()=>{
 const r=mapLegacy({...base,status:'COMPLETED',requirement:{status:'DEV'}},[],now)
 assert.equal(r.project.status,'COMPLETED');assert.equal(r.project.simpleStatus,'completed');assert.equal(r.project.overallProgress,100)
 assert.throws(()=>mapLegacy({...base,status:'CANCELLED'},[],now),/OUT_OF_SCOPE/)
})
test('进展作者匹配、无整体进度冒充、成员去重',()=>{
 const identity={dingTalkUnionId:'union'}
 const p={...base,primaryEngineer:identity,members:[{user:identity},{user:identity}],progressLogs:[{id:'l',body:'真实日志',author:identity,createdAt:'2026-08-01'}]}
 const r=mapLegacy(p,[user],now)
 assert.deepEqual(r.memberIds,[])
 const log=r.updates.find(u=>u.id==='legacy-progress-l')
 assert.equal(log.kind,'personal');assert.equal(log.overallProgress,undefined);assert.equal(log.authorId,'real')
})
