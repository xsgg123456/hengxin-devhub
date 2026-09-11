import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import type { DashboardResult } from '../src/services/live-dashboard-types'
const headers = { origin: 'http://127.0.0.1:4325' }
async function login(page: Page, userId = 'user-manager-chen') {
  let response = await page.request.post('/api/auth/dev-login', { headers, data: { userId } })
  if (response.status() === 429) {
    // 多角色自动化超过真实登录频率时，遵守服务端窗口，不关闭登录限流。
    const seconds = Number(response.headers()['retry-after'])
    expect(seconds).toBeGreaterThan(0)
    expect(seconds).toBeLessThanOrEqual(60)
    await page.waitForTimeout(seconds * 1000 + 100)
    response = await page.request.post('/api/auth/dev-login', { headers, data: { userId } })
  }
  expect(response.ok()).toBeTruthy()
  await page.goto('/#/project-overview')
  await page.reload()
  await expect(page.getByRole('button', { name: '当前用户' })).toBeVisible()
}
async function select(page: Page, label: string, option: string) {
  const input = page.getByRole('combobox', { name: label, exact: true })
  await page.locator('.el-select').filter({ has: input }).click()
  const list = await input.getAttribute('aria-controls')
  await page.locator(`[id="${list}"]`).getByRole('option', { name: option, exact: true }).click()
}
async function dashboard(page: Page, query: string): Promise<DashboardResult> {
  const response = await page.request.get(`/api/dashboard?${query}`)
  expect(response.ok()).toBeTruthy()
  return (await response.json()).data
}
test('真实看板筛选分页、三角色读取、甘特与需求统计、错误重试和桌面布局', async ({ page }) => {
  test.setTimeout(150000)
  await mkdir(resolve('../output'), { recursive: true })
  const apiPaths: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/api/')) apiPaths.push(request.url())
  })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await login(page)
  const prefix = `看板验收-${Date.now()}`
  const month = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' })
    .format(new Date())
    .slice(0, 7)
  const [year, monthNumber] = month.split('-').map(Number)
  const monthEnd = new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10)
  const timings: number[] = []
  for (let index = 0; index < 21; index++) {
    const start = Date.now()
    const response = await page.request.post('/api/projects', {
      headers,
      data: {
        requestId: randomUUID(),
        name: `${prefix}-${index}`,
        department: '看板验收部',
        priority: 'P1',
        primaryOwnerId: 'user-engineer-wang',
        collaboratorIds: ['user-engineer-zhao']
      }
    })
    expect(response.ok()).toBeTruthy()
    timings.push(Date.now() - start)
    const project = (await response.json()).data
    const stages = ['方案设计', '开发编码', '联调测试', '上线部署', '验收交付']
    const planned = await page.request.post(`/api/projects/${project.id}/plan`, { headers, data: {
      requestId: randomUUID(), version: project.version,
      plans: stages.map((stage, stageIndex) => {
        const date = index === 0 ? stageIndex === 0 ? '2020-01-01' : monthEnd : '2099-12-01'
        return { stage, startDate: date, endDate: date }
      })
    } })
    expect(planned.ok()).toBeTruthy()
  }
  await page.reload()
  const search = page.getByPlaceholder('项目名称、编号、负责人或部门')
  await search.fill(prefix)
  await expect(page.locator('.project-card')).toHaveCount(20)
  await expect(page.locator('.el-pagination')).toContainText('21')
  await page.locator('.el-pagination .number').filter({ hasText: /^2$/ }).click()
  await expect(page.locator('.project-card')).toHaveCount(1)
  await select(page, '项目人员', '赵清越')
  await expect(page.locator('.project-card')).toHaveCount(20)
  const filtered = await dashboard(
    page,
    `keyword=${encodeURIComponent(prefix)}&person=user-engineer-zhao`
  )
  expect(filtered.total).toBe(21)
  expect(filtered.projects.every((p) => p.collaboratorIds.includes('user-engineer-zhao'))).toBe(
    true
  )
  await page.locator('.metric').filter({ hasText: '已延期' }).click()
  await expect(page.locator('.project-card')).toHaveCount(1)
  await expect(page.locator('.project-card')).toContainText('延期')
  await page.locator('.project-card').getByRole('button', { name: '详情', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '项目详情', exact: true })).toContainText(
    `${prefix}-0`
  )
  await page
    .getByRole('dialog', { name: '项目详情', exact: true })
    .getByRole('button', { name: '关闭', exact: true })
    .click()
  await page.getByRole('button', { name: '清除筛选', exact: true }).first().click()
  await search.fill(prefix)
  await expect(page.locator('.project-card')).toHaveCount(20)
  const workload = page
    .locator('section')
    .filter({ has: page.getByText('月度人员负载', { exact: true }) })
  await expect(workload.getByRole('row').filter({ hasText: '王浩然' })).toContainText('21 / 0')
  await expect(workload.getByRole('row').filter({ hasText: '赵清越' })).toContainText('0 / 21')
  for (const width of [1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 1000 })
    await expect(page.locator('.project-card').first()).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true
    )
    let previous = ''
    await expect.poll(async () => {
      const current = await page.locator('canvas').evaluateAll(nodes => nodes.map(node => (node as HTMLCanvasElement).toDataURL()).join('|'))
      const stable = current === previous
      previous = current
      return stable
    }, { intervals: [300, 300, 300], timeout: 5000 }).toBe(true)
    await page.screenshot({
      path: resolve(`../output/phase8-overview-${width}.png`),
      fullPage: true
    })
  }
  await page.locator('.project-card').first().scrollIntoViewIfNeeded()
  await page.screenshot({ path: resolve('../output/phase8-project-cards.png'), fullPage: true })
  await page.route('**/api/dashboard?**', (route) => route.abort())
  await search.fill('网络失败')
  await expect(page.getByText('网络请求失败，请检查连接后重试', { exact: true })).toBeVisible()
  await page.unroute('**/api/dashboard?**')
  await page.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect(page.getByText('当前没有符合条件的项目', { exact: true })).toBeVisible()
  for (const userId of ['user-engineer-wang', 'user-business-li']) {
    await login(page, userId)
    await page.getByRole('radio', { name: '全部项目', exact: true }).check()
    await search.fill(prefix)
    await expect(page.locator('.project-card')).toHaveCount(20)
    await expect(page.getByRole('button', { name: '直接创建项目', exact: true })).toHaveCount(0)
    const forbidden = await page.request.post('/api/manager-grants', {
      headers,
      data: { userId: 'user-business-li', enabled: true, requestId: randomUUID() }
    })
    expect(forbidden.status()).toBe(403)
  }
  await page.goto('/#/monthly-gantt')
  await select(page, '甘特部门', '看板验收部')
  await expect(page.getByText('21 个项目', { exact: true })).toBeVisible()
  const riskTrack = page.getByRole('button', { name: `查看${prefix}-0详情`, exact: true })
  await riskTrack.hover()
  await expect.poll(async () => {
    const box = (await riskTrack.boundingBox())!
    await page.mouse.move(Math.min(box.x + box.width / 2, 1000), box.y + 4)
    return page.locator('.gantt-tip').count()
  }).toBe(1)
  await expect(page.locator('.gantt-tip')).toContainText('整体计划')
  await expect(page.getByRole('tooltip').filter({ hasText: `${prefix}-0` })).not.toContainText('整体进度')
  await expect(page.locator('.original-marker')).toHaveCount(1)
  await page.screenshot({ path: resolve('../output/phase8-gantt-risk-progress.png'), fullPage: true })
  await page.getByRole('button', { name: '下一月', exact: true }).click()
  await expect(page.getByText('20 个项目', { exact: true })).toBeVisible()
  for (const width of [1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 1000 })
    const frozen = page.locator('.project-cell').first()
    const before = await frozen.boundingBox()
    await page.locator('.gantt-scroll').evaluate(node => { node.scrollLeft = 180 })
    const after = await frozen.boundingBox()
    expect(Math.abs(before!.x - after!.x)).toBeLessThan(2)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    await page.screenshot({ path: resolve(`../output/phase8-gantt-${width}.png`), fullPage: true })
    await page.locator('.gantt-scroll').evaluate(node => { node.scrollLeft = 0 })
  }
  const start = Date.now()
  const gantt = await page.request.get(
    `/api/gantt?month=${month}&department=${encodeURIComponent('看板验收部')}`
  )
  expect(gantt.ok()).toBeTruthy()
  expect((await gantt.json()).data).toHaveLength(21)
  console.log(
    `Phase8 本地样本：最大创建反馈 ${Math.max(...timings)}ms；甘特查询 ${Date.now() - start}ms`
  )
  expect(Math.max(...timings)).toBeLessThan(1000)
  expect(Date.now() - start).toBeLessThan(2000)
  await page.goto('/#/my-demands')
  await select(page, '完成情况', '延期完成')
  await expect(page.getByText('没有符合筛选条件的需求', { exact: true })).toBeVisible()
  await expect(page.getByText('当前范围暂无需求', { exact: true })).toHaveCount(2)
  expect(apiPaths.some((url) => /mock|prototype/.test(new URL(url).pathname))).toBe(false)
  expect(apiPaths.some((url) => url.includes('/api/workload?'))).toBe(true)
  expect(apiPaths.some((url) => url.includes('/api/demand-statistics?'))).toBe(true)
})

