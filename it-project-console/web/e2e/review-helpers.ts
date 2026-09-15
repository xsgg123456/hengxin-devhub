import { expect, type Page, type Locator } from '@playwright/test'
import type { PrototypeSnapshot } from '../src/domain/prototype'
export const key = 'it-project-console.prototype.v1'
export async function snapshot(page: Page): Promise<PrototypeSnapshot> {
  await page.waitForFunction((k) => localStorage.getItem(k) !== null, key)
  return page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), key)
}
export const card = (page: Page, name: string) =>
  page.locator('[data-project-id]').filter({ has: page.getByRole('heading', { name, exact: true }) })
export const row = (page: Page, name: string) => page.getByRole('row').filter({ hasText: name })
export async function identity(page: Page, name: string) {
  if ((await page.getByRole('button', { name: '切换演示身份' }).textContent())?.includes(name)) return
  await page.getByRole('button', { name: '切换演示身份' }).click()
  await page.locator('.identity-menu-item').filter({ hasText: name }).click()
  await expect(page.getByRole('button', { name: '切换演示身份' })).toContainText(name)
  const active = (await snapshot(page)).database.users.find(user => user.name === name)!
  const path = active.role === 'manager' ? 'project-overview' : active.role === 'business' ? 'my-demands' : 'my-projects'
  await expect.poll(() => new URL(page.url()).hash).toBe('#/' + path)
}
export async function reset(page: Page) {
  await page.getByRole('button', { name: '切换演示身份' }).click()
  await page.getByRole('button', { name: '重置演示数据', exact: true }).click()
  await page.getByRole('button', { name: '确认重置', exact: true }).click()
  await expect.poll(async () => (await snapshot(page)).scenario).toBe('normal')
  await expect(page.getByRole('button', { name: '确认重置', exact: true })).not.toBeVisible()
}
export async function date(drawer: Locator, label: string, value: string) {
  await drawer.getByLabel(label, { exact: true }).fill(value)
  await drawer.getByLabel(label, { exact: true }).press('Tab')
}
export async function select(page: Page, drawer: Locator, label: string, option: string) {
  await drawer
    .locator('.el-select')
    .filter({ has: page.getByRole('combobox', { name: label, exact: true }) })
    .click()
  const listId = await drawer
    .getByRole('combobox', { name: label, exact: true })
    .getAttribute('aria-controls')
  await page.locator(`[id="${listId}"]`).getByRole('option', { name: option, exact: true }).click()
}

export async function planProject(page: Page, name: string) {
  await card(page, name).getByRole('button', { name: '制定计划' }).click()
  const drawer = page.getByRole('dialog', { name: '制定项目计划', exact: true })
  const inputs = drawer.locator('input[aria-label$="计划开始日期"]')
  const labels = await inputs.evaluateAll(elements => elements.map(el => el.getAttribute('aria-label')!))
  for (const label of labels) {
    await date(drawer, label, '2099-10-10')
    await date(drawer, label.replace('开始', '结束'), '2099-10-10')
  }
  await date(drawer, '上线部署计划结束日期', '2099-10-20')
  await date(drawer, '验收交付计划开始日期', '2099-10-20')
  await date(drawer, '验收交付计划结束日期', '2099-10-30')
  await drawer.getByRole('button', { name: '保存计划' }).click()
  await expect(drawer).not.toBeVisible()
}

export async function acceptProposal(page: Page, name: string) {
  await page.goto('/#/today-tasks')
  await identity(page, '王浩然')
  await page.goto('/#/today-tasks')
  await page.locator('.task-row').filter({ hasText: name }).getByRole('button', { name: '确认接单', exact: true }).click()
  const drawer = page.getByRole('dialog', { name: '接单详情 · ' + name, exact: true })
  await drawer.getByRole('button', { name: /^(确认接单并立项|确认接单优化)$/, exact: true }).click()
  await expect(drawer).not.toBeVisible()
  await page.goto('/#/my-projects')
  await expect(card(page, name)).toBeVisible()
}
