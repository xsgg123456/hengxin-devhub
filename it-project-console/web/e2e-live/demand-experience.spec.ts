import { expect, test } from '@playwright/test'
import type { PrototypeSnapshot } from '../src/domain/prototype'

test('真实API优化创建：等待锁定、校验失败改选、丢失响应重试不重复建单', async ({ page }) => {
  test.setTimeout(120000)
  const headers = { origin: 'http://127.0.0.1:4325' }
  const login = async (userId: string) => {
    const r = await page.request.post('/api/auth/dev-login', { headers, data: { userId } })
    expect(r.ok()).toBe(true)
  }
  const workspace = async (): Promise<PrototypeSnapshot> => {
    const r = await page.request.get('/api/workspace')
    expect(r.ok()).toBe(true)
    return (await r.json()).data
  }
  await login('user-manager-chen')
  const proposal = await page.request.post('/api/projects', { headers, data: {
    requestId: crypto.randomUUID(), name: '第二个原项目', department: '测试部', priority: 'P2',
    primaryOwnerId: 'user-engineer-wang', collaboratorIds: [], approvedLaunchDate: '2099-10-20'
  } })
  expect(proposal.ok(), await proposal.text()).toBe(true)
  const proposed = (await proposal.json()).data
  await login('user-engineer-wang')
  const accepted = await page.request.post(`/api/project-proposals/${proposed.id}/confirm`, {
    headers, data: { requestId: crypto.randomUUID(), version: proposed.version, decision: 'accept' }
  })
  expect(accepted.ok(), await accepted.text()).toBe(true)
  await login('user-manager-chen')
  const initial = await workspace()
  const parents = initial.database.projects.filter(p => p.status === 'active' && !p.parentProjectId).slice(0, 2)
  expect(parents).toHaveLength(2)
  for (const parent of parents) {
    const r = await page.request.post(`/api/projects/${parent.id}/historical-delivery`, {
      headers, data: { requestId: crypto.randomUUID(), version: parent.version, deliveredOn: '2026-09-11', reason: '隔离测试原项目' }
    })
    expect(r.ok(), await r.text()).toBe(true)
  }
  await login('user-business-li')
  const before = await workspace()
  await page.goto('/#/my-demands')
  await page.getByRole('button', { name: '提交优化需求', exact: true }).click()
  const editor = page.getByRole('dialog', { name: '优化需求', exact: true })
  const choose = async (name: string) => {
    await editor.getByRole('combobox', { name: '关联原项目', exact: true }).fill(name)
    await page.getByRole('option').filter({ hasText: name }).click()
  }
  await choose(parents[0].name.replace(/^【迁移待核实】\s*/, ''))
  await editor.getByLabel('优化标题', { exact: true }).fill('真实草稿重试与改选')
  let release!: () => void
  const delayed = new Promise<void>(resolve => { release = resolve })
  await page.route('**/api/demands', async route => {
    await delayed
    await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { message: '只能关联已完成的主项目' } }) })
  })
  const rejection = page.waitForResponse(r => r.url().endsWith('/api/demands') && r.status() === 400)
  await editor.getByRole('button', { name: '保存草稿', exact: true }).click()
  await expect(editor.getByRole('combobox', { name: '关联原项目', exact: true })).toHaveCount(0)
  await expect(editor.getByRole('button', { name: '保存草稿', exact: true })).toBeDisabled()
  release()
  await rejection
  await expect(editor.getByRole('alert')).toContainText('只能关联已完成')
  await page.unroute('**/api/demands')
  await choose(parents[1].name.replace(/^【迁移待核实】\s*/, ''))
  const requests: Array<{ requestId: string; parentProjectId: string }> = []
  await page.route('**/api/demands', async route => {
    requests.push(route.request().postDataJSON())
    const response = await route.fetch()
    expect(response.ok()).toBe(true)
    if (requests.length === 1) await route.abort('connectionfailed')
    else await route.fulfill({ response })
  })
  await editor.getByRole('button', { name: '保存草稿', exact: true }).click()
  await expect(editor.getByRole('alert')).toContainText('网络请求失败')
  await expect(editor.getByRole('combobox', { name: '关联原项目', exact: true })).toHaveCount(0)
  await expect(editor).toContainText('草稿创建结果待确认')
  await editor.getByRole('button', { name: '保存草稿', exact: true }).click()
  await expect(editor).not.toBeVisible()
  expect(requests).toHaveLength(2)
  expect(requests[1]).toEqual(requests[0])
  expect(requests[0].parentProjectId).toBe(parents[1].id)
  const after = await workspace()
  expect(after.database.demands.length).toBe(before.database.demands.length + 1)
  expect(after.database.demands.find(d => d.name === '真实草稿重试与改选')).toMatchObject({ status: 'draft', parentProjectId: parents[1].id })
})