test('名单原位添加移除、最后管理员保护与自撤权刷新', async ({ page }) => {
  await login(page)
  await page.getByRole('button', { name: '管理人员名单', exact: true }).click()
  const row = (name: string) => page.getByRole('row').filter({ hasText: name })
  await row('陈立峰').getByRole('button', { name: '移除权限' }).click()
  await page.getByRole('button', { name: '确认移除', exact: true }).click()
  await expect(page.getByText(/至少保留一名/).last()).toBeVisible()
  await page.getByRole('button', { name: '添加管理人员', exact: true }).click()
  await select(page, '组织成员', '赵清越 · 信息技术部')
  await page.getByRole('button', { name: '确认添加', exact: true }).click()
  await expect(row('赵清越')).toBeVisible()
  await page.request.post('/api/auth/logout', { headers })
  await login(page, 'user-engineer-zhao')
  await page.getByRole('button', { name: '管理人员名单', exact: true }).click()
  await row('赵清越').getByRole('button', { name: '移除权限' }).click()
  await page.getByRole('button', { name: '确认移除', exact: true }).click()
  await expect(page.getByRole('button', { name: '当前用户' })).toContainText('IT工程师')
  await expect(page.getByRole('button', { name: '管理人员名单', exact: true })).toHaveCount(0)
  const me = await page.request.get('/api/me')
  expect((await me.json()).data.role).toBe('ENGINEER')
})
