import { describe, expect, it, vi } from 'vitest'
vi.mock('@/config/runtime', () => ({ runtimeConfig: { isPrototype: true } }))
import { createInitialPrototypeSnapshot } from '@/mocks/seed'
import { isPrototypeSnapshot } from '@/repositories/prototype-validation'
import { acceptanceLabel } from './acceptance-service'
import { registerHistoricalDelivery } from './historical-delivery-service'
function setup() {
  const snapshot = createInitialPrototypeSnapshot()
  const project = snapshot.database.projects.find(p => p.status === 'active' && !p.archived)!
  snapshot.activeUserId = project.primaryOwnerId
  project.name = '【迁移待核实】历史项目'
  project.migrationVerified = false
  project.firstRequestedOn = '2026-01-01'
  const input = { projectId: project.id, version: project.version ?? 0, requestId: 'historical-1', deliveredOn: '2026-08-01', reason: '核对交付记录' }
  return { snapshot, project, input }
}
const now = '2026-09-15T02:00:00.000Z'
describe('历史交付补录', () => {
  it('历史保留，独立记载实际日期和操作时间，刷新可读且同请求幂等', () => {
    const { snapshot, project, input } = setup()
    const histories = structuredClone(snapshot.database.stageHistories)
    const acceptance = structuredClone(project.acceptanceHistory ?? [])
    const result = registerHistoricalDelivery(snapshot, input, now)
    expect(project).toMatchObject({ status: 'completed', stage: '验收交付', simpleStatus: 'completed', overallProgress: 100, migrationVerified: true, actualCompletedAt: '2026-08-01T00:00:00.000Z', updatedAt: now, name: '历史项目', risks: [], blocker: '', acceptanceStatus: 'none' })
    expect(acceptanceLabel(project)).toBe('历史完成 / 无业务验收记录')
    expect(project.acceptanceHistory?.slice(0, acceptance.length)).toEqual(acceptance)
    expect(project.acceptanceHistory?.at(-1)?.action).toBe('invalidate')
    expect(snapshot.database.stageHistories).toHaveLength(histories.length + 1)
    for (const [i, h] of histories.entries()) expect(snapshot.database.stageHistories[i]).toMatchObject(h)
    expect(snapshot.database.stageHistories.at(-1)).toMatchObject({ stage: '验收交付', startedAt: '', completedAt: project.actualCompletedAt })
    expect(snapshot.database.lifecycleEvents[0]).toMatchObject({ action: 'historical-complete', createdAt: now, after: { actualCompletedAt: project.actualCompletedAt } })
    expect(isPrototypeSnapshot(snapshot)).toBe(true)
    const saved = JSON.stringify(snapshot)
    expect(registerHistoricalDelivery(snapshot, input, now)).toEqual(result)
    expect(JSON.stringify(snapshot)).toBe(saved)
    expect(() => registerHistoricalDelivery(snapshot, { ...input, reason: '另一个原因' }, now)).toThrow('请求编号已使用')
  })
  it.each(['2026-02-30', '2026-09-16', '2025-12-31', ''])('拒绝无效、未来、早于首次提出及空日期：%s', deliveredOn => {
    const { snapshot, input } = setup()
    const saved = JSON.stringify(snapshot)
    expect(() => registerHistoricalDelivery(snapshot, { ...input, deliveredOn }, now)).toThrow()
    expect(JSON.stringify(snapshot)).toBe(saved)
  })
  it('拒绝无权用户、归档、完成项目、旧版本和空原因', () => {
    for (const change of ['actor', 'archived', 'completed', 'version', 'reason']) {
      const { snapshot, project, input } = setup()
      if (change === 'actor') snapshot.activeUserId = 'user-business-li'
      if (change === 'archived') project.archived = true
      if (change === 'completed') project.status = 'completed'
      if (change === 'version') input.version++
      if (change === 'reason') input.reason = ' '
      const saved = JSON.stringify(snapshot)
      expect(() => registerHistoricalDelivery(snapshot, input, now)).toThrow()
      expect(JSON.stringify(snapshot)).toBe(saved)
    }
  })
  it('指定管理员可登记正常项目，工程师正常项目不允许；日期回退关联需求', () => {
    const { snapshot, project, input } = setup()
    project.migrationVerified = true
    expect(() => registerHistoricalDelivery(snapshot, input, now)).toThrow('无完整编辑权限')
    snapshot.activeUserId = 'user-manager-chen'
    project.firstRequestedOn = ''
    snapshot.database.demands.find(d => d.id === project.demandId)!.firstRequestedOn = '2026-08-02'
    expect(() => registerHistoricalDelivery(snapshot, input, now)).toThrow('早于')
    expect(registerHistoricalDelivery(snapshot, { ...input, deliveredOn: '2026-08-02' }, now).id).toBe(project.id)
  })
})
