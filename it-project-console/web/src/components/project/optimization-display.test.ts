import { describe, expect, it } from 'vitest'
import { fresh } from '@/services/workflow-fixtures'
import { optimizationStatus, projectStageLabel } from '@/utils/optimization-display'
import type { DemoProject } from '@/domain/prototype'

const today = '2026-09-15'
function project(overrides: Partial<DemoProject> = {}): DemoProject {
  return {
    ...fresh().database.projects[0], parentProjectId: 'original', status: 'active',
    stage: '验收交付', simpleStatus: 'in-progress', acceptanceStatus: 'none',
    stagePlans: [{ stage: '验收交付', startDate: today, endDate: '2026-09-18' }],
    ...overrides
  }
}

describe('各组件共用的优化状态', () => {
  it.each<[Partial<DemoProject>, string]>([
    [{ stagePlans: [] }, '待排期'],
    [{ stagePlans: [{ stage: '验收交付', startDate: '2026-09-16', endDate: '2026-09-18' }] }, '待开始'],
    [{ simpleStatus: 'not-started' }, '待开始'],
    [{}, '优化中'],
    [{ simpleStatus: 'blocked' }, '优化中'],
    [{ acceptanceStatus: 'pending' }, '待验收'],
    [{ acceptanceStatus: 'returned' }, '退回整改'],
    [{ status: 'completed', acceptanceStatus: 'accepted' }, '优化已完成'],
    [{ status: 'cancelled' }, '已取消']
  ])('依照业务状态 %j 显示 %s', (overrides, expected) => {
    expect(optimizationStatus(project(overrides), today)).toBe(expected)
  })

  it('当前阶段写完成不能替代业务验收；退回和待验收优先于计划日期', () => {
    expect(optimizationStatus(project({ simpleStatus: 'completed' }), today)).toBe('优化中')
    expect(optimizationStatus(project({ acceptanceStatus: 'returned', simpleStatus: 'not-started' }), today)).toBe('退回整改')
    expect(optimizationStatus(project({ acceptanceStatus: 'pending', stagePlans: [] }), today)).toBe('待验收')
  })

  it('仅按原项目关联区分类型，不根据名称推断或改写正式阶段', () => {
    expect(projectStageLabel(project(), '验收交付')).toBe('优化完成验收')
    expect(projectStageLabel({ parentProjectId: null }, '方案设计')).toBe('方案设计')
  })
})
