import { describe, expect, it } from 'vitest'
import { approvedLaunchOverrun } from './approved-launch'

describe('审批上线基准比较', () => {
  it('按日历天比较跨月闰年；提前或当天不提示超期', () => {
    expect(approvedLaunchOverrun('2028-02-28', '2028-03-01')).toBe(2)
    expect(approvedLaunchOverrun('2026-09-20', '2026-09-25')).toBe(5)
    expect(approvedLaunchOverrun('2026-09-20', '2026-09-20')).toBe(0)
    expect(approvedLaunchOverrun('2026-09-20', '2026-09-19')).toBe(0)
  })
  it('无历史基准、未排期或损坏日期不伪造超期', () => {
    for (const value of [undefined, null, '', '—', '2026-02-30', 'not-a-date']) {
      expect(approvedLaunchOverrun(value, '2026-09-25')).toBe(0)
      expect(approvedLaunchOverrun('2026-09-20', value)).toBe(0)
    }
  })
})
