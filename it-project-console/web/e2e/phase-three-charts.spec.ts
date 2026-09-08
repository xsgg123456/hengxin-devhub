import { expect, test, type Page } from '@playwright/test'
import type { PrototypeSnapshot } from '../src/domain/prototype'
const key = 'it-project-console.prototype.v1'
async function identity(page: Page, name: string) {
  await page.getByRole('button', { name: '切换演示身份' }).click()
  await page.locator('.identity-menu-item').filter({ hasText: name }).click()
}
test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '直接创建项目' })).toBeVisible()
})
test('搜索筛选与图表明细同源，刷新保留筛选，图表明细进入共享详情', async ({ page }) => {
  const search = page.getByPlaceholder('项目名称、编号、负责人或部门')
  await search.fill('客户数据治理一期')
  await expect(page.locator('[data-project-id]')).toHaveCount(1)
  const distribution = page.locator('section').filter({ hasText: '项目状态分布' })
  await expect(distribution.getByRole('button', { name: '在手项目 1', exact: true })).toBeVisible()
  await expect(distribution.locator('canvas')).toHaveCount(1)
  await page.reload()
  await expect(search).toHaveValue('客户数据治理一期')
  await expect(page.locator('[data-project-id]')).toHaveCount(1)
  await distribution.getByRole('button', { name: '在手项目 1', exact: true }).click()
  await page.getByRole('button', { name: '客户数据治理一期 · 王浩然', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '项目详情', exact: true })).toContainText('65%')
  await page.getByRole('dialog', { name: '项目详情', exact: true }).getByRole('button', { name: '关闭', exact: true }).click()
  await search.fill('不存在的项目')
  await expect(page.locator('[data-project-id]')).toHaveCount(0)
  await expect(distribution.getByText('当前范围暂无项目')).toBeVisible()
  await page.getByRole('button', { name: '清除筛选', exact: true }).first().click()
  for (const width of [1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 1000 })
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: `../output/playwright/phase3-overview-${width}.png`, fullPage: true })
  }
})
test('业务点击待立项定位只读需求，需求双分布与趋势随表格筛选', async ({ page }) => {
  await identity(page, '李思敏')
  await page.goto('/#/project-overview')
  await page.getByRole('button', { name: '待立项 1 个', exact: true }).click()
  await expect(page).toHaveURL(/my-demands.*status=pending/)
  await expect(page.locator('.el-table__body-wrapper .el-table__row')).toHaveCount(1)
  await expect(page.getByRole('button', { name: '评估', exact: true })).toHaveCount(0)
  await expect(page.locator('.quantity-row').filter({ hasText: '李思敏' })).toContainText('1 · 100%')
  await page.getByLabel('月度部门需求堆叠柱形图').scrollIntoViewIfNeeded()
  await expect(page.getByLabel('月度部门需求堆叠柱形图').locator('canvas')).toHaveCount(1)
  await page.locator('.quantity-row').filter({ hasText: '李思敏' }).click()
  const choices = page.getByRole('dialog', { name: '李思敏 · 对应需求' })
  await choices.getByRole('button', { name: '营销活动预算协同平台 · 市场运营部' }).click()
  await expect(page.getByRole('dialog', { name: '需求详情 · 营销活动预算协同平台', exact: true })).toBeVisible()
  await page.getByRole('dialog', { name: '需求详情 · 营销活动预算协同平台', exact: true }).getByRole('button', { name: '关闭', exact: true }).click()
  await page.getByPlaceholder('名称或编号').fill('无匹配需求')
  await expect(page.locator('.el-table__body-wrapper .el-table__row')).toHaveCount(0)
  await expect(page.getByText('当前范围暂无需求', { exact: true })).toHaveCount(2)
  await page.getByPlaceholder('名称或编号').clear()
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.getByLabel('需求提出人分布环形图').scrollIntoViewIfNeeded()
  await expect(page.getByLabel('需求提出人分布环形图').locator('canvas')).toHaveCount(1)
  await page.waitForTimeout(1700) // Art chart expansion animation lasts 1500ms.
  await page.screenshot({ path: '../output/playwright/phase3-demands-1440.png', fullPage: true })
  await page.getByLabel('月度部门需求堆叠柱形图').scrollIntoViewIfNeeded()
  await page.waitForTimeout(1700)
  await page.screenshot({ path: '../output/playwright/phase3-demands-trend-1440.png', fullPage: true })
})
test('新增页面加载与无权限场景隐藏业务', async ({ page }) => {
  for (const scenario of ['loading', 'forbidden'] as const) {
    await page.evaluate(({ key, scenario }) => { const s: PrototypeSnapshot = JSON.parse(localStorage.getItem(key)!); s.scenario = scenario; localStorage.setItem(key, JSON.stringify(s)) }, { key, scenario })
    for (const path of ['today-tasks', 'manager-grants', 'monthly-gantt']) {
      await page.goto('/#/' + path); await page.reload()
      await expect(page.getByText(scenario === 'loading' ? '正在加载…' : '当前场景无查看权限', { exact: true })).toBeVisible()
      await expect(page.locator('[data-task-id], .gantt-grid, .el-table__row')).toHaveCount(0)
    }
  }
})

test('需求池同步展示项目完成、取消与归档，已归档不计在途', async ({ page }) => {
  await page.evaluate((key) => {
    const s: PrototypeSnapshot = JSON.parse(localStorage.getItem(key)!)
    s.database.projects[0].status = 'completed'; s.database.projects[0].archived = true
    s.database.projects[1].status = 'cancelled'
    localStorage.setItem(key, JSON.stringify(s))
  }, key)
  await page.goto('/#/my-demands'); await page.reload()
  await expect(page.getByRole('row').filter({ hasText: '客户数据治理一期' })).toContainText('已完成 · 已归档')
  await expect(page.getByRole('row').filter({ hasText: '采购协同平台升级' })).toContainText('已取消')
  await expect(page.locator('.art-card').filter({ has: page.getByText('关联在途项目', { exact: true }) })).toContainText('1')
})
