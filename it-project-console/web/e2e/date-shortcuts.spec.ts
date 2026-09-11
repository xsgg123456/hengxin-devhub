import { expect, test } from '@playwright/test'

test.use({ timezoneId: 'America/Los_Angeles' })

test('上海快捷日期、编号搜索、原筛选清空和需求联动', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-10T16:00:00Z'))
  await page.goto('/')
  await expect(page.getByRole('button', { name: '直接创建项目' })).toBeVisible()
  const cards = page.locator('[data-project-id]')
  await expect(cards).toHaveCount(3)
  await page.getByPlaceholder('项目名称、编号、负责人或部门').fill('XM-2026-0001')
  await expect(cards).toHaveCount(1)
  await expect(cards).toContainText('经营分析指标统一')
  const start = page.getByPlaceholder('开始日期', { exact: true })
  const end = page.getByPlaceholder('结束日期', { exact: true })
  const shortcuts = page.locator('.el-picker-panel__shortcut')
  await start.click()
  for (const label of [
    '今日',
    '昨日',
    '最近7天',
    '最近14天',
    '最近30天',
    '本月',
    '上月',
    '本年',
    '去年'
  ]) {
    await expect(shortcuts.filter({ hasText: new RegExp('^' + label + '$') })).toBeVisible()
  }
  await shortcuts.filter({ hasText: /^本月$/ }).click()
  await expect(start).toHaveValue('2026-09-01')
  await expect(end).toHaveValue('2026-09-30')
  await expect(cards).toHaveCount(1)
  await start.click()
  await shortcuts.filter({ hasText: /^今日$/ }).click()
  await expect(start).toHaveValue('2026-09-11')
  await expect(cards).toHaveCount(0)
  await page.locator('.filters').getByRole('button', { name: '清除筛选', exact: true }).click()
  await expect(start).toHaveValue('')
  await expect(cards).toHaveCount(3)
  await page.goto('/#/my-demands')
  const rows = page.locator('.el-table__body-wrapper .el-table__row')
  await expect(rows).toHaveCount(4)
  await start.click()
  await shortcuts.filter({ hasText: /^本月$/ }).click()
  await expect(rows).toHaveCount(1)
  await expect(rows).toContainText('营销活动预算协同平台')
  await page.getByRole('button', { name: '重置筛选', exact: true }).click()
  await expect(rows).toHaveCount(4)
})
