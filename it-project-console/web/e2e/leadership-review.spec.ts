import { expect, test } from '@playwright/test'
import { card, date, identity, reset, row, select, snapshot } from './review-helpers'

test('领导评审从UI重置开始，四账号连续操作共享同一项目并回到初始场景', async ({ page }) => {
  test.setTimeout(90000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await reset(page)
  const initial = (await snapshot(page)).database
  await identity(page, '李思敏')
  const name = '领导评审共享预算项目'
  await page.getByRole('button', { name: '提交正式项目需求' }).click()
  let drawer = page.getByRole('dialog', { name: '提交正式项目需求' })
  await drawer.getByLabel('项目名称', { exact: true }).fill(name)
  await drawer.getByLabel('这次要解决什么问题（一句话）').fill('让预算进度和风险在各角色同步可见')
  await date(drawer, '期望上线日期', '2099-10-20')
  await drawer
    .getByPlaceholder('https://', { exact: true })
    .nth(0)
    .fill('https://example.com/prd.pdf')
  await drawer
    .getByPlaceholder('https://', { exact: true })
    .nth(1)
    .fill('https://example.com/prototype.html')
  await drawer.getByRole('button', { name: '提交评估' }).click()
  await expect(row(page, name)).toContainText('待评估')
  const demand = (await snapshot(page)).database.demands.find((d) => d.name === name)!
  await identity(page, '陈立峰')
  await page.goto('/#/my-demands')
  await row(page, name).getByRole('button', { name: '评估', exact: true }).click()
  drawer = page.getByRole('dialog', { name: `需求评估 · ${name}` })
  await select(page, drawer, '主负责人', '王浩然')
  await select(page, drawer, '协作人员', '赵清越')
  await drawer.getByRole('combobox', { name: '协作人员', exact: true }).press('Escape')
  await date(drawer, '最初计划上线日期', '2099-10-20')
  await date(drawer, '最初计划交付日期', '2099-10-30')
  await date(drawer, '方案设计预计完成日期', '2099-10-10')
  await drawer.getByRole('button', { name: '通过并立项' }).click()
  await expect(row(page, name)).toContainText('已立项')
  const project = (await snapshot(page)).database.projects.find((p) => p.demandId === demand.id)!
  await identity(page, '王浩然')
  await card(page, name).getByRole('button', { name: '更新进度' }).click()
  drawer = page.getByRole('dialog', { name: '更新项目进度' })
  await drawer.getByRole('spinbutton', { name: '整体进度（%）' }).fill('63')
  await select(page, drawer, '当前阶段状态', '已阻塞')
  await drawer.getByLabel('阻塞说明').fill('等待预算接口联调窗口开放')
  await drawer.getByLabel('进展说明', { exact: true }).fill('等待预算接口联调窗口')
  await drawer.getByRole('button', { name: '保存进度' }).click()
  await expect(drawer).not.toBeVisible()
  await expect(card(page, name)).toContainText('63%')
  const overall = (await snapshot(page)).database.projects.find((p) => p.id === project.id)!
  await identity(page, '赵清越')
  await expect(card(page, name)).toContainText('协作')
  await expect(card(page, name).getByRole('button', { name: '更新进度' })).toHaveCount(0)
  await card(page, name).getByRole('button', { name: '填写协作进展' }).click()
  drawer = page.getByRole('dialog', { name: '填写协作进展' })
  await drawer.getByLabel('进展说明', { exact: true }).fill('预算联调样例已准备')
  await drawer.getByRole('button', { name: '保存进度' }).click()
  await expect(drawer).not.toBeVisible()
  const afterCollaboration = (await snapshot(page)).database.projects.find(
    (p) => p.id === project.id
  )!
  expect({ ...afterCollaboration, updatedAt: overall.updatedAt }).toEqual(overall)
  await identity(page, '陈立峰')
  await page.getByPlaceholder('项目名称、编号、负责人或部门').fill(name)
  await expect(page.locator('[data-project-id]')).toHaveCount(1)
  await expect(card(page, name)).toContainText('已阻塞')
  await page.getByRole('button', { name: '在手项目 1', exact: true }).click()
  await page.getByRole('button', { name: `${name} · 王浩然`, exact: true }).click()
  drawer = page.getByRole('dialog', { name: '项目详情', exact: true })
  await expect(drawer).toContainText('预算联调样例已准备')
  await expect(drawer).toContainText('63%')
  await drawer.getByRole('button', { name: '关闭', exact: true }).click()
  const workload = page.locator('section').filter({ hasText: '月度人员负载' })
  await workload
    .getByRole('row')
    .filter({ hasText: '王浩然' })
    .getByRole('button', { name: '1 / 0', exact: true })
    .click()
  await page.getByRole('button', { name: `主责 · ${name}`, exact: true }).click()
  await expect(drawer).toContainText(name)
  await drawer.getByRole('button', { name: '关闭', exact: true }).click()
  await expect(drawer).not.toBeVisible()
  await expect(page).not.toHaveURL(/projectId=/)
  await page.getByRole('menuitem', { name: '甘特图', exact: true }).click()
  await expect(page.getByRole('button', { name: `查看${name}详情`, exact: true })).toContainText(
    '63%'
  )
  await expect(page.locator('.project-cell').filter({ hasText: name })).toContainText('阻塞')
  await page.getByRole('button', { name: `查看${name}详情`, exact: true }).click()
  await expect(drawer).toContainText('预算联调样例已准备')
  const saved = await snapshot(page)
  await page.reload()
  await expect(drawer).toContainText('预算联调样例已准备')
  expect(await snapshot(page)).toEqual(saved)
  await drawer.getByRole('button', { name: '关闭', exact: true }).click()
  await reset(page)
  expect((await snapshot(page)).database.projects.map((p) => p.id)).toEqual(
    initial.projects.map((p) => p.id)
  )
  expect((await snapshot(page)).database.demands.map((d) => d.id)).toEqual(
    initial.demands.map((d) => d.id)
  )
  expect(errors).toEqual([])
})

for (const [role, person, route] of [
  ['manager', '陈立峰', 'project-overview'],
  ['business', '李思敏', 'my-demands'],
  ['engineer', '王浩然', 'project-overview']
] as const) {
  test(`${role}正常页面三档桌面截图，无全局溢出与pageerror`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto('/')
    // Vite cold-start loads the Art modules after the document load event.
    await expect(page.getByRole('button', { name: '切换演示身份' })).toBeVisible({ timeout: 20000 })
    if (role !== 'manager') await identity(page, person)
    await page.goto('/#/' + route)
    for (const width of [1024, 1280, 1440]) {
      await page.setViewportSize({ width, height: 1000 })
      await expect(page.getByRole('button', { name: '切换演示身份' })).toContainText(person)
      for (const chart of await page.locator('[aria-label$="图"]').all()) {
        if (await chart.isVisible()) await chart.scrollIntoViewIfNeeded()
      }
      await page.locator('.business-page-state').scrollIntoViewIfNeeded()
      await page.waitForTimeout(1700) // Existing chart expansion animation is 1500ms.
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true
      )
      await page.screenshot({
        path: `../output/playwright/phase4-${role}-${width}.png`,
        fullPage: true
      })
      if (role === 'business') {
        await page.getByLabel('月度部门需求堆叠柱形图').scrollIntoViewIfNeeded()
        await page.waitForTimeout(1700)
        await page.screenshot({
          path: `../output/playwright/phase4-business-trend-${width}.png`,
          fullPage: true
        })
      }
    }
    expect(errors).toEqual([])
  })
}
