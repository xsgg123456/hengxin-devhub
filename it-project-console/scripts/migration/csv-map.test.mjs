import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mapCsv,csvDate} from './csv-map.mjs'
const now=new Date('2026-09-09T12:00:00Z')
const f={'项目名称':'项目甲','状态':'交付中','业务负责人':'甲','AI工程师':'乙','紧急程度':'P2','部门':'业务部','开始时间':'2026/8/7','计划完成':'2026/9/30','实际完成时间':'','月节省工时':'50'}
const users=[{id:'a',name:'甲',active:true,dingUnionId:'ua',department:'业务部'},{id:'b',name:'乙',active:true,dingUnionId:'ub',department:'IT部'}]
test('CSV日期部门和负责人优先；阶段从同名旧资料补充',()=>{
 const r=mapCsv({row:2,fields:f},users,[{title:'项目甲',requirement:{status:'TEST',plannedDone:'2028-08-31'}}],now)
 assert.equal(r.mapped.project.createdAt.toISOString().slice(0,10),'2026-08-07')
 assert.equal(r.mapped.project.currentDeliveryDate.toISOString().slice(0,10),'2026-09-30')
 assert.equal(r.mapped.project.primaryOwnerId,'b');assert.equal(r.mapped.project.department,'业务部')
 assert.equal(r.mapped.project.stage,'联调测试')
 assert.equal(r.mapped.project.stageExpectedDate,null)
})
test('审批中保持待评估，不生成已立项项目或伪造材料',()=>{
 const r=mapCsv({row:3,fields:{...f,'状态':'IT 审批中'}},users,[],now)
 assert.equal(r.kind,'demand');assert.equal(r.data.status,'PENDING');assert.equal(r.data.ownerId,'a')
 assert.equal(r.data.prdUrl,undefined);assert.match(r.data.description,/补充材料/)
})
test('无匹配工程师保留项目；同名歧义阻止错误分派',()=>{
 const row={row:4,fields:f}
 assert.equal(mapCsv(row,[],[],now).mapped.project.primaryOwnerId,'legacy-migration-placeholder')
 assert.throws(()=>mapCsv(row,[...users,{...users[1],id:'c'}],[],now),/AMBIGUOUS/)
})
test('日期严格解析，拒绝不支持状态',()=>{
 assert.equal(csvDate('2026/9/1'),'2026-09-01');assert.throws(()=>csvDate('2026/2/30'))
 assert.throws(()=>mapCsv({row:2,fields:{...f,'状态':'已终止'}},[],[],now),/UNEXPECTED/)
})
test('缺CSV日期也不能带入旧交付或旧阶段计划日期',()=>{
 const r=mapCsv({row:5,fields:{...f,'计划完成':''}},users,[{title:'项目甲',requirement:{status:'TEST',plannedDone:'2028-08-31',stagePlans:[{status:'TEST',plannedEndDate:'2028-08-01',baselineVersion:1}]}}],now)
 assert.equal(r.mapped.project.currentDeliveryDate.toISOString().slice(0,10),'2026-10-09')
 assert.equal(r.mapped.project.stageExpectedDate,null)
})
