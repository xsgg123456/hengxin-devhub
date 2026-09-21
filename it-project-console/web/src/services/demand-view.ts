import type { DemoDemand, DemoProject, PrototypeDatabase } from '@/domain/prototype'
import { demandCompletion, type DemandRow } from './demand-completion'

/**
 * Resolve the fields that describe the current business ownership of a demand.
 *
 * A demand keeps its original submission facts for audit/history, while a
 * demand that has become a project must read its current department and
 * business owner from that project.  Keeping this calculation in one place
 * prevents list pages, deep links, metrics and task filters from drifting.
 */
export function linkedProject(db: PrototypeDatabase, demandId: string): DemoProject | undefined {
  return db.projects.find((project) => project.demandId === demandId)
}

export function effectiveDemand(db: PrototypeDatabase, demand: DemoDemand): DemandRow {
  const project = linkedProject(db, demand.id)
  const businessOwnerId = project
    ? project.businessOwnerId !== undefined
      ? project.businessOwnerId
      : demand.submitterId
    : demand.businessOwnerId
  return {
    ...demand,
    department: project?.department ?? demand.department,
    businessOwnerId,
    currentOwnerId: project ? businessOwnerId : demand.currentOwnerId ?? demand.submitterId,
    projectId: project?.id ?? demand.projectId ?? null,
    ...demandCompletion(project)
  }
}

/** 当前业务归属。已关联项目必须服从项目当前负责人，空值表示暂未设置。 */
export function currentDemandOwner(demand: Pick<DemoDemand, 'projectId' | 'currentOwnerId' | 'submitterId'>) {
  return demand.projectId ? demand.currentOwnerId ?? null : demand.currentOwnerId ?? demand.submitterId
}

export function effectiveDemands(db: PrototypeDatabase): DemandRow[] {
  return db.demands.map((demand) => effectiveDemand(db, demand))
}
