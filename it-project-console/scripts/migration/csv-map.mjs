import {mapLegacy,placeholderId} from './legacy-map.mjs'
export const csvHash='9cb4fe39c26e68b541fe8898ab1ae25f91196f7d84967ef67fdb9ee75cb4798d'
export function csvDate(value){
  if(!value)return null
  const m=/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(value)
  if(!m)throw Error('INVALID_CSV_DATE')
  const text=`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`
  if(new Date(text).toISOString().slice(0,10)!==text)throw Error('INVALID_CSV_DATE')
  return text
}
const named=(name,users)=>{
  const matches=users.filter(u=>u.name===name&&u.active&&u.dingUnionId)
  if(matches.length>1)throw Error('AMBIGUOUS_CSV_PERSON')
  return matches[0]??null
}
export function mapCsv(row,users,oldSources,now){
 const f=row.fields,id=`csv-${csvHash.slice(0,12)}-${row.row}`
 const start=csvDate(f['开始时间'])??new Date(now).toISOString().slice(0,10),due=csvDate(f['计划完成'])
 const actor=named(f['业务负责人'],users),engineer=named(f['AI工程师'],users)
 const rawSummary=Object.entries(f).filter(([,v])=>v).map(([k,v])=>`${k}：${v}`).join('；')
 if(f['状态']==='IT 审批中')return {kind:'demand',id,data:{id,requestId:id,name:f['项目名称'],status:'PENDING',
   ownerId:actor?.id??placeholderId,department:f['部门'],description:`CSV迁入，保留IT审批中状态；原表未提供PRD和原型，立项前需补充材料。${rawSummary}`,
   expectedLaunchDate:due?new Date(due):null,submittedAt:new Date(start),createdAt:new Date(start)},raw:row,
   mapping:{status:'IT审批中→PENDING',owner:actor?'按CSV姓名唯一匹配钉钉成员':'迁移占位',expectedLaunchDate:'CSV计划完成映射占位，原表未提供计划上线'}}
 if(f['状态']!=='交付中')throw Error('UNEXPECTED_CSV_STATUS')
 const legacy=oldSources.filter(p=>p.title===f['项目名称'])
 if(legacy.length>1)throw Error('AMBIGUOUS_OLD_PROJECT')
 const source=legacy[0]
 const identity=engineer?{name:engineer.name,dingTalkUnionId:engineer.dingUnionId}:null
 const p={id,code:`CSV第${row.row}条记录`,title:f['项目名称'],status:'ACTIVE',priorityCode:f['紧急程度'],createdAt:start,updatedAt:now,
   plannedDoneAt:due,department:{name:f['部门']},primaryEngineer:identity??{name:f['AI工程师']||'缺失'},deliveryOwner:null,
   owner:{name:f['业务负责人'],department:{name:f['部门']}},requirement:source?.requirement?{status:source.requirement.status}:null,members:[],progressLogs:[],progressUpdates:[]}
 const mapped=mapLegacy(p,users,now)
 mapped.project.id=id;mapped.project.requestId=id
 // CSV dates are authoritative; an old field is only supplemental when the CSV lacks it.
 mapped.fieldSources.csvStartDate={original:f['开始时间'],imported:start,synthetic:!f['开始时间']}
 mapped.fieldSources.csvDeliveryDate={original:f['计划完成'],imported:due}
 mapped.fieldSources.stage.source=source?'上次迁移审计中同名唯一旧项目阶段':'占位'
 for(let i=0;i<rawSummary.length;i+=250)mapped.updates.push({id:`csv-source-${row.row}-${i}`,authorId:placeholderId,kind:'personal',
   stage:mapped.project.stage,status:mapped.project.simpleStatus,summary:`CSV原始资料：${rawSummary.slice(i,i+250)}`,createdAt:new Date(now)})
 return {kind:'project',id,mapped,raw:row}
}
