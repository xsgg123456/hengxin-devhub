import { expect, test } from '@playwright/test'
import type { PrototypeSnapshot } from '../src/domain/prototype'

const key = 'it-project-console.prototype.v1'

test('管理指标区分在手与已归档完成项目，点击筛选口径一致', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '直接创建项目' })).toBeVisible()
  await page.evaluate((key) => {
    const data: PrototypeSnapshot = JSON.parse(localStorage.getItem(key)!)
    data.database.projects[0].status = 'completed'
    data.database.projects[0].archived = true
    localStorage.setItem(key, JSON.stringify(data))
  }, key)
  await page.reload()
  await page.getByText('含归档', { exact: true }).click()
  await expect(page.getByRole('button', { name: '在手项目 2 个' })).toBeVisible()
  await expect(page.locator('[data-project-id]')).toHaveCount(3)
  await page.getByRole('button', { name: '在手项目 2 个' }).click()
  await expect(page.locator('[data-project-id]')).toHaveCount(2)
  await expect(
    page.locator('[data-project-id]').filter({ hasText: '客户数据治理一期' })
  ).toHaveCount(0)
  await page.getByRole('button', { name: '清除筛选', exact: true }).click()
  await page.getByText('含归档', { exact: true }).click()
  await page
    .locator('.el-select')
    .filter({ has: page.getByRole('combobox', { name: '项目状态', exact: true }) })
    .click()
  await page.getByRole('option', { name: '已完成', exact: true }).click()
  await expect(page.locator('[data-project-id]')).toHaveCount(1)
  await expect(page.locator('[data-project-id]')).toContainText('客户数据治理一期')
})

test.describe('浏览器时区与上海提交日不一致', () => {
  test.use({ timezoneId: 'Pacific/Auckland' })
  test('本地已到次日时仍允许提交上海今天的需求', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-09-08T23:30:00+08:00') })
    await page.goto('/')
    await page.getByRole('button', { name: '切换演示身份' }).click()
    await page.getByRole('button', { name: /李思敏 业务人员/ }).click()
    await page.getByRole('button', { name: '提交正式项目需求' }).click()
    const drawer = page.getByRole('dialog', { name: '提交正式项目需求' })
    await drawer.getByLabel('项目名称', { exact: true }).fill('跨时区当天需求')
    await drawer.getByLabel('这次要解决什么问题（一句话）').fill('按上海业务日期接收需求')
    await drawer.getByLabel('期望上线日期', { exact: true }).fill('2026-09-08')
    await drawer.getByLabel('期望上线日期', { exact: true }).press('Tab')
    await drawer
      .getByPlaceholder('https://', { exact: true })
      .nth(0)
      .fill('https://example.com/prd.pdf')
    await drawer
      .getByPlaceholder('https://', { exact: true })
      .nth(1)
      .fill('https://example.com/prototype.html')
    await drawer.getByRole('button', { name: '提交评估' }).click()
    await expect(page.getByRole('row').filter({ hasText: '跨时区当天需求' })).toContainText(
      '待评估'
    )
  })
})
