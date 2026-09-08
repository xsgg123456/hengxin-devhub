import { expect, type Page, type Locator } from '@playwright/test'
import type { PrototypeSnapshot } from '../src/domain/prototype'
export const key = 'it-project-console.prototype.v1'
export async function snapshot(page: Page): Promise<PrototypeSnapshot> {
  await page.waitForFunction((k) => localStorage.getItem(k) !== null, key)
  return page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), key)
}
export const card = (page: Page, name: string) =>
  page.locator('[data-project-id]').filter({ hasText: name })
export const row = (page: Page, name: string) => page.getByRole('row').filter({ hasText: name })
export async function identity(page: Page, name: string) {
  await page.getByRole('button', { name: '切换演示身份' }).click()
  await page.locator('.identity-menu-item').filter({ hasText: name }).click()
  await expect(page.getByRole('button', { name: '切换演示身份' })).toContainText(name)
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
