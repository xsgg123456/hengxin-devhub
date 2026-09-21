import type { DemoProject, DemoUser } from '@/domain/prototype'
import { runtimeConfig } from '@/config/runtime'
import { canApproveProjects } from './project-approver'
import { isEngineerEligible } from './engineer-eligibility'

export const isMigrationPending = (project: DemoProject) =>
  project.migrationVerified === false ||
  (runtimeConfig.isPrototype && project.migrationVerified !== true && project.name.startsWith('【迁移待核实】'))

export const canEditProject = (user: DemoUser, project: DemoProject) =>
  canApproveProjects(user) ||
  (user.role === 'engineer' && isEngineerEligible(user) && project.primaryOwnerId === user.id && isMigrationPending(project))
