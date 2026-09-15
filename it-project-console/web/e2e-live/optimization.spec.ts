import { expect, test, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import type { PrototypeSnapshot } from '../src/domain/prototype'
import { date, select } from '../e2e/review-helpers'
import { acceptanceDetail, openAcceptance } from '../e2e/business-acceptance-helpers'

async function workspace(page: Page): Promise<PrototypeSnapshot> {
  const response = await page.request.get('/api/workspace')
  expect(response.ok()).toBeTruthy()
  return (await response.json()).data
}
async function post(page: Page, path: string, data: Record<string, unknown>) {
  const response = await page.request.post('/api' + path, {
    headers: { origin: 'http://127.0.0.1:4325' }, data: { requestId: crypto.randomUUID(), ...data }
  })
  expect(response.ok(), await response.text()).toBeTruthy()
  return (await response.json()).data
}
async function identity(page: Page, name: string) {
  const detail = acceptanceDetail(page)
  if (await detail.isVisible()) { await detail.getByRole('button', { name: '关闭', exact: true }).click(); await expect(detail).not.toBeVisible() }
  const current = page.getByRole('button', { name: '当前用户' })
  await current.click()
  const account = page.getByRole('button', { name: new RegExp(name + ' ·') })
  const [response] = await Promise.all([
    page.waitForResponse(r => r.url().endsWith('/api/auth/dev-login') && r.request().method() === 'POST'), account.click()
  ])
  if (response.status() === 429) {
    const seconds = Number(response.headers()['retry-after'])
    expect(seconds).toBeGreaterThan(0); expect(seconds).toBeLessThanOrEqual(60)
    await page.waitForTimeout(seconds * 1000 + 100)
    if (!(await account.isVisible())) await current.click()
    await account.click()
  } else expect(response.ok()).toBeTruthy()
  await expect(current).toContainText(name)
}

test('真实优化需求经审批接单后仅一节点，计划保存并业务验收，刷新保留关联', async ({ page }) => {
  test.setTimeout(180_000)
  await mkdir('../output/playwright/optimization-implemented', { recursive: true })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/')
  await page.getByRole('button', { name: /陈立峰 ·/ }).click()
  await expect(page.getByRole('button', { name: '当前用户' })).toContainText('陈立峰')
  // Named disposable seed in isolated schema; historical operation creates the completed parent fixture.
  const initial = await workspace(page)
  const parent = initial.database.projects.find(p => p.status === 'active' && !p.parentProjectId)!
  await post(page, `/projects/${parent.id}/historical-delivery`, { version: parent.version, deliveredOn: '2026-09-11', reason: '隔离优化浏览器测试父项目' })
  const original = (await workspace(page)).database.projects.find(p => p.id === parent.id)!
  await identity(page, '李思敏')
  await openAcceptance(page, parent.id)
  await acceptanceDetail(page).getByRole('button', { name: '提优化需求', exact: true }).click()
  const editor = page.getByRole('dialog', { name: '优化需求', exact: true })
  const name = `真实单节点优化-${Date.now()}`
  await editor.getByLabel('优化标题', { exact: true }).fill(name)
  await editor.getByLabel('当前问题', { exact: true }).fill('回复记录人工整理耗时')
  await editor.getByLabel('期望效果 / 验收标准', { exact: true }).fill('按日期导出完整回复记录')
  await date(editor, '期望上线日期', '2099-10-20')
  await editor.screenshot({ path: '../output/playwright/optimization-implemented/live-submit.png' })
  await editor.getByRole('button', { name: '提交评估', exact: true }).click()
  await expect(editor).not.toBeVisible()
  const demand = (await workspace(page)).database.demands.find(d => d.name === name)!
  expect(demand.parentProjectId).toBe(parent.id)
  expect(demand.attachments ?? []).toHaveLength(0)
  await identity(page, '陈立峰')
  await post(page, `/demands/${demand.id}/review`, { version: demand.version, decision: 'approve', priority: 'P2', primaryOwnerId: 'user-engineer-wang', collaboratorIds: [], approvedLaunchDate: '2099-10-20', reason: '' })
  expect((await workspace(page)).database.projects.some(p => p.demandId === demand.id)).toBe(false)
  await identity(page, '王浩然')
  await page.goto('/#/today-tasks')
  await page.locator('.task-row').filter({ hasText: name }).getByRole('button', { name: '确认接单', exact: true }).click()
  const proposal = page.getByRole('dialog', { name: '接单详情 · ' + name, exact: true })
  await proposal.getByRole('button', { name: '确认接单并立项', exact: true }).click()
  await expect(proposal).not.toBeVisible()
  let child = (await workspace(page)).database.projects.find(p => p.demandId === demand.id)!
  expect(child.parentProjectId).toBe(parent.id)
  await openAcceptance(page, child.id)
  await acceptanceDetail(page).getByRole('button', { name: '制定计划', exact: true }).click()
  const plan = page.getByRole('dialog', { name: '制定项目计划', exact: true })
  await expect(plan.locator('input[aria-label$="计划开始日期"]')).toHaveCount(1)
  await expect(plan.getByLabel('优化交付计划开始日期', { exact: true })).not.toHaveValue('')
  await plan.screenshot({ path: '../output/playwright/optimization-implemented/live-single-plan.png' })
  await plan.getByRole('button', { name: '保存计划', exact: true }).click()
  await expect(plan).not.toBeVisible()
  child = (await workspace(page)).database.projects.find(p => p.id === child.id)!
  expect(child.stagePlans).toHaveLength(1)
  expect(child.expectedDeliveryDate).toBe(child.stagePlans![0].endDate)
  // Regression: full editor hides duplicate milestone inputs; its single end date must drive both.
  await identity(page, '陈立峰')
  await openAcceptance(page, child.id)
  await acceptanceDetail(page).getByRole('button', { name: '编辑项目', exact: true }).click()
  const fullEditor = page.getByRole('dialog', { name: '编辑项目', exact: true })
  await fullEditor.getByRole('tab', { name: '阶段与日期', exact: true }).click()
  await fullEditor.locator('input[aria-label$="计划结束"]').fill('2099-10-21')
  await fullEditor.locator('input[aria-label$="计划结束"]').press('Tab')
  await fullEditor.getByRole('button', { name: '保存修改', exact: true }).click()
  const confirmation = page.getByRole('dialog', { name: '确认本次修改', exact: true })
  await confirmation.getByLabel('修改原因').fill('核对优化交付日期，验证单节点里程碑同步')
  const saving = page.waitForResponse(r => r.url().endsWith(`/api/projects/${child.id}/edit`) && r.request().method() === 'POST')
  await confirmation.getByRole('button', { name: '确认保存', exact: true }).click()
  const saved = await saving
  expect(saved.ok(), await saved.text()).toBeTruthy()
  await expect(fullEditor).not.toBeVisible()
  const edited = (await workspace(page)).database.projects.find(p => p.id === child.id)!
  expect(edited.expectedDeliveryDate).toBe('2099-10-21')
  expect(edited.expectedLaunchDate).toBe('2099-10-21')
  await identity(page, '王浩然')
  await openAcceptance(page, child.id)
  await acceptanceDetail(page).getByLabel('交付说明', { exact: true }).fill('回复记录导出已完成，请确认字段和日期范围')
  await acceptanceDetail(page).getByRole('button', { name: '提交验收', exact: true }).click()
  await expect(acceptanceDetail(page)).toContainText('待业务验收')
  await identity(page, '李思敏')
  await openAcceptance(page, child.id)
  await acceptanceDetail(page).getByRole('button', { name: '验收通过', exact: true }).click()
  await expect(acceptanceDetail(page).getByRole('button', { name: '验收通过', exact: true })).toHaveCount(0)
  await page.reload()
  const result = await workspace(page)
  expect(result.database.projects.find(p => p.id === child.id)?.status).toBe('completed')
  expect(result.database.projects.find(p => p.id === parent.id)?.actualCompletedAt).toBe(original.actualCompletedAt)
  await openAcceptance(page, parent.id)
  await expect(acceptanceDetail(page)).toContainText(name)
  await acceptanceDetail(page).screenshot({ path: '../output/playwright/optimization-implemented/live-parent.png' })
  await acceptanceDetail(page).getByRole('button', { name: '关闭', exact: true }).click()
  await select(page, page.locator('main'), '项目类型', '优化项目')
  await expect(page.locator('[data-project-id]')).toHaveCount(1)
})
