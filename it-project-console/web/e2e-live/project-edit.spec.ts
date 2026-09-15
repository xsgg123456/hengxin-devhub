import { expect, test, type Page } from '@playwright/test'
import type { PrototypeSnapshot } from '../src/domain/prototype'
import { date } from '../e2e/review-helpers'
const origin = 'http://127.0.0.1:4325'
async function workspace(page: Page): Promise<PrototypeSnapshot> {
  const response = await page.request.get('/api/workspace')
  expect(response.ok(), await response.text()).toBeTruthy()
  return (await response.json()).data
}
async function login(page: Page, userId: string) {
  let response = await page.request.post('/api/auth/dev-login', { headers: { origin }, data: { userId } })
  if (response.status() === 429) {
    const seconds = Number(response.headers()['retry-after'])
    expect(seconds).toBeGreaterThan(0)
    expect(seconds).toBeLessThanOrEqual(60)
    await page.waitForTimeout(seconds * 1000 + 100)
    response = await page.request.post('/api/auth/dev-login', { headers: { origin }, data: { userId } })
  }
  expect(response.ok(), await response.text()).toBeTruthy()
}
test('正式完整编辑持久化、需求日期同步、中文审计和工程师入口权限', async ({ page }) => {
  test.setTimeout(150000)
  await login(page, 'user-manager-chen')
  const before = await workspace(page)
  const project = before.database.projects.find(p => p.demandId && p.migrationVerified && p.status === 'active' && !p.archived)!
  expect(project).toBeTruthy()
  const description = '正式完整编辑浏览器验证'
  await page.goto('/#/project-overview?projectId=' + project.id)
  const detail = page.getByRole('dialog', { name: '项目详情', exact: true })
  await detail.getByRole('button', { name: '编辑项目', exact: true }).click()
  const editor = page.getByRole('dialog', { name: '编辑项目', exact: true })
  await expect(editor).not.toContainText('交互预览')
  await date(editor, '需求首次提出日期', '2026-07-15')
  await editor.getByLabel('项目描述', { exact: true }).fill(description)
  await editor.getByRole('button', { name: '保存修改', exact: true }).click()
  const confirmation = page.getByRole('dialog', { name: '确认本次修改', exact: true })
  await confirmation.getByLabel('修改原因').fill('按原始需求记录核对首次提出日期')
  const saved = page.waitForResponse(response => new URL(response.url()).pathname === '/api/projects/' + project.id + '/edit' && response.request().method() === 'POST')
  await confirmation.getByRole('button', { name: '确认保存', exact: true }).click()
  const response = await saved
  expect(response.ok(), await response.text()).toBeTruthy()
  await expect(editor).not.toBeVisible()
  const after = await workspace(page)
  expect(after.database.projects.find(p => p.id === project.id)).toMatchObject({ firstRequestedOn: '2026-07-15', description })
  expect(after.database.demands.find(d => d.id === project.demandId)?.firstRequestedOn).toBe('2026-07-15')
  await page.reload()
  await expect(detail).toContainText('需求首次提出日期：2026-07-15')
  await expect(detail).toContainText('编辑资料')
  await detail.getByRole('button', { name: '编辑项目', exact: true }).click()
  await expect(editor.getByLabel('项目描述', { exact: true })).toHaveValue(description)
  await editor.getByRole('button', { name: '取消', exact: true }).click()
  await detail.getByRole('button', { name: '关闭', exact: true }).click()
  const engineer = before.database.users.find(u => u.role === 'engineer' && u.id !== project.primaryOwnerId)!
  expect(engineer).toBeTruthy()
  await login(page, engineer.id)
  await page.goto('/#/project-overview?projectId=' + project.id)
  await page.reload()
  await expect(detail).toBeVisible()
  await expect(detail.getByRole('button', { name: '编辑项目', exact: true })).toHaveCount(0)
})

test('正式迁移项目仅主责可核实，核实后完整编辑入口收回', async ({ page }) => {
  await login(page, 'user-engineer-wang')
  const before = await workspace(page)
  const project = before.database.projects.find(p => p.migrationVerified === false)!
  expect(project).toBeTruthy()
  await page.goto('/#/project-overview?projectId=' + project.id)
  const detail = page.getByRole('dialog', { name: '项目详情', exact: true })
  await detail.getByRole('button', { name: '编辑项目', exact: true }).click()
  const editor = page.getByRole('dialog', { name: '编辑项目', exact: true })
  await expect(editor).toContainText('主负责工程师可整理本项目')
  await date(editor, '需求首次提出日期', '2024-01-15')
  await editor.getByRole('button', { name: '保存并完成核实', exact: true }).click()
  const confirmation = page.getByRole('dialog', { name: '确认本次修改', exact: true })
  await expect(confirmation).toContainText('不再拥有此项目的完整编辑权限')
  await confirmation.getByLabel('修改原因').fill('工程师按业务原始记录核实')
  await confirmation.getByRole('button', { name: '确认保存', exact: true }).click()
  await expect(editor).not.toBeVisible()
  expect((await workspace(page)).database.projects.find(p => p.id === project.id)?.migrationVerified).toBe(true)
  await page.reload()
  await expect(detail).toBeVisible()
  await expect(detail.getByRole('button', { name: '编辑项目', exact: true })).toHaveCount(0)
})

test('正式历史交付补录保存实际日期，刷新保留历史完成状态', async ({ page }) => {
  test.setTimeout(90000)
  await login(page, 'user-manager-chen')
  const before = await workspace(page)
  const project = before.database.projects.find(p => p.name === '正常项目完整编辑测试')!
  expect(project).toBeTruthy()
  await page.goto('/#/project-overview?projectId=' + project.id)
  const detail = page.getByRole('dialog', {name:'项目详情',exact:true})
  await detail.getByRole('button', {name:'编辑项目',exact:true}).click()
  const editor = page.getByRole('dialog', {name:'编辑项目',exact:true})
  await editor.getByRole('button', {name:'登记历史已交付',exact:true}).click()
  const historical = page.getByRole('dialog', {name:'登记历史已交付',exact:true})
  await date(historical, '实际交付日期', '2026-08-01')
  await historical.getByLabel('补录原因', {exact:true}).fill('核对历史交付凭据后补录')
  const saved = page.waitForResponse(r=>new URL(r.url()).pathname===`/api/projects/${project.id}/historical-delivery`&&r.request().method()==='POST')
  await historical.getByRole('button', {name:'确认登记',exact:true}).click()
  const response = await saved
  expect(response.ok(), await response.text()).toBeTruthy()
  await expect(editor).not.toBeVisible()
  await page.reload()
  await expect(detail).toContainText('历史完成 / 无业务验收记录')
  await expect(detail).toContainText('登记历史已交付')
  const changed=(await workspace(page)).database.projects.find(p=>p.id===project.id)!
  expect(changed).toMatchObject({status:'completed',migrationVerified:true,actualCompletedAt:'2026-08-01T00:00:00.000Z'})
})
