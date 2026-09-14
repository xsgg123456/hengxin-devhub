import type { DemoUser } from '@/domain/prototype'

export function canApproveProjects(user: DemoUser) {
  return user.role === 'manager' && user.canApproveProjects === true
}
