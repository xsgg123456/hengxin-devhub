import type { DemoDemand, DemoProject } from '@/domain/prototype'
import { runtimeConfig } from '@/config/runtime'
export function projectBusinessOwner(project: DemoProject, demands: DemoDemand[]) {
  return runtimeConfig.isPrototype && project.businessOwnerId === undefined
    ? demands.find(d => d.id === project.demandId)?.submitterId
    : project.businessOwnerId
}
