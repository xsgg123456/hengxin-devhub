import { expect, it } from 'vitest'
import { directoryRole, isEngineerEligible } from './it-department.js'

it('工程师资格独立于部门与管理权，停用优先且不存在姓名特判', () => {
  const business = { department: '事业三部', active: true, engineerOverride: false }
  expect(isEngineerEligible(business)).toBe(false)
  expect(isEngineerEligible({ ...business, engineerOverride: true })).toBe(true)
  expect(directoryRole({ ...business, engineerOverride: true }, false)).toBe('ENGINEER')
  expect(directoryRole({ ...business, engineerOverride: true }, true)).toBe('MANAGER')
  expect(directoryRole(business, false)).toBe('BUSINESS')
  expect(directoryRole({ ...business, active: false, engineerOverride: true }, true)).toBe('BUSINESS')
  for (const department of ['信息技术部', 'IT部']) expect(isEngineerEligible({ ...business, department })).toBe(true)
})
