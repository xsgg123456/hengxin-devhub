import { expect, test, type Page } from '@playwright/test'
import type { PrototypeSnapshot } from '../src/domain/prototype'
import { acceptanceDetail, acceptanceIdentity, assignAcceptance, openAcceptance } from '../e2e/business-acceptance-helpers'
import { date, select } from '../e2e/review-helpers'

const origin = 'http://127.0.0.1:4325'
async function workspace(page: Page): Promise<PrototypeSnapshot> {
  const response = await page.request.get('/api/workspace')
  expect(response.ok()).toBeTruthy()
  return (await response.json()).data
}
async function post(page: Page, path: string, data: Record<string, unknown>) {
  return page.request.post('/api' + path, { headers: { origin }, data: { requestId: crypto.randomUUID(), ...data } })
}
async function fixture(page: Page) {
  // Only the existing isolated browser runner can load this suite; no production identities or data.
  const created = await post(page, '/projects', { name: `业务验收闭环-${Date.now()}`, department: '财务部',
    priority: 'P1', primaryOwnerId: 'user-engineer-wang', collaboratorIds: ['user-engineer-zhao'], approvedLaunchDate: '2099-10-10' })
  expect(created.ok(), await created.text()).toBeTruthy()
  const proposal = (await created.json()).data
  await acceptanceIdentity(page, '王浩然', true)
  const accepted = await post(page, `/project-proposals/${proposal.id}/confirm`, { version: 1, decision: 'accept' })
  expect(accepted.ok(), await accepted.text()).toBeTruthy()
  const id: string = (await accepted.json()).data.projectId
  const stages = ['方案设计', '开发编码', '联调测试', '上线部署', '验收交付']
  const planned = await post(page, `/projects/${id}/plan`, { version: 1,
    plans: stages.map(stage => ({ stage, startDate: '2099-10-10', endDate: '2099-10-10' })) })
  expect(planned.ok(), await planned.text()).toBeTruthy()
  for (let index = 0; index < 4; index++) {
    const progressed = await post(page, `/projects/${id}/progress`, { version: index + 2, kind: 'overall', status: 'completed' })
    expect(progressed.ok(), await progressed.text()).toBeTruthy()
  }
  return id
}
test('真实业务验收：管理指定、工程师提交撤回重提、业务退回整改后通过、刷新持久化', async ({ page }) => {
  test.setTimeout(150_000)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/')
  await page.getByRole('button', { name: /陈立峰 ·/ }).click()
  await expect(page.getByRole('button', { name: '当前用户' })).toContainText('陈立峰')
  await expect(page).toHaveURL(/#\/project-overview$/)
  const id = await fixture(page)
  await page.reload()
  await expect(page.getByRole('button', { name: '当前用户' })).toContainText('王浩然')
  await openAcceptance(page, id)
  await expect(acceptanceDetail(page)).toContainText('待指定')
  const before = (await workspace(page)).database.projects.find(p => p.id === id)!
  const bypass = await post(page, `/projects/${id}/progress`, { version: before.version, kind: 'overall', status: 'completed' })
  expect([400, 403, 409]).toContain(bypass.status())
  await assignAcceptance(page, id, true)
  await expect(acceptanceDetail(page).getByRole('button', { name: '验收通过', exact: true })).toHaveCount(0)
  await acceptanceIdentity(page, '王浩然', true)
  await openAcceptance(page, id)
  const detail = acceptanceDetail(page)
  await detail.getByRole('button', { name: '提交验收', exact: true }).click()
  await expect(detail).toContainText('交付说明')
  expect((await workspace(page)).database.projects.find(p => p.id === id)?.acceptanceStatus).toBe('none')
  await detail.getByLabel('交付说明', { exact: true }).fill('第一轮交付：请检查导出与查询功能')
  await detail.getByLabel('交付访问链接（选填）', { exact: true }).fill('https://example.com/acceptance')
  await detail.getByRole('button', { name: '调整计划', exact: true }).click()
  const plan = page.getByRole('dialog', { name: '调整项目计划', exact: true })
  await date(plan, '验收交付计划结束日期', '2099-10-11')
  await select(page, plan, '日期调整原因', '等待外部资源')
  await plan.getByLabel('日期调整说明', { exact: true }).fill('调整业务验收安排')
  await plan.getByRole('button', { name: '保存计划', exact: true }).click()
  await expect(plan).not.toBeVisible()
  await expect(detail.getByLabel('交付说明', { exact: true })).toHaveValue('第一轮交付：请检查导出与查询功能')
  await expect(detail.getByRole('button', { name: '提交验收', exact: true })).toBeDisabled()
  await detail.getByRole('button', { name: '保留草稿并确认最新版本', exact: true }).click()
  await expect(detail.getByRole('button', { name: '提交验收', exact: true })).toBeEnabled()
  await page.route(`**/api/projects/${id}/acceptance`, async route => {
    const committed = await route.fetch()
    expect(committed.ok(), await committed.text()).toBeTruthy()
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({
      error: { code: 'UNAVAILABLE', message: '验收保存暂不可用，请重试' }
    }) })
  }, { times: 1 })
  await detail.getByRole('button', { name: '提交验收', exact: true }).click()
  await expect(detail).toContainText('验收保存暂不可用')
  await expect(detail.getByLabel('交付说明', { exact: true })).toHaveValue('第一轮交付：请检查导出与查询功能')
  expect((await workspace(page)).database.projects.find(p => p.id === id)?.acceptanceStatus).toBe('pending')
  await detail.getByRole('button', { name: '提交验收', exact: true }).click()
  await expect(detail).toContainText('待业务验收')
  await expect(detail.getByRole('button', { name: '验收通过', exact: true })).toHaveCount(0)
  await detail.getByLabel('撤回原因', { exact: true }).fill('补充验证说明后重新提交')
  await detail.getByRole('button', { name: '撤回验收', exact: true }).click()
  await expect(page.locator('.el-message-box')).toContainText(before.name)
  await page.locator('.el-message-box').getByRole('button', { name: '继续验收', exact: true }).click()
  await expect(detail.getByLabel('撤回原因', { exact: true })).toHaveValue('补充验证说明后重新提交')
  expect((await workspace(page)).database.projects.find(p => p.id === id)?.acceptanceStatus).toBe('pending')
  await detail.getByRole('button', { name: '撤回验收', exact: true }).click()
  await page.getByRole('button', { name: '确认撤回验收', exact: true }).click()
  await expect(detail.getByRole('button', { name: '提交验收', exact: true })).toBeVisible()
  await detail.getByLabel('交付说明', { exact: true }).fill('第二轮交付：补充验证说明')
  await detail.getByRole('button', { name: '提交验收', exact: true }).click()
  await expect(detail).toContainText('待业务验收')
  await acceptanceIdentity(page, '李思敏', true)
  const project = (await workspace(page)).database.projects.find(p => p.id === id)!
  await page.goto('/#/today-tasks')
  await expect(page.getByRole('heading', { name: '我的待办', exact: true })).toBeVisible()
  await page.locator('.task-row').filter({ hasText: project.name }).getByRole('button', { name: '验收确认', exact: true }).click()
  await expect(detail).toContainText('第二轮交付：补充验证说明')
  await detail.getByRole('button', { name: '退回整改', exact: true }).click()
  expect((await workspace(page)).database.projects.find(p => p.id === id)?.acceptanceStatus).toBe('pending')
  await detail.getByLabel('验收意见', { exact: true }).fill('导出金额小数位错误，请修复')
  await detail.getByRole('button', { name: '退回整改', exact: true }).click()
  await expect(detail.getByRole('button', { name: '退回整改', exact: true })).toHaveCount(0)
  await expect(detail).toContainText('退回整改')
  await acceptanceIdentity(page, '王浩然', true)
  await openAcceptance(page, id)
  await expect(detail).toContainText('导出金额小数位错误，请修复')
  await detail.getByLabel('交付说明', { exact: true }).fill('第三轮交付：导出精度修复并验证')
  await detail.getByRole('button', { name: '提交验收', exact: true }).click()
  await expect(detail).toContainText('待业务验收')
  await acceptanceIdentity(page, '李思敏', true)
  await openAcceptance(page, id)
  await detail.getByRole('button', { name: '验收通过', exact: true }).scrollIntoViewIfNeeded()
  await detail.screenshot({ path: '../../output/playwright/business-acceptance/business-pending.png' })
  await detail.getByLabel('验收意见', { exact: true }).fill('已按业务需求验证通过')
  await detail.getByRole('button', { name: '验收通过', exact: true }).click()
  await expect(detail.getByRole('button', { name: '验收通过', exact: true })).toHaveCount(0)
  await page.reload()
  await expect(detail).toContainText('已按业务需求验证通过')
  const saved = (await workspace(page)).database.projects.find(p => p.id === id)!
  expect(saved).toMatchObject({ status: 'completed', archived: false, acceptanceStatus: 'accepted', acceptanceRound: 3 })
  expect(saved.actualCompletedAt).toBeTruthy()
  expect(saved.acceptanceHistory?.map(h => h.action)).toEqual(['assign', 'submit', 'withdraw', 'submit', 'return', 'submit', 'accept'])
  await detail.screenshot({ path: '../../output/playwright/business-acceptance/business-completed.png' })
})
