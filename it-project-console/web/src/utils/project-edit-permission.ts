import type { DemoProject, DemoUser } from '@/domain/prototype'
import { runtimeConfig } from '@/config/runtime'
import { canApproveProjects } from './project-approver'

export const isMigrationPending = (project: DemoProject) =>
  project.migrationVerified === false ||
  (runtimeConfig.isPrototype && project.migrationVerified !== true && project.name.startsWith('【迁移待核实】'))

export const canEditProject = (user: DemoUser, project: DemoProject) =>
  canApproveProjects(user) ||
  (user.role === 'engineer' && project.primaryOwnerId === user.id && isMigrationPending(project))
