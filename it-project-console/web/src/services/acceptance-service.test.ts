import { describe, expect, it, vi, afterEach } from 'vitest'
import {
  actionAcceptance,
  actionLiveAcceptance,
  initializeAcceptance,
  acceptanceLabel
} from './acceptance-service'
import { fresh, now, planFixture, projectInput } from './workflow-fixtures'
import { createProject } from './project-service'
import { updateProgress } from './progress-service'
import { correctProject } from './management-service'
import { actionProject } from './lifecycle-service'
import { computeProjectRisks } from './risk-service'
import { responsibilityTasks } from './task-service'
import { migratePrototypeSnapshot } from '@/repositories/prototype-migration'
import type { AcceptanceAction } from '@/domain/prototype'
function fixture() {
  const s = fresh()
  s.activeUserId = 'user-manager-chen'
  const p = createProject(s, projectInput)
  p.stage = '验收交付'
  planFixture(s, p)
  const run = (action: AcceptanceAction, summary = '交付说明', extra = {}) =>
    actionAcceptance(s, {
      projectId: p.id,
      version: p.version ?? 0,
      requestId: crypto.randomUUID(),
      action,
      summary,
      now,
      ...extra
    })
  run('assign', '指定业务负责人', { ownerId: 'user-business-li' })
  s.activeUserId = p.primaryOwnerId
  return { s, p, run }
}
describe('业务验收状态与权限', () => {
  it('主负责人失去工程师资格后，提交和撤回均拒绝', () => {
    const { s, run } = fixture()
    const owner = s.database.users.find((u) => u.id === s.activeUserId)!
    owner.engineerEligible = false
    expect(() => run('submit')).toThrow('主负责工程师')
    owner.engineerEligible = true
    run('submit')
    owner.engineerEligible = false
    expect(() => run('withdraw', '撤回交付')).toThrow('主负责工程师')
  })
  it('退回、重提保留每轮内容，通过才完成阶段和项目', () => {
    const { s, p, run } = fixture()
    run('submit', '第一轮', { url: 'https://example.com/delivery' })
    expect(p.status).toBe('active')
    expect(() => run('submit')).toThrow('已待业务验收')
    s.activeUserId = 'user-business-li'
    expect(() => run('return', '')).toThrow('原因')
    run('return', '缺少导出')
    s.activeUserId = p.primaryOwnerId
    expect(
      responsibilityTasks(
        s.database,
        s.database.users.find((u) => u.id === s.activeUserId)!,
        now
      )
    ).toContainEqual(
      expect.objectContaining({ projectId: p.id, reason: expect.stringContaining('整改') })
    )
    run('submit', '第二轮补齐')
    s.activeUserId = 'user-business-li'
    run('accept', '')
    expect(p).toMatchObject({
      acceptanceStatus: 'accepted',
      status: 'completed',
      actualCompletedAt: now,
      archived: false,
      acceptanceRound: 2
    })
    expect(p.acceptanceHistory?.map((h) => h.action)).toEqual([
      'assign',
      'submit',
      'return',
      'submit',
      'accept'
    ])
    expect(p.acceptanceHistory?.find((h) => h.summary === '第一轮')?.url).toBe(
      'https://example.com/delivery'
    )
    expect(s.database.lifecycleEvents[0].authorId).toBe('user-business-li')
  })
  it('管理员和协作人不能代交付或代业务验收，旧完成入口和待验收纠正被阻断', () => {
    const { s, p, run } = fixture()
    for (const id of ['user-manager-chen', 'user-engineer-zhao']) {
      s.activeUserId = id
      expect(() => run('submit')).toThrow('主负责工程师')
    }
    s.activeUserId = p.primaryOwnerId
    expect(() =>
      updateProgress(s, { projectId: p.id, kind: 'overall', summary: '', status: 'completed' })
    ).toThrow('业务验收')
    run('submit')
    expect(() =>
      updateProgress(s, { projectId: p.id, kind: 'overall', summary: '', status: 'in-progress' })
    ).toThrow('待业务验收')
    s.activeUserId = 'user-manager-chen'
    expect(() => run('accept')).toThrow('指定业务')
    expect(() => correctProject(s, { projectId: p.id, stage: p.stage, reason: '修正' })).toThrow(
      '待业务验收'
    )
    s.database.users.find((u) => u.id === p.primaryOwnerId)!.role = 'manager'
    s.activeUserId = p.primaryOwnerId
    expect(() => run('withdraw')).toThrow('主负责工程师')
  })
  it('同人改派、含凭据链接、非交付阶段决策和缺计划通过均拒绝', () => {
    const { s, p, run } = fixture()
    expect(() => run('submit', '交付', { url: 'https://user:pass@example.com' })).toThrow('HTTPS')
    s.activeUserId = 'user-manager-chen'
    expect(() => run('assign', '指定', { ownerId: p.acceptanceOwnerId })).toThrow('未改变')
    s.activeUserId = p.primaryOwnerId
    run('submit')
    s.activeUserId = 'user-business-li'
    p.stage = '上线部署'
    expect(() => run('accept')).toThrow('验收交付环节')
    p.stage = '验收交付'
    p.stagePlans = []
    expect(() => run('accept')).toThrow('完整计划')
  })
  it('改派即时转移权限，撤回可重提，旧版本失败，重试不重复历史', () => {
    const { s, p, run } = fixture()
    const requestId = 'retry-submit'
    run('submit', '交付', { requestId })
    run('submit', '交付', { requestId, version: 1 })
    expect(p.acceptanceRound).toBe(1)
    expect(() => run('withdraw', '撤回', { version: 0 })).toThrow('已更新')
    s.activeUserId = 'user-manager-chen'
    const newOwner = s.database.users.find((u) => u.id === 'user-engineer-zhao')!
    newOwner.role = 'business'
    run('assign', '更换验收人', { ownerId: newOwner.id })
    expect(p.acceptanceSummary).toBe('交付')
    s.activeUserId = 'user-business-li'
    expect(() => run('accept')).toThrow('指定业务')
    expect(
      responsibilityTasks(
        s.database,
        s.database.users.find((u) => u.id === s.activeUserId)!,
        now
      ).some((t) => t.projectId === p.id)
    ).toBe(false)
    expect(responsibilityTasks(s.database, newOwner, now)).toContainEqual(
      expect.objectContaining({ action: 'acceptance', projectId: p.id })
    )
    s.activeUserId = p.primaryOwnerId
    run('withdraw', '补充材料')
    run('submit', '重新提交')
    expect(p.acceptanceRound).toBe(2)
  })
  it('待验收停工程师风险待办与停更计时，但延期和三工作日等待保留', () => {
    const { s, p, run } = fixture()
    run('submit')
    p.expectedDeliveryDate = '2026-09-09'
    const at = '2026-09-11T09:00:00+08:00'
    const risks = computeProjectRisks(p, [], at)
    expect(risks).toContain('验收等待 3 个工作日，等待业务确认')
    expect(risks.some((r) => r.includes('项目延期') && r.includes('等待业务确认'))).toBe(true)
    expect(risks.some((r) => r.includes('未更新'))).toBe(false)
    expect(
      responsibilityTasks(
        s.database,
        s.database.users.find((u) => u.id === s.activeUserId)!,
        at
      ).some((t) => t.projectId === p.id)
    ).toBe(false)
  })
  it.each(['cancel', 'archive'] as const)('%s终止待验收，重开不继承结果，删除清待办', (action) => {
    const { s, p, run } = fixture()
    run('submit')
    s.activeUserId = 'user-manager-chen'
    actionProject(s, { projectId: p.id, action, reason: '终止', now })
    expect(p.acceptanceStatus).toBe('none')
    expect(p.acceptanceHistory?.at(-1)?.action).toBe('invalidate')
    actionProject(s, { projectId: p.id, action: 'reopen', now })
    expect(p.acceptanceSubmittedAt).toBeNull()
    actionProject(s, { projectId: p.id, action: 'delete', now })
    expect(s.database.projects.some((row) => row.id === p.id)).toBe(false)
  })
  it('老快照补默认有效业务提交人，历史完成不伪造通过', () => {
    const s = fresh(),
      p = s.database.projects[0]
    p.acceptanceOwnerId = undefined
    initializeAcceptance(p, s.database)
    expect(p.acceptanceOwnerId).toBe('user-business-li')
    p.status = 'completed'
    const migrated = migratePrototypeSnapshot(s).database.projects[0]
    expect(migrated.acceptanceStatus).toBe('none')
    expect(acceptanceLabel(migrated)).toContain('历史完成')
  })
})
afterEach(() => vi.unstubAllGlobals())
it('真实验收命令只发送契约字段且携带版本请求编号', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ id: 'P1', version: 4 }), { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  await actionLiveAcceptance({
    projectId: 'P1',
    version: 3,
    requestId: 'r1',
    action: 'submit',
    summary: '交付',
    now
  })
  expect(fetchMock.mock.calls[0][0]).toContain('/projects/P1/acceptance')
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
    version: 3,
    requestId: 'r1',
    action: 'submit',
    summary: '交付'
  })
})
