export const stages=['需求受理','立项评审','方案设计','开发编码','联调测试','上线部署','验收交付']
export const placeholderId='legacy-migration-placeholder'
export function matchPerson(person,users){
  if(!person?.dingTalkUnionId)return null
  const matches=users.filter(u=>u.dingUnionId===person.dingTalkUnionId)
  return matches.length===1?matches[0]:null
}
const it=u=>u?.active&&['IT部','信息技术部'].includes(u.department)
const day=value=>value?new Date(new Date(value).getTime()+8*3600000).toISOString().slice(0,10):null
const shift=(value,n)=>new Date(Date.parse(value)+n*86400000).toISOString().slice(0,10)
export function mapLegacy(p,users,now){
  if(!['ACTIVE','COMPLETED'].includes(p.status))throw Error('OUT_OF_SCOPE')
  const notes=[],completed=p.status==='COMPLETED',oldStage=p.requirement?.status
  const stage=completed?'验收交付':({DEV:'开发编码',TEST:'联调测试',UAT:'联调测试',TRIAL:'上线部署',PENDING:'方案设计',SCHEDULED:'方案设计'}[oldStage]??'方案设计')
  const primary=matchPerson(p.primaryEngineer,users),deliveryOwner=matchPerson(p.deliveryOwner,users)
  const owner=it(primary)?primary:it(deliveryOwner)?deliveryOwner:null
  if(!owner)notes.push(`负责人占位（旧负责人：${p.primaryEngineer?.name??p.deliveryOwner?.name??'缺失'}）`)
  const delivery=day(p.plannedDoneAt??p.requirement?.plannedDone??p.forecastEndDate??p.completedAt)??shift(day(now),30)
  if(!p.plannedDoneAt)notes.push('交付日期使用其他旧字段或迁移日后30天补值')
  const oldDates=[p.plannedDoneAt,p.requirement?.plannedDone,p.forecastEndDate].map(day).filter(Boolean)
  if(new Set(oldDates).size>1)notes.push('旧交付日期冲突，采用项目计划完成日期')
  // Actual launch dates are not promises. Preserve them in the audit, do not relabel as a planned date.
  const launch=shift(delivery,-7)
  notes.push('计划上线日期=交付前7天占位；原始承诺日期复制当前计划占位')
  const progress=completed?100:({DEV:40,TEST:70,UAT:70,TRIAL:90}[oldStage]??0)
  notes.push(completed?'100%按旧已完成状态补值':'整体进度按旧阶段估算，非真实填报百分比')
  if(!oldStage&&!completed)notes.push('缺阶段，方案设计占位')
  const status=completed?'completed':progress===0?'not-started':'in-progress'
  const expected=day(p.requirement?.stagePlans?.filter(s=>s.status===oldStage).sort((a,b)=>b.baselineVersion-a.baselineVersion)[0]?.plannedEndDate)
  const memberIds=[...new Set(p.members.map(m=>matchPerson(m.user,users)).filter(it).map(u=>u.id))].filter(id=>id!==owner?.id)
  const project={id:`legacy-${p.id}`,requestId:`legacy:${p.id}`,source:'direct',name:`【迁移待核实】${p.title}`,
    department:p.department?.name??p.owner?.department?.name??'迁移占位：部门待核实',priority:['P0','P1','P2'].includes(p.priorityCode)?p.priorityCode:'P2',
    status:p.status,archived:false,primaryOwnerId:owner?.id??placeholderId,stage,simpleStatus:status,overallProgress:progress,
    originalLaunchDate:new Date(launch),currentLaunchDate:new Date(launch),originalDeliveryDate:new Date(delivery),currentDeliveryDate:new Date(delivery),
    stageExpectedDate:expected?new Date(expected):null,lastOverallUpdatedAt:new Date(now),createdAt:new Date(p.createdAt),updatedAt:new Date(p.updatedAt)}
  const summary=`迁移说明：旧项目${p.code??p.id}；${notes.join('；')}。原始值保存在迁移审计，待核实。`
  const updates=[];let skippedProgress=0
  for(const row of [...p.progressLogs.map(r=>({...r,text:r.body})),...p.progressUpdates.map(r=>({...r,text:`${r.currentWork}；下一步：${r.nextStep}；旧个人进度${r.engineerPercent}%（非整体进度）`}))]){
    const author=matchPerson(row.author,users)
    if(!author?.active||row.text.length>260){skippedProgress++;continue}
    updates.push({id:`legacy-progress-${row.id}`,authorId:author.id,kind:'personal',stage,status,summary:`【旧记录；展示阶段/状态为迁移快照】${row.text}`,createdAt:new Date(row.createdAt)})
  }
  for(let i=0;i<summary.length;i+=270)updates.push({id:`legacy-note-${p.id}-${i}`,authorId:placeholderId,kind:'personal',stage,status,summary:summary.slice(i,i+270),createdAt:new Date(now)})
  const index=stages.indexOf(stage)
  const histories=stages.map((s,i)=>({stage:s,status:completed||i<index?'completed':i===index?'current':'future',progress:completed||i<index?100:0}))
  const fieldSources={
    name:{original:p.title,imported:project.name},status:{original:p.status,imported:project.status},
    department:{imported:project.department,source:p.department?.name?'department.name':p.owner?.department?.name?'owner.department.name':'迁移占位：部门待核实',synthetic:!p.department?.name&&!p.owner?.department?.name},
    priority:{original:p.priorityCode,imported:project.priority,synthetic:!['P0','P1','P2'].includes(p.priorityCode)},
    primaryOwnerId:{original:p.primaryEngineer?.name??p.deliveryOwner?.name??null,imported:project.primaryOwnerId,synthetic:!owner},
    stage:{original:oldStage??null,imported:stage,inferred:true},
    overallProgress:{imported:progress,synthetic:true,rule:completed?'旧已完成状态补100':'按交付阶段估算'},
    currentDeliveryDate:{imported:delivery,source:p.plannedDoneAt?'plannedDoneAt':p.requirement?.plannedDone?'requirement.plannedDone':p.forecastEndDate?'forecastEndDate':p.completedAt?'completedAt':'迁移日后30天',synthetic:!p.plannedDoneAt},
    currentLaunchDate:{imported:launch,synthetic:true,rule:'交付前7天'},
    originalLaunchDate:{imported:launch,synthetic:true},originalDeliveryDate:{imported:delivery,synthetic:true},
    stageExpectedDate:{imported:expected,source:'当前旧阶段最高基线版本计划结束日'},
    lastOverallUpdatedAt:{imported:new Date(now).toISOString(),synthetic:true,rule:'新系统迁移起算时间'},
    stageHistories:{synthetic:true,rule:'按阶段重建位置，不补造过去发生时间'}
  }
  return {project,memberIds,updates,histories,notes,fieldSources,skippedProgress,skippedMembers:p.members.length-memberIds.length}
}
