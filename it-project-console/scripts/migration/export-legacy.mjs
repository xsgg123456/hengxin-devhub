// Read-only. Run inside the old application; redirect stdout to a mode-0600 server file.
const { PrismaClient } = await import('@prisma/client')
const db = new PrismaClient()
const person = { select: { id:true, name:true, dingTalkId:true, dingTalkUnionId:true, department:{select:{name:true}} } }
try {
  const projects = await db.project.findMany({where:{deletedAt:null,status:{in:['ACTIVE','COMPLETED']}},orderBy:{id:'asc'},select:{
    id:true,code:true,title:true,status:true,priorityCode:true,createdAt:true,updatedAt:true,lastActivityAt:true,
    plannedDoneAt:true,forecastEndDate:true,completedAt:true,launchedAt:true,goLiveConfirmedAt:true,demoUrl:true,
    department:{select:{name:true}},primaryEngineer:person,deliveryOwner:person,owner:person,
    requirement:{select:{status:true,plannedDone:true,acceptedAt:true,stagePlans:{where:{supersededAt:null},select:{status:true,plannedEndDate:true,baselineVersion:true}}}},
    members:{where:{deletedAt:null},select:{user:person}},
    progressLogs:{select:{id:true,body:true,stage:true,createdAt:true,author:person}},
    progressUpdates:{select:{id:true,currentWork:true,nextStep:true,engineerPercent:true,createdAt:true,author:person}}
  }})
  const ids=projects.map(p=>p.id), docs=await db.requirementDocument.findMany({where:{projectId:{in:ids}},select:{id:true}})
  const reqIds=(await db.requirement.findMany({where:{projectId:{in:ids}},select:{id:true}})).map(r=>r.id)
  const skipped={}
  for(const model of ['review','projectApprovalDecision','statusTransition','baseline','usageLog','customMilestone','milestone','aiApplicationInterview','handoverRecord'])
    skipped[model]=await db[model].count({where:{projectId:{in:ids}}})
  skipped.documents=docs.length
  skipped.documentVersions=await db.requirementVersion.count({where:{documentId:{in:docs.map(d=>d.id)}}})
  skipped.attachments=await db.attachment.count({where:{entityType:'Project',entityId:{in:ids},deletedAt:null}})
  skipped.stageLogs=await db.requirementStageLog.count({where:{reqId:{in:reqIds}}})
  skipped.stagePlanHistory=await db.requirementStagePlan.count({where:{requirementId:{in:reqIds}}})
  skipped.ownerRelations=await db.projectOwner.count({where:{projectId:{in:ids}}})
  skipped.deletedMembers=await db.projectMember.count({where:{projectId:{in:ids},deletedAt:{not:null}}})
  console.log(JSON.stringify({format:1,exportedAt:new Date().toISOString(),projects,skipped}))
} finally { await db.$disconnect() }
