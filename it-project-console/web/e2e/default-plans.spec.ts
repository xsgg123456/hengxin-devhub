import { expect, test } from '@playwright/test'
import type { PrototypeSnapshot } from '../src/domain/prototype'
import { mkdir } from 'node:fs/promises'

test.beforeEach(async ({ page }) => {
  await mkdir('../output/playwright/optimization-implemented', { recursive: true })
  await page.setViewportSize({ width: 1440, height: 1000 })
})

test('业务不显示管理图表且保留筛选和统计', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '切换演示身份' }).click()
  await page.locator('.identity-menu-item').filter({ hasText: '李思敏' }).click()
  await page.goto('/#/project-overview')
  await expect(page.getByRole('heading', { name: '项目明细', exact: true })).toBeVisible()
  await expect(page.locator('.overview-charts')).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: '搜索项目', exact: true })).toBeVisible()
  await expect(page.locator('.metrics > button')).toHaveCount(5)
  await page.screenshot({ path: '../output/playwright/optimization-implemented/business-projects.png' })
})

test('首次计划预填3工作日，取消不保存，已有计划不覆盖且手改不联动', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '直接创建项目' })).toBeVisible()
  await page.evaluate(() => {
    const key = 'it-project-console.prototype.v1'
    const snapshot: PrototypeSnapshot = JSON.parse(localStorage.getItem(key)!)
    const p = snapshot.database.projects[0]!
    p.stage = '方案设计'; p.stagePlans = []; p.name = '三工作日默认排期验证'
    snapshot.database.stageHistories.push({ projectId: p.id, stage: '立项评审', startedAt: '2026-09-11T01:00:00Z', completedAt: '2026-09-11T01:00:00Z' })
    localStorage.setItem(key, JSON.stringify(snapshot))
  })
  await page.reload()
  const card = page.locator('[data-project-id]').filter({ hasText: '三工作日默认排期验证' })
  await card.getByRole('button', { name: '制定计划', exact: true }).click()
  const drawer = page.getByRole('dialog', { name: '制定项目计划', exact: true })
  await expect(drawer.getByLabel('方案设计计划开始日期', { exact: true })).toHaveValue('2026-09-14')
  await expect(drawer.getByLabel('开发编码计划结束日期', { exact: true })).toHaveValue('2026-09-21')
  await expect(drawer.getByLabel('验收交付计划结束日期', { exact: true })).toHaveValue('2026-10-02')
  await page.screenshot({ path: '../output/playwright/optimization-implemented/default-plan.png' })
  await drawer.getByRole('button', { name: '取消', exact: true }).click()
  await expect(drawer).not.toBeVisible()
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('it-project-console.prototype.v1')!).database.projects[0].stagePlans)).toEqual([])
  await card.getByRole('button', { name: '制定计划', exact: true }).click()
  await drawer.getByLabel('方案设计计划开始日期', { exact: true }).fill('2026-09-15')
  await drawer.getByLabel('方案设计计划开始日期', { exact: true }).press('Tab')
  await expect(drawer.getByLabel('开发编码计划开始日期', { exact: true })).toHaveValue('2026-09-17')
  await drawer.getByRole('button', { name: '保存计划', exact: true }).click()
  await expect(drawer).not.toBeVisible()
  await card.getByRole('button', { name: '调整计划', exact: true }).click()
  const edit = page.getByRole('dialog', { name: '调整项目计划', exact: true })
  await expect(edit.getByLabel('方案设计计划开始日期', { exact: true })).toHaveValue('2026-09-15')
  await expect(edit.getByLabel('验收交付计划结束日期', { exact: true })).toHaveValue('2026-10-02')
})
