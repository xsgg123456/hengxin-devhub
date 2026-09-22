import { expect, test } from '@playwright/test'
import type { PrototypeSnapshot } from '../src/domain/prototype'
import { card, identity, reset, snapshot } from './review-helpers'

test('指定管理员可修订已完成节点日期，其他身份看不到入口', async ({ page }) => {
  await page.goto('/')
  await reset(page)
  const state = await snapshot(page)
  const project = state.database.projects.find(project => project.status === 'active' && !project.archived)!
  project.name = '实际完成日期修订验证'
  project.stage = '开发编码'
  project.simpleStatus = 'in-progress'
  project.status = 'active'
  project.archived = false
  project.version = 1
  project.firstRequestedOn = '2026-07-01'
  state.database.stageHistories = state.database.stageHistories.filter(history => history.projectId !== project.id)
  state.database.stageHistories.push(
    { projectId: project.id, stage: '需求受理', startedAt: '2026-07-01T00:00:00.000Z', completedAt: '2026-07-02T00:00:00.000Z' },
    { projectId: project.id, stage: '立项评审', startedAt: '2026-07-03T00:00:00.000Z', completedAt: '2026-07-04T00:00:00.000Z' },
    { projectId: project.id, stage: '方案设计', startedAt: '2026-07-05T00:00:00.000Z', completedAt: '2026-07-06T00:00:00.000Z' }
  )
  state.database.completionDateChanges = []
  state.activeUserId = 'user-manager-chen'
  await page.evaluate(({ key, state }) => localStorage.setItem(key, JSON.stringify(state)), {
    key: 'it-project-console.prototype.v1',
    state: state as PrototypeSnapshot
  })
  await page.reload()

  await card(page, project.name).getByRole('button', { name: '编辑项目', exact: true }).click()
  const editor = page.getByRole('dialog', { name: '编辑项目', exact: true })
  await editor.getByRole('tab', { name: '阶段与日期', exact: true }).click()
  await expect(editor).toContainText('节点实际完成日期')
  await expect(editor.getByLabel('需求受理实际完成日期', { exact: true })).toHaveValue('2026-07-02')
  await editor.getByLabel('需求受理实际完成日期', { exact: true }).fill('2026-07-03')
  await editor.getByLabel('实际日期修改原因', { exact: true }).fill('按历史项目资料校正实际完成日期')
  await editor.getByRole('button', { name: '保存实际完成日期', exact: true }).click()
  await expect(page.getByText('节点实际完成日期已保存，相关页面已同步', { exact: true })).toBeVisible()

  const saved = await snapshot(page)
  expect(saved.database.stageHistories.find(history => history.projectId === project.id && history.stage === '需求受理')?.completedAt).toBe('2026-07-03T00:00:00.000Z')
  expect(saved.database.completionDateChanges).toEqual(expect.arrayContaining([
    expect.objectContaining({ projectId: project.id, stage: '需求受理', newValue: '2026-07-03' })
  ]))

  await editor.getByRole('button', { name: '取消', exact: true }).click()
  await expect(editor).not.toBeVisible()
  await identity(page, '王浩然')
  await expect(page.getByRole('button', { name: '编辑项目', exact: true })).toHaveCount(0)
})
