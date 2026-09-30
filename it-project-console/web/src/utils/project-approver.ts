import type { DemoUser } from '@/domain/prototype'
import { hasManagementPermissions } from './management-permission'

export function canApproveProjects(user: DemoUser) {
  return hasManagementPermissions(user) && user.canApproveProjects === true
}
