import { describe, expect, it } from 'vitest'
import { canAccessRole, getHomePath, getNavigation } from './access'

describe('角色访问策略', () => {
  it.each([
    ['manager', '/project-overview'],
    ['engineer', '/my-projects'],
    ['business', '/my-demands']
  ] as const)('%s 进入对应首页', (role, path) => {
    expect(getHomePath(role)).toBe(path)
    expect(getNavigation(role)).toEqual([expect.objectContaining({ path })])
  })

  it('拒绝访问其他角色页面', () => {
    expect(canAccessRole('business', ['manager'])).toBe(false)
    expect(canAccessRole('engineer', ['engineer'])).toBe(true)
    expect(canAccessRole('manager')).toBe(true)
  })
})
