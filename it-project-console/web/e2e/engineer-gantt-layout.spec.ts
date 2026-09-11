import { expect, test } from '@playwright/test'
import type { PrototypeSnapshot } from '../src/domain/prototype'

test('工程师本人范围直接展示原项目卡片，全部范围与管理者保留图表', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 911 })
  await page.goto('/')
  await page.getByRole('button', { name: '切换演示身份' }).click()
  await page.locator('.identity-menu-item').filter({ hasText: '王浩然' }).click()
  await expect(page).toHaveURL(/my-projects/)
  await expect(page.locator('.overview-charts')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: '项目明细', exact: true })).toBeVisible()
  await expect(page.locator('[data-project-id]').first()).toBeVisible()
  await page.screenshot({ path: '../output/playwright/engineer-projects-implemented.png' })
  await page.locator('.el-radio-button').filter({ hasText: '全部项目' }).click()
  await expect(page.getByRole('heading', { name: '项目状态分布', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '切换演示身份' }).click()
  await page.locator('.identity-menu-item').filter({ hasText: '陈立峰' }).click()
  await page.locator('.el-radio-button').filter({ hasText: '我负责 / 参与' }).click()
  await expect(page.getByRole('heading', { name: '月度人员负载', exact: true })).toBeVisible()
})

for (const [month, days] of [['2027-02', 28], ['2028-02', 29], ['2026-09', 30], ['2026-10', 31]] as const) {
  test(`${month}的${days}天网格与计划、交付标记、今日线对齐且无人工进度条`, async ({ page }) => {
    await page.clock.setFixedTime(new Date(`${month}-10T04:00:00Z`))
    await page.goto('/')
    await expect(page.getByRole('button', { name: '直接创建项目' })).toBeVisible()
    await page.evaluate((month) => {
      const key = 'it-project-console.prototype.v1'
      const snapshot: PrototypeSnapshot = JSON.parse(localStorage.getItem(key)!)
      snapshot.database.projects.push({
        ...snapshot.database.projects[0]!, id: 'layout-date-boundary', demandId: null,
        name: '日期对齐验证', createdAt: `${month}-03T00:00:00Z`,
        expectedDeliveryDate: `${month}-20`, originalDeliveryDate: `${month}-18`,
        overallProgress: 50, status: 'active', archived: false
      })
      localStorage.setItem(key, JSON.stringify(snapshot))
    }, month)
    await page.goto('/#/monthly-gantt')
    await page.reload()
    await expect(page.locator('.day-grid > span')).toHaveCount(days)
    const track = page.getByRole('button', { name: '查看日期对齐验证详情', exact: true })
    await expect(track).toBeVisible()
    await expect(track.locator('.progress-bar')).toHaveCount(0)
    await expect(track).not.toContainText('%')
    for (const [selector, leftDays, widthDays] of [
      ['.plan-bar', 2, 18],
      ['.original-marker', 17.5, null], ['.today-line', 9.5, null]
    ] as const) {
      const bar = await track.locator(selector).boundingBox()
      const row = await track.boundingBox()
      expect(bar).not.toBeNull()
      const unit = row!.width / days
      expect(Math.abs(bar!.x - row!.x - leftDays * unit)).toBeLessThan(1)
      if (widthDays !== null) expect(Math.abs(bar!.width - widthDays * unit)).toBeLessThan(1)
    }
  })
}

test('甘特铺满宽屏，窄屏内部双向滚动且表头左列固定，标记随月份对齐', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 911 })
  await page.goto('/#/monthly-gantt')
  const scroll = page.locator('.gantt-scroll')
  await expect(scroll).toBeVisible()
  await page.evaluate(() => {
    const key = 'it-project-console.prototype.v1'
    const snapshot: PrototypeSnapshot = JSON.parse(localStorage.getItem(key)!)
    const source = snapshot.database.projects[0]!
    for (let index = 0; index < 10; index++) snapshot.database.projects.push({
      ...source, id: `layout-scroll-${index}`, demandId: null, name: `滚动验证项目${index}`,
      createdAt: '2026-01-01T00:00:00Z', expectedDeliveryDate: '2027-12-31',
      originalDeliveryDate: '2026-10-15', status: 'active', archived: false
    })
    localStorage.setItem(key, JSON.stringify(snapshot))
  })
  await page.reload()
  await expect(scroll).toBeVisible()
  const dimensions = await scroll.evaluate(el => ({ width: el.clientWidth, grid: el.firstElementChild!.getBoundingClientRect().width }))
  expect(Math.abs(dimensions.width - dimensions.grid)).toBeLessThan(2)
  await page.screenshot({ path: '../output/playwright/gantt-implemented.png' })
  await page.setViewportSize({ width: 1024, height: 768 })
  const before = await page.locator('.frozen.header').boundingBox()
  const movement = await scroll.evaluate(el => { el.scrollTop = 220; el.scrollLeft = 260; return { x: el.scrollLeft, y: el.scrollTop } })
  expect(movement.x).toBeGreaterThan(0)
  expect(movement.y).toBeGreaterThan(0)
  const after = await page.locator('.frozen.header').boundingBox()
  expect(Math.abs(after!.x - before!.x)).toBeLessThan(2)
  expect(Math.abs(after!.y - before!.y)).toBeLessThan(2)
  expect(Math.abs((await page.locator('.day-grid').boundingBox())!.y - before!.y)).toBeLessThan(2)
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await scroll.evaluate(el => { el.scrollTop = 0; el.scrollLeft = 0 })
  for (let step = 0; step < 3; step++) {
    const geometry = await page.locator('.day-grid').evaluate(el => ({
      days: el.children.length, width: el.getBoundingClientRect().width,
      cell: el.children[0]!.getBoundingClientRect().width
    }))
    expect(Math.abs(geometry.cell * geometry.days - geometry.width)).toBeLessThan(2)
    const aligned = await page.locator('.original-marker').evaluateAll(elements => elements.every(el => {
      const track = el.parentElement!.getBoundingClientRect()
      const days = document.querySelector('.day-grid')!.children.length
      const dayPosition = (el.getBoundingClientRect().left - track.left) / (track.width / days)
      return Math.abs(dayPosition - 0.5 - Math.round(dayPosition - 0.5)) < 0.05
    }))
    expect(aligned).toBe(true)
    await page.getByRole('button', { name: '下一月', exact: true }).click()
  }
})
