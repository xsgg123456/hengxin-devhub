import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { expect, test, type Locator, type Page } from '@playwright/test'
import type { PrototypeSnapshot } from '../src/domain/prototype'
const detail = (page: Page) => page.getByRole('dialog', { name: '项目详情', exact: true })
async function read(page: Page): Promise<PrototypeSnapshot> {
  const response = await page.request.get('/api/workspace')
  expect(response.ok()).toBeTruthy()
  return (await response.json()).data
}
async function date(drawer: Locator, label: string, value: string) {
  await drawer.getByLabel(label, { exact: true }).fill(value)
  await drawer.getByLabel(label, { exact: true }).press('Tab')
}
async function select(page: Page, drawer: Locator, label: string, value: string) {
  await drawer
    .locator('.el-select')
    .filter({ has: page.getByRole('combobox', { name: label, exact: true }) })
    .click()
  const listId = await drawer.getByRole('combobox', { name: label, exact: true }).getAttribute('aria-controls')
  expect(listId).toBeTruthy()
  await page.locator(`[id="${listId}"]`).getByRole('option', { name: value, exact: true }).click()
}
async function switchUser(page: Page, name: string) {
  await page.getByRole('button', { name: '当前用户' }).click()
  await page.getByRole('button', { name: new RegExp(name + ' ·') }).click()
  await expect(page.getByRole('button', { name: '当前用户' })).toContainText(name)
}
async function open(page: Page, id: string) {
  await page.goto(`/#/project-overview?projectId=${id}`)
  await expect(detail(page)).toBeVisible()
}
async function edit(page: Page) {
  await detail(page).getByRole('button', { name: '更新进度', exact: true }).click()
  return page.getByRole('dialog', { name: '更新项目进度', exact: true })
}
test('真实整体更新与协作隔离→风险与历史→100%显式归档→管理重开', async ({ page }) => {
  test.setTimeout(150_000)
  await mkdir(resolve('../output'), { recursive: true })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/')
  await page.getByRole('button', { name: /陈立峰 ·/ }).click()
  await page.getByRole('button', { name: '直接创建项目', exact: true }).click()
  const name = `真实进度验收-${Date.now()}`
  let drawer = page.getByRole('dialog', { name: '直接创建项目', exact: true })
  await drawer.getByLabel('项目名称', { exact: true }).fill(name)
  await drawer.getByLabel('需求部门', { exact: true }).fill('财务部')
  await select(page, drawer, '主负责人', '王浩然')
  await select(page, drawer, '协作人员', '赵清越')
  await drawer.getByLabel('需求部门', { exact: true }).click()
  await date(drawer, '最初计划上线日期', '2099-11-01')
  await date(drawer, '最初计划交付日期', '2099-12-01')
  await date(drawer, '方案设计预计完成日期', '2099-10-01')
  await drawer.getByRole('button', { name: '创建项目', exact: true }).click()
  await expect(drawer).not.toBeVisible()
  const created = (await read(page)).database.projects.find((p) => p.name === name)!
  expect(created.demandId).toBeNull()
  await detail(page).getByRole('button', { name: '关闭', exact: true }).click()
  await switchUser(page, '王浩然')
  await open(page, created.id)
  drawer = await edit(page)
  await drawer.getByLabel('整体进度（%）', { exact: true }).fill('100')
  await drawer.getByLabel('进展说明', { exact: true }).fill('接口整体已完成，验收仍需显式关闭')
  await date(drawer, '当前阶段预计完成日期', '2020-01-01')
  await date(drawer, '当前预计交付日期', '2020-02-01')
  await select(page, drawer, '日期调整原因', '业务新增或变更需求')
  await drawer.getByLabel('日期调整说明', { exact: true }).fill('真实日期调整保留最初承诺')
  await drawer.getByRole('button', { name: '保存进度', exact: true }).click()
  await expect(drawer).not.toBeVisible()
  await expect(detail(page)).toContainText('环节延期')
  await expect(detail(page)).toContainText('项目延期')
  await expect(detail(page)).toContainText('真实日期调整保留最初承诺')
  let snapshot = await read(page)
  const overall = snapshot.database.projects.find((p) => p.id === created.id)!
  expect(overall).toMatchObject({
    status: 'active',
    archived: false,
    overallProgress: 100,
    originalDeliveryDate: '2099-12-01'
  })
  await page.screenshot({
    path: resolve('../output/phase7-live-progress-risk.png'),
    fullPage: true
  })
  await detail(page).getByRole('button', { name: '关闭', exact: true }).click()
  await switchUser(page, '赵清越')
  await open(page, created.id)
  await detail(page).getByRole('button', { name: '填写协作进展', exact: true }).click()
  drawer = page.getByRole('dialog', { name: '填写协作进展', exact: true })
  await expect(drawer.getByLabel('整体进度（%）')).toHaveCount(0)
  await drawer.getByLabel('进展说明', { exact: true }).fill('协作接口测试通过')
  await drawer.getByRole('button', { name: '保存进度', exact: true }).click()
  await expect(drawer).not.toBeVisible()
  snapshot = await read(page)
  expect(snapshot.database.projects.find((p) => p.id === created.id)?.lastOverallUpdatedAt).toBe(
    overall.lastOverallUpdatedAt
  )
  await detail(page).getByRole('button', { name: '关闭', exact: true }).click()
  await switchUser(page, '李思敏')
  await open(page, created.id)
  await expect(detail(page)).toContainText('协作接口测试通过')
  await expect(
    detail(page).getByRole('button', { name: /更新进度|填写协作进展|管理纠正|取消项目/ })
  ).toHaveCount(0)
  await detail(page).getByRole('button', { name: '关闭', exact: true }).click()
  await switchUser(page, '王浩然')
  await open(page, created.id)
  for (const stage of ['方案设计', '开发编码', '联调测试', '上线部署', '验收交付']) {
    drawer = await edit(page)
    await select(page, drawer, '当前阶段状态', '已完成')
    if (stage !== '验收交付') await date(drawer, '下一阶段预计完成日期', '2099-10-01')
    await drawer.getByLabel('进展说明', { exact: true }).fill(`${stage}真实完成记录`)
    await drawer.getByRole('button', { name: '保存进度', exact: true }).click()
    await expect(drawer).not.toBeVisible()
  }
  await detail(page).getByRole('button', { name: '完成并归档', exact: true }).click()
  await expect(page.locator('.el-message-box__message')).toContainText(name)
  await page.getByRole('button', { name: '确认完成并归档', exact: true }).click()
  await expect(detail(page)).toContainText('已完成 · 已归档')
  await page.reload()
  await expect(detail(page)).toContainText('验收交付真实完成记录')
  snapshot = await read(page)
  expect(snapshot.database.projects.find((p) => p.id === created.id)).toMatchObject({
    status: 'completed',
    archived: true
  })
  const updateCount = snapshot.database.progressUpdates.filter(
    (p) => p.projectId === created.id
  ).length
  await page.screenshot({ path: resolve('../output/phase7-live-completed.png'), fullPage: true })
  await detail(page).getByRole('button', { name: '关闭', exact: true }).click()
  await switchUser(page, '陈立峰')
  await open(page, created.id)
  await expect(detail(page).getByRole('button', { name: '删除误建项目' })).toHaveCount(0)
  await detail(page).getByRole('button', { name: '重新打开', exact: true }).click()
  await expect(page.locator('.el-message-box__message')).toContainText(name)
  await page.getByRole('button', { name: '确认重新打开', exact: true }).click()
  await expect(detail(page).getByRole('button', { name: '更新进度', exact: true })).toBeVisible()
  snapshot = await read(page)
  expect(snapshot.database.projects.find((p) => p.id === created.id)).toMatchObject({
    status: 'active',
    archived: false
  })
  expect(snapshot.database.progressUpdates.filter((p) => p.projectId === created.id)).toHaveLength(
    updateCount
  )
  expect(
    snapshot.database.lifecycleEvents.filter((e) => e.entityId === created.id).map((e) => e.action)
  ).toEqual(expect.arrayContaining(['complete', 'reopen']))
  await expect(detail(page)).toContainText('真实日期调整保留最初承诺')
  await page.screenshot({ path: resolve('../output/phase7-live-reopened.png'), fullPage: true })
})
