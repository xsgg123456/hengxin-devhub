import type { DemoUser } from '@/domain/prototype'

// 独立维护授权仅叠加操作权限，绝不改变角色及其首页/工作范围。
export function hasManagementPermissions(user: Pick<DemoUser, 'role' | 'maintenanceAdmin'>): boolean {
  return user.role === 'manager' || user.maintenanceAdmin === true
}
