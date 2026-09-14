import { expect, test, type Page } from '@playwright/test'
import { date, select } from '../e2e/review-helpers'
import type { PrototypeDatabase } from '../src/domain/prototype'

async function database(page: Page): Promise<PrototypeDatabase> {
  const response = await page.request.get('/api/workspace')
  expect(response.ok()).toBeTruthy()
  return (await response.json()).data.database
}
async function switchUser(page: Page, name: string) {
  await page.getByRole('button', { name: '当前用户' }).click()
  await page.getByRole('button', { name: new RegExp(name + ' ·') }).click()
  await expect(page.getByRole('button', { name: '当前用户' })).toContainText(name)
  await expect(page).toHaveURL(name === '陈立峰' ? /#\/project-overview$/ : /#\/my-projects$/)
}

test('直接创建经退回改派再接单才立项，旧工程师失效且上线基准持久保存', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto('/')
  await page.getByRole('button', { name: /陈立峰 ·/ }).click()
  const name = `接单改派验收-${Date.now()}`
  await page.getByRole('button', { name: '直接创建项目', exact: true }).click()
  const create = page.getByRole('dialog', { name: '直接创建项目', exact: true })
  await create.getByLabel('项目名称', { exact: true }).fill(name)
  await create.getByLabel('需求部门', { exact: true }).fill('信息技术部')
  await select(page, create, '主负责人', '王浩然')
  await date(create, '审批确认上线日期', '2099-10-07')
  await create.getByText('P0', { exact: true }).click()
  await expect(create.getByRole('radio', { name: 'P0', exact: true })).toBeChecked()
  await create.getByRole('button', { name: '提交工程师确认', exact: true }).click()
  await expect(create).not.toBeVisible()
  let db = await database(page)
  const pending = db.projectProposals!.find((p) => p.name === name)!
  expect(pending.status).toBe('pending')
  expect(pending.demandId).toBeNull()
  expect(db.demands.some((d) => d.name === name)).toBe(false)
  expect(db.projects.some((p) => p.name === name)).toBe(false)
  const submitted = page.getByRole('dialog', { name: `接单详情 · ${name}`, exact: true })
  await expect(submitted).toBeVisible()
  await submitted.getByRole('button', { name: '取消', exact: true }).click()
  await expect(submitted).not.toBeVisible()
  await switchUser(page, '王浩然')
  await page.goto(`/#/today-tasks?proposalId=${pending.id}`)
  let drawer = page.getByRole('dialog', { name: `接单详情 · ${name}`, exact: true })
  await expect(drawer).toBeVisible()
  await drawer.getByRole('button', { name: '退回管理评估', exact: true }).click()
  await expect(drawer.getByRole('alert').filter({ hasText: '原因' })).toBeVisible()
  await drawer
    .getByRole('textbox', { name: '退回评估原因（退回时必填）', exact: true })
    .fill('当前任务较多，请调整主负责人')
  await drawer.getByRole('button', { name: '退回管理评估', exact: true }).click()
  await expect(drawer).not.toBeVisible()
  db = await database(page)
  expect(db.projectProposals!.find((p) => p.id === pending.id)?.status).toBe('returned')
  expect(db.projects.some((p) => p.name === name)).toBe(false)
  await switchUser(page, '陈立峰')
  await page.goto(`/#/today-tasks?proposalId=${pending.id}`)
  drawer = page.getByRole('dialog', { name: `接单详情 · ${name}`, exact: true })
  await expect(drawer).toContainText('当前任务较多，请调整主负责人')
  await select(page, drawer, '主负责人', '赵清越')
  await drawer.getByRole('button', { name: '提交工程师确认', exact: true }).click()
  await expect(drawer).not.toBeVisible()
  db = await database(page)
  expect(db.projectProposals!.find((p) => p.id === pending.id)).toMatchObject({
    status: 'pending',
    primaryOwnerId: 'user-engineer-zhao'
  })
  await switchUser(page, '王浩然')
  const denied = await page.request.post(`/api/project-proposals/${pending.id}/confirm`, {
    headers: { origin: 'http://127.0.0.1:4325' },
    data: { requestId: crypto.randomUUID(), version: pending.version, decision: 'accept' }
  })
  expect([403, 409]).toContain(denied.status())
  await switchUser(page, '赵清越')
  await page.goto(`/#/today-tasks?proposalId=${pending.id}`)
  drawer = page.getByRole('dialog', { name: `接单详情 · ${name}`, exact: true })
  await expect(drawer.getByLabel('审批确认上线日期', { exact: true })).toHaveValue('2099-10-07')
  await drawer.screenshot({
    path: '../../output/playwright/priority-acceptance/live-acceptance.png'
  })
  await drawer.getByRole('button', { name: '确认接单并立项', exact: true }).click()
  await expect(drawer).not.toBeVisible()
  await expect(page.getByRole('dialog', { name: '项目详情', exact: true })).toBeVisible()
  db = await database(page)
  const project = db.projects.find((p) => p.name === name)!
  expect(project.code).toMatch(/^XM-\d{4}-\d{4,}$/)
  expect(project.approvedLaunchDate).toBe('2099-10-07')
  expect(project.source).toBe('direct')
  expect(project.primaryOwnerId).toBe('user-engineer-zhao')
  expect(db.projects.filter((p) => p.name === name)).toHaveLength(1)
  await page.goto('/#/my-projects')
  await page.reload()
  const card = page.locator('[data-project-id]').filter({ hasText: name })
  await expect(card.locator('.priority-focus')).toHaveText('P0 · 重点项目')
  await card.screenshot({ path: '../../output/playwright/priority-acceptance/live-p0-card.png' })
  await card.getByRole('button', { name: '详情', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '项目详情', exact: true })).toContainText(
    '2099-10-07'
  )
})
