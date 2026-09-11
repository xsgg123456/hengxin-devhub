import { describe, expect, it } from 'vitest'
import { fresh } from './workflow-fixtures'
import { buildGanttRows, monthDays, shiftMonth } from './gantt-service'
const now = '2026-09-08T09:00:00+08:00'
function project() {
  return {
    ...fresh().database.projects[0],
    createdAt: '2026-08-20T16:30:00Z',
    expectedDeliveryDate: '2026-09-09',
    originalDeliveryDate: '2026-09-05',
    overallProgress: 50,
    archived: false,
    status: 'active' as const
  }
}
describe('月度甘特', () => {
  it('上海立项日期与跨月累计进度裁剪，完成进度不重复铺满下月', () => {
    const [row] = buildGanttRows([project()], '2026-09', {}, [], now)
    expect(row.start).toBe('2026-08-21')
    expect(row.left).toBe(0)
    expect(row.width).toBe(9)
    expect(row.progressWidth).toBe(0)
    expect(row.originalMarker).toBe(4.5)
    expect(row.clipped).toBe(true)
  })
  it('历史百分比不影响时间条，保留不相交月份过滤', () => {
    expect(
      buildGanttRows([{ ...project(), overallProgress: 100 }], '2026-09')[0].progressWidth
    ).toBe(0)
    expect(buildGanttRows([{ ...project(), overallProgress: 0 }], '2026-09')[0].progressWidth).toBe(
      0
    )
    expect(buildGanttRows([project()], '2026-10')).toEqual([])
  })
  it('跨月计划裁剪，历史百分比不生成进度条；月末单日仍展示', () => {
    const [row] = buildGanttRows([{ ...project(), overallProgress: 75 }], '2026-09')
    expect(row.progressWidth).toBe(0)
    const [single] = buildGanttRows(
      [
        { ...project(), createdAt: '2026-09-30T00:00:00+08:00', expectedDeliveryDate: '2026-09-30' }
      ],
      '2026-09'
    )
    expect(single.left).toBe(29)
    expect(single.width).toBe(1)
  })
  it('阻塞和停更筛选消费同源风险，协作人不计主负责人', () => {
    const blocked = {
      ...project(),
      simpleStatus: 'blocked' as const,
      collaboratorIds: ['collaborator'],
      lastOverallUpdatedAt: '2026-09-01T09:00:00+08:00'
    }
    expect(buildGanttRows([blocked], '2026-09', { risk: 'blocked' }, [], now)).toHaveLength(1)
    expect(buildGanttRows([blocked], '2026-09', { risk: 'stale' }, [], now)).toHaveLength(1)
    expect(buildGanttRows([blocked], '2026-09', { ownerId: 'collaborator' }, [], now)).toEqual([])
  })
  it('项目延期使用交付日期并保留天数文案', () => {
    const rows = buildGanttRows(
      [{ ...project(), expectedDeliveryDate: '2026-09-06', expectedLaunchDate: '2026-09-20' }],
      '2026-09',
      { risk: 'delayed' },
      [],
      now
    )
    expect(rows[0].risks).toContain('项目延期 2 天')
  })
  it('默认排除归档取消，历史开关恢复；部门与主负责人过滤', () => {
    const archived = { ...project(), archived: true }
    const cancelled = { ...project(), status: 'cancelled' as const }
    expect(buildGanttRows([archived, cancelled], '2026-09')).toEqual([])
    expect(
      buildGanttRows([archived, cancelled], '2026-09', { includeArchived: true })
    ).toHaveLength(2)
    expect(buildGanttRows([project()], '2026-09', { ownerId: 'other' })).toEqual([])
    expect(buildGanttRows([project()], '2026-09', { department: 'other' })).toEqual([])
  })
  it('闰月、跨年和原交付超出显示范围', () => {
    expect(monthDays('2024-02')).toBe(29)
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    const [row] = buildGanttRows([{ ...project(), originalDeliveryDate: '2026-08-30' }], '2026-09')
    expect(row.originalMarker).toBeNull()
    expect(row.outside).toBe(true)
  })
})
