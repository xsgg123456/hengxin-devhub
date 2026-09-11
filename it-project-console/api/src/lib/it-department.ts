// Exact company department names verified during enterprise acceptance.
export const IT_DEPARTMENT_NAMES = ['信息技术部', 'IT部']

export function isItDepartment(name: string | null | undefined) {
  return name != null && IT_DEPARTMENT_NAMES.includes(name)
}

export function isEngineerEligible(user: { department: string; active: boolean; engineerOverride?: boolean }) {
  return user.active && (isItDepartment(user.department) || user.engineerOverride === true)
}

export function directoryRole(user: { department: string; active: boolean; engineerOverride?: boolean }, manager: boolean) {
  return user.active && manager ? 'MANAGER' : isEngineerEligible(user) ? 'ENGINEER' : 'BUSINESS'
}
