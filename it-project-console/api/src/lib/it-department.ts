// Exact company department names verified during enterprise acceptance.
export const IT_DEPARTMENT_NAMES = ['信息技术部', 'IT部']

export function isItDepartment(name: string | null | undefined) {
  return name != null && IT_DEPARTMENT_NAMES.includes(name)
}
