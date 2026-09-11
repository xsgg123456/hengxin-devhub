import { describe, expect, it } from 'vitest'
import { fresh } from './workflow-fixtures'
import { stageExecutions } from './stage-execution'
import { ganttStageSegments } from './gantt-stage-segments'
import type { DemoStageHistory } from '@/domain/prototype'
const project = () => ({
  ...fresh().database.projects[0],
  stage: '联调测试' as const,
  stagePlans: [{ stage: '联调测试' as const, startDate: '2026-09-10', endDate: '2026-09-13' }]
})
const history = (completedAt: string): DemoStageHistory => ({
  projectId: project().id,
  stage: '联调测试',
  startedAt: '2026-09-10T00:00:00+08:00',
  completedAt,
  plannedStartDate: '2026-09-10',
  plannedEndDate: '2026-09-13'
})
describe('真实阶段计划与完成状态', () => {
  it('当前环节已排期但尚未开始保持灰色，逾期仍标红', () => {
    const p = { ...project(), simpleStatus: 'not-started' as const }
    expect(stageExecutions(p, [], '2026-09-12')[4].state).toBe('future')
    expect(stageExecutions(p, [], '2026-09-14')[4].state).toBe('late')
  })
  it('计划结束当天不延期，次日才红，未来未完成节点同样不能漏掉逾期', () => {
    expect(stageExecutions(project(), [], '2026-09-13')[4].state).toBe('current')
    expect(stageExecutions(project(), [], '2026-09-14')[4]).toMatchObject({
      state: 'late',
      lateDays: 1
    })
    expect(stageExecutions({ ...project(), stage: '开发编码' }, [], '2026-09-14')[4].state).toBe(
      'late'
    )
  })
  it('完成按上海日期比较，完成后的计划快照不随当前计划变化', () => {
    const p = { ...project(), stage: '上线部署' as const }
    expect(stageExecutions(p, [history('2026-09-13T15:59:00Z')])[4].state).toBe('done')
    expect(stageExecutions(p, [history('2026-09-13T16:00:00Z')])[4]).toMatchObject({
      state: 'late-done',
      lateDays: 1
    })
    p.stagePlans[0].endDate = '2026-09-30'
    expect(stageExecutions(p, [history('2026-09-15T00:00:00+08:00')])[4]).toMatchObject({
      state: 'late-done',
      lateDays: 2,
      plan: { endDate: '2026-09-13' }
    })
  })
  it('旧阶段顺序不冒充真实完成，旧真实完成缺快照不推断按时', () => {
    const p = { ...project(), stage: '上线部署' as const }
    expect(stageExecutions(p, [])[4]).toMatchObject({ state: 'unknown', completed: false })
    expect(
      stageExecutions(p, [{ ...history('2026-09-13T12:00:00Z'), plannedEndDate: null }])[4].state
    ).toBe('unknown')
  })
  it('重开和纠正后最新未完成记录遮蔽旧的完成结果', () => {
    const histories = [
      history('2026-09-15T00:00:00+08:00'),
      { ...history(''), completedAt: null, startedAt: '2026-09-16T00:00:00+08:00' }
    ]
    expect(stageExecutions(project(), histories, '2026-09-16')[4]).toMatchObject({
      state: 'late',
      completedAt: null
    })
    expect(stageExecutions({ ...project(), stage: '上线部署' }, histories)[4].state).toBe('unknown')
  })
  it('跨月裁剪且无计划不均分，同日交接分层避免遮盖', () => {
    const p = {
      ...project(),
      stage: '方案设计' as const,
      stagePlans: [
        { stage: '方案设计' as const, startDate: '2026-08-29', endDate: '2026-09-02' },
        { stage: '开发编码' as const, startDate: '2026-09-02', endDate: '2026-09-30' },
        { stage: '联调测试' as const, startDate: '2026-09-30', endDate: '2026-10-03' }
      ]
    }
    expect(
      ganttStageSegments(p, [], '2026-09', '2026-09-01').map((s) => [s.left, s.width, s.lane])
    ).toEqual([
      [0, 2, 0],
      [1, 29, 1],
      [29, 1, 0]
    ])
    expect(ganttStageSegments({ ...p, stagePlans: [] }, [], '2026-09')).toEqual([])
  })
  it('无排期、取消项目不渲染当前推进或继续累计延期', () => {
    expect(stageExecutions({ ...project(), stagePlans: [] }, [])[4].state).toBe('unplanned')
    expect(
      stageExecutions({ ...project(), status: 'cancelled' }, [], '2026-09-20')[4]
    ).toMatchObject({ state: 'future', lateDays: 0 })
  })
})
