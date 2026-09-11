import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { expect, test, type Locator, type Page } from '@playwright/test'
const row = (page: Page, name: string) => page.getByRole('row').filter({ hasText: name })
async function date(drawer: Locator, label: string, value: string) {
  await drawer.getByLabel(label, { exact: true }).fill(value)
  await drawer.getByLabel(label, { exact: true }).press('Tab')
}
async function switchUser(page: Page, name: string) {
  await page.getByRole('button', { name: '当前用户' }).click()
  await page.getByRole('button', { name: new RegExp(name + ' ·') }).click()
  await expect(page.getByRole('button', { name: '当前用户' })).toContainText(name)
}
test('真实多格式多文件失败重试→提交→跨角色立项→刷新持久与审批隔离', async ({ page }) => {
  await mkdir(resolve('../output'), { recursive: true })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/')
  await page.getByRole('button', { name: /李思敏 ·/ }).click()
  await expect(page.getByRole('button', { name: '提交正式项目需求' })).toBeVisible()
  await page.getByRole('button', { name: '提交正式项目需求' }).click()
  const name = `真实闭环验收-${Date.now()}`
  let drawer = page.getByRole('dialog', { name: '提交正式项目需求' })
  await drawer.getByLabel('项目名称', { exact: true }).fill(name)
  await drawer.getByLabel('这次要解决什么问题（一句话）').fill('真实上传预算需求并完成管理立项')
  await date(drawer, '期望上线日期', '2099-12-31')
  await page.route(/\/staging\//, route => route.abort('failed'), { times: 1 })
  await drawer.locator('input[type=file]').setInputFiles({ name: '需求.pdf', mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [] /Count 0 >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF') })
  await expect(drawer.getByRole('button', { name: '重试上传' })).toBeVisible()
  await drawer.getByRole('button', { name: '重试上传' }).click()
  await expect(drawer.getByText('已上传', { exact: true })).toBeVisible()
  await drawer.locator('input[type=file]').setInputFiles([
    { name: '原型设计.fig', mimeType: 'application/octet-stream', buffer: Buffer.from('design-file-fixture') },
    { name: '需求清单.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from('spreadsheet-fixture') }
  ])
  await expect(drawer.getByText('已上传', { exact: true })).toHaveCount(3)
  await drawer.screenshot({ path: resolve('../output/attachment-upload-preview.png') })
  await page.screenshot({ path: resolve('../output/phase6-live-submit.png'), fullPage: true })
  await drawer.getByRole('button', { name: '提交评估' }).click()
  await expect(drawer).not.toBeVisible()
  await expect(row(page, name)).toContainText('待评估')
  await expect(row(page, name).getByRole('button', { name: '评估', exact: true })).toHaveCount(0)
  await switchUser(page, '陈立峰')
  await expect(page).toHaveURL(/#\/project-overview$/)
  await page.goto('/#/my-demands')
  await row(page, name).getByRole('button', { name: '评估', exact: true }).click()
  drawer = page.getByRole('dialog', { name: `需求评估 · ${name}` })
  await expect(drawer.getByText('需求.pdf', { exact: false }).first()).toBeVisible()
  await drawer.locator('.el-select').filter({ has: page.getByRole('combobox', { name: '主负责人', exact: true }) }).click()
  await page.getByRole('option', { name: '王浩然', exact: true }).click()
  await expect(drawer.locator('.el-date-editor')).toHaveCount(0)
  await page.screenshot({ path: resolve('../output/phase6-live-review.png'), fullPage: true })
  await drawer.getByRole('button', { name: '通过并立项' }).click()
  await expect(drawer).not.toBeVisible()
  await expect(row(page, name)).toContainText('已立项')
  await switchUser(page, '王浩然')
  await expect(page).toHaveURL(/#\/my-projects$/)
  await page.goto('/#/my-projects')
  const card = page.locator('[data-project-id]').filter({ hasText: name })
  await expect(card).toContainText('方案设计')
  await page.reload()
  await expect(card).toContainText('方案设计')
  await card.scrollIntoViewIfNeeded()
  await page.screenshot({ path: resolve('../output/phase6-live-project.png'), fullPage: true })
  const workspace = await (await page.request.get('/api/workspace')).json()
  const demand = workspace.data.database.demands.find((item: { name: string }) => item.name === name)
  const saved = await (await page.request.get(`/api/demands/${demand.id}`)).json()
  expect(saved.data.attachments).toHaveLength(3)
  expect(saved.data.attachmentIds).toHaveLength(3)
  expect(saved.data.attachments[0].status).toBe('READY')
  const denied = await page.request.post(`/api/demands/${demand.id}/review`, {
    headers: { origin: 'http://127.0.0.1:4325' },
    data: { requestId: crypto.randomUUID(), version: demand.version, decision: 'return', reason: '越权测试' }
  })
  expect(denied.status()).toBe(403)
  await expect(page.getByRole('button', { name: '切换演示身份' })).toHaveCount(0)
})
