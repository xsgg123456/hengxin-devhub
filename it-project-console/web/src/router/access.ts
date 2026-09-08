import type { SystemRole } from '@/domain/prototype'

export interface NavigationItem {
  label: string
  path: string
  icon: string
}

const HOME_PATHS: Record<SystemRole, string> = {
  business: '/my-demands',
  engineer: '/my-projects',
  manager: '/project-overview'
}

const NAVIGATION: Record<SystemRole, NavigationItem[]> = {
  business: [
    { label: '我的需求 / 需求池', path: '/my-demands', icon: 'ri:file-list-3-line' },
    { label: '项目进展', path: '/project-overview', icon: 'ri:dashboard-3-line' }
  ],
  engineer: [
    { label: '我的项目 / 全部项目', path: '/my-projects', icon: 'ri:folder-user-line' },
    { label: '需求池', path: '/my-demands', icon: 'ri:file-list-3-line' }
  ],
  manager: [
    { label: '项目总览', path: '/project-overview', icon: 'ri:dashboard-3-line' },
    { label: '需求池', path: '/my-demands', icon: 'ri:file-list-3-line' }
  ]
}

export function getHomePath(role: SystemRole): string {
  return HOME_PATHS[role]
}

export function getNavigation(role: SystemRole): NavigationItem[] {
  return NAVIGATION[role]
}

export function canAccessRole(role: SystemRole, allowedRoles?: SystemRole[]): boolean {
  return !allowedRoles || allowedRoles.includes(role)
}
