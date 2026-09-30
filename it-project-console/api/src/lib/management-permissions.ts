type ManagementUser = { active: boolean; role: string; maintenanceAdmin?: boolean }

export function hasManagementPermissions(user: ManagementUser | null | undefined): boolean {
  return !!user?.active && (user.role === 'MANAGER' || user.maintenanceAdmin === true)
}
