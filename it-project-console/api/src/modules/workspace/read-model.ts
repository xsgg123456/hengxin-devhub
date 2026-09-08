import type {
  User,
  Demand,
  Attachment,
  Project,
  ProjectMember
} from '../../generated/prisma/client.js'
const date = (value: Date | null) => value?.toISOString().slice(0, 10) ?? ''
export const mapUser = (user: User) => ({
  id: user.id,
  name: user.name,
  department: user.department,
  role: user.role.toLowerCase(),
  roleLabel: { MANAGER: '管理人员', BUSINESS: '业务人员', ENGINEER: 'IT工程师' }[user.role]
})
export const mapDemand = (demand: Demand & { attachments: Attachment[] }) => {
  const material = (url: string | null, attachmentId: string | null) => {
    if (url) return { kind: 'link', url, name: url, status: 'ready' }
    const file = demand.attachments.find(
      (item) => item.id === attachmentId && item.status === 'READY'
    )
    return file
      ? {
          kind: 'file',
          attachmentId: file.id,
          name: file.name,
          size: file.size,
          mime: file.mime,
          status: 'ready'
        }
      : null
  }
  return {
    id: demand.id,
    requestId: demand.requestId ?? demand.id,
    version: demand.version,
    name: demand.name,
    description: demand.description,
    department: demand.department,
    submitterId: demand.ownerId,
    expectedLaunchDate: date(demand.expectedLaunchDate),
    prd: material(demand.prdUrl, demand.prdAttachmentId),
    prototype: material(demand.prototypeUrl, demand.prototypeAttachmentId),
    status: demand.status === 'APPROVED' ? 'established' : demand.status.toLowerCase(),
    reviewReason: demand.reviewReason ?? '',
    reviewedBy: demand.reviewedBy ?? undefined,
    reviewedAt: demand.reviewedAt?.toISOString(),
    submittedAt: demand.submittedAt?.toISOString() ?? ''
  }
}
export const mapProject = (project: Project & { members: ProjectMember[] }) => ({
  id: project.id,
  requestId: project.requestId ?? project.id,
  version: project.version,
  demandId: project.demandId,
  source: project.source,
  name: project.name,
  department: project.department,
  priority: project.priority,
  primaryOwnerId: project.primaryOwnerId,
  collaboratorIds: project.members.map((item) => item.userId),
  stage: project.stage,
  simpleStatus: project.simpleStatus,
  overallProgress: project.overallProgress,
  stageExpectedDate: date(project.stageExpectedDate),
  originalLaunchDate: date(project.originalLaunchDate),
  expectedLaunchDate: date(project.currentLaunchDate),
  originalDeliveryDate: date(project.originalDeliveryDate),
  expectedDeliveryDate: date(project.currentDeliveryDate),
  status: project.status.toLowerCase(),
  archived: project.archived,
  risks: Array.isArray(project.risks)
    ? project.risks.filter((risk): risk is string => typeof risk === 'string')
    : [],
  riskVersion: project.riskVersion,
  blocker: project.blocker,
  createdAt: project.createdAt.toISOString(),
  updatedAt: project.updatedAt.toISOString(),
  lastOverallUpdatedAt: project.lastOverallUpdatedAt.toISOString()
})
export type ReadProject = ReturnType<typeof mapProject>
export type ReadUser = ReturnType<typeof mapUser>
export type ReadDemand = ReturnType<typeof mapDemand>
