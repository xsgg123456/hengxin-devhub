import { expect, test, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import type { PrototypeSnapshot } from '../src/domain/prototype'
import { date, select } from '../e2e/review-helpers'
import { acceptanceDetail, openAcceptance } from '../e2e/business-acceptance-helpers'

const origin = 'http://127.0.0.1:4325'
async function workspace(page: Page): Promise<PrototypeSnapshot> {
  const response = await page.request.get('/api/workspace')
  expect(response.ok()).toBeTruthy()
  return (await response.json()).data
}
async function login(page: Page, name: string) {
  await page.goto('/')
  await page.getByRole('button', { name: new RegExp(name + ' ·') }).click()
  await expect(page.getByRole('button', { name: '当前用户' })).toContainText(name)
}
async function post(page: Page, path: string, data: Record<string, unknown>) {
  const response = await page.request.post('/api' + path, {
    headers: { origin }, data: { requestId: crypto.randomUUID(), ...data }
  })
  expect(response.ok(), await response.text()).toBeTruthy()
  return (await response.json()).data
}

test('双账号自动同步、中文校验、保留筛选和旧编辑版本，SSE断开后轻量检查补同步', async ({ page: manager, browser }) => {
  test.setTimeout(150_000)
  await mkdir('../output/playwright/workspace-sync', { recursive: true })
  const businessContext = await browser.newContext({ baseURL: origin, viewport: { width: 1440, height: 1000 } })
  const secondContext = await browser.newContext({ baseURL: origin, viewport: { width: 1440, height: 1000 } })
  const business = await businessContext.newPage()
  const second = await secondContext.newPage()
  try {
    await manager.setViewportSize({ width: 1440, height: 1000 })
    await login(manager, '陈立峰')
    const initial = await workspace(manager)
    const parent = initial.database.projects.find(project => project.status === 'active' && !project.parentProjectId)!
    await post(manager, `/projects/${parent.id}/historical-delivery`, {
      version: parent.version, deliveredOn: '2026-09-11', reason: '隔离同步验收父项目'
    })
    await manager.goto('/#/my-demands')
    await manager.getByRole('radio', { name: '全部需求', exact: true }).check()
    await select(manager, manager.locator('main'), '需求类型', '优化需求')
    const managerRows = manager.locator('.el-table__body tr')
    await expect(managerRows).toHaveCount(0)
    const table = await manager.locator('.el-table').elementHandle()

    await login(business, '李思敏')
    await business.getByRole('button', { name: '提交正式项目需求', exact: true }).click()
    const ordinary = business.getByRole('dialog', { name: '提交正式项目需求', exact: true })
    await ordinary.getByLabel('项目名称', { exact: true }).focus()
    await ordinary.getByLabel('这次要解决什么问题（一句话）', { exact: true }).focus()
    await expect(ordinary).toContainText('请填写项目名称')
    await ordinary.getByLabel('项目名称', { exact: true }).focus()
    await expect(ordinary).toContainText('请说明要解决的问题')
    await expect(ordinary).not.toContainText(/name is required|description is required/)
    await ordinary.getByRole('button', { name: '取消', exact: true }).click()
    await expect(ordinary).not.toBeVisible()
    await openAcceptance(business, parent.id)
    await acceptanceDetail(business).getByRole('button', { name: '提优化需求', exact: true }).click()
    const editor = business.getByRole('dialog', { name: '优化需求', exact: true })
    const title = editor.getByLabel('优化标题', { exact: true })
    const description = editor.getByLabel('当前问题', { exact: true })
    await title.focus()
    await description.focus()
    await expect(editor).toContainText('请填写优化标题')
    await editor.getByLabel('期望效果 / 验收标准', { exact: true }).focus()
    await expect(editor).toContainText('请说明要解决的问题')
    await expect(editor).not.toContainText(/name is required|description is required/)
    const name = `同步优化需求-${Date.now()}`
    await title.fill(name)
    await description.fill('减少人工整理时间')
    await editor.getByLabel('期望效果 / 验收标准', { exact: true }).fill('自动生成完整清单')
    await date(editor, '期望上线日期', '2099-10-20')
    const submitted = business.waitForResponse(response => response.request().method() === 'PATCH' && /\/api\/demands\//.test(response.url()))
    await editor.getByRole('button', { name: '提交评估', exact: true }).click()
    expect((await submitted).ok()).toBeTruthy()
    await expect(managerRows.filter({ hasText: name })).toHaveCount(1, { timeout: 4000 })
    await expect(manager.getByText('共 1 条', { exact: true })).toBeVisible()
    expect(await table!.evaluate(element => element.isConnected)).toBe(true)
    await expect(manager.locator('.el-select').filter({ hasText: '优化需求' })).toHaveCount(1)
    await manager.screenshot({ path: '../output/playwright/workspace-sync/manager-auto-update.png', fullPage: true })

    // A separate same-user session changes this demand while the original form is dirty.
    await business.goto('/#/my-demands')
    await business.locator('.el-table__body tr').filter({ hasText: name }).getByRole('button', { name: '编辑', exact: true }).click()
    const editing = business.getByRole('dialog', { name: '优化需求', exact: true })
    const unsaved = name + '-本地未保存'
    await editing.getByLabel('优化标题', { exact: true }).fill(unsaved)
    await login(second, '李思敏')
    const demand = (await workspace(second)).database.demands.find(item => item.name === name)!
    const serverName = name + '-服务器更新'
    const changed = await second.request.patch(`/api/demands/${demand.id}`, {
      headers: { origin }, data: {
        requestId: crypto.randomUUID(), version: demand.version, name: serverName,
        description: '另一会话更新描述', parentProjectId: parent.id,
        optimizationOutcome: '自动生成完整清单', expectedLaunchDate: '2099-10-20',
        attachmentIds: [], prd: null, prototype: null, submit: false
      }
    })
    expect(changed.ok(), await changed.text()).toBeTruthy()
    await expect(editing).toContainText('该需求已被更新', { timeout: 4000 })
    await expect(editing.getByLabel('优化标题', { exact: true })).toHaveValue(unsaved)
    await editing.getByRole('button', { name: '保存修改', exact: true }).click()
    await expect(editing).toBeVisible()
    expect((await workspace(second)).database.demands.find(item => item.id === demand.id)?.name).toBe(serverName)
    await editing.screenshot({ path: '../output/playwright/workspace-sync/conflict-preserves-input.png' })

    // Disable SSE before a fresh page load so only the 30-second revision fallback can deliver this write.
    let revisionChecks = 0
    manager.on('response', response => { if (response.url().endsWith('/api/workspace/revision')) revisionChecks++ })
    await manager.route('**/api/workspace/events', route => route.abort())
    await manager.reload()
    await expect(manager.locator('.el-table__body tr').filter({ hasText: serverName })).toHaveCount(1)
    const fallbackName = `断线兜底优化-${Date.now()}`
    await post(second, '/demands', {
      name: fallbackName, description: '验证每三十秒版本兜底', parentProjectId: parent.id,
      optimizationOutcome: '断开事件流仍自动出现', expectedLaunchDate: '2099-10-20',
      attachmentIds: [], prd: null, prototype: null, submit: true
    })
    await expect.poll(() => revisionChecks, { timeout: 40_000 }).toBeGreaterThan(0)
    await expect(manager.locator('.el-table__body tr').filter({ hasText: fallbackName })).toHaveCount(1, { timeout: 4000 })
    await manager.screenshot({ path: '../output/playwright/workspace-sync/polling-fallback.png', fullPage: true })
  } finally {
    await businessContext.close()
    await secondContext.close()
  }
})
