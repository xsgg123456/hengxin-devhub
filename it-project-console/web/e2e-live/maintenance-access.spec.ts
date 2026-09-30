import { expect, test, type Page } from '@playwright/test'
import type { PrototypeSnapshot } from '../src/domain/prototype'
import { date, select } from '../e2e/review-helpers'

async function workspace(page: Page): Promise<PrototypeSnapshot> {
  const response = await page.request.get('/api/workspace')
  expect(response.ok(), await response.text()).toBeTruthy()
  return (await response.json()).data
}

test('维护授权叠加工程师身份：原首页、立项接单、跨项目完整编辑及名单入口', async ({ page }) => {
  test.setTimeout(150_000)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/')
  await page.getByRole('button', { name: /王浩然 ·/ }).click()
  await expect(page).toHaveURL(/#\/my-projects$/)
  await expect(page.getByRole('button', { name: '当前用户' })).toContainText('王浩然')
  await expect(page.getByRole('radio', { name: '我负责 / 参与', exact: true })).toBeChecked()
  const before = await workspace(page)
  expect(before.database.users.find(u => u.id === before.activeUserId)).toMatchObject({
    role: 'engineer', roleLabel: 'IT工程师', maintenanceAdmin: true, canApproveProjects: true
  })
  await page.goto('/#/manager-grants')
  await expect(page.getByText('当前页面权限已变更', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: '管理人员名单', exact: true })).toBeVisible()
  await page.goto('/#/project-overview')
  await page.getByRole('button', { name: '直接创建项目', exact: true }).click()
  const create = page.getByRole('dialog', { name: '直接创建项目', exact: true })
  const name = `维护工程师接单-${Date.now()}`
  await create.getByLabel('项目名称', { exact: true }).fill(name)
  await create.getByLabel('需求部门', { exact: true }).fill('信息技术部')
  await select(page, create, '主负责人', '王浩然')
  await date(create, '审批确认上线日期', '2099-10-07')
  await create.getByRole('button', { name: '提交工程师确认', exact: true }).click()
  await expect(create).not.toBeVisible()
  const proposal = (await workspace(page)).database.projectProposals!.find(p => p.name === name)!
  expect(proposal.status).toBe('pending')
  await page.goto('/#/today-tasks?proposalId=' + proposal.id)
  await page.reload()
  const confirmation = page.getByRole('dialog', { name: '接单详情 · ' + name, exact: true })
  await confirmation.getByRole('button', { name: '确认接单并立项', exact: true }).click()
  await expect(confirmation).not.toBeVisible()
  const after = await workspace(page)
  expect(after.database.projects.find(p => p.name === name)?.primaryOwnerId).toBe('user-engineer-wang')
  expect(after.database.users.find(u => u.id === after.activeUserId)?.role).toBe('engineer')

  // 用审批权限将现有项目主责改为另一名工程师，再验证当前维护账号仍可完整编辑。
  const project = after.database.projects.find(p => p.name === '正常项目完整编辑测试')!
  await page.goto('/#/project-overview?projectId=' + project.id)
  await page.reload()
  const detail = page.getByRole('dialog', { name: '项目详情', exact: true })
  await expect(detail.getByRole('button', { name: '管理纠正', exact: true })).toBeVisible()
  await expect(detail.getByRole('button', { name: '删除项目', exact: true })).toBeVisible()
  await detail.getByRole('button', { name: '编辑项目', exact: true }).click()
  const editor = page.getByRole('dialog', { name: '编辑项目', exact: true })
  await editor.getByLabel('项目描述', { exact: true }).fill('维护工程师跨项目完整编辑验证')
  await editor.getByRole('tab', { name: '人员关联', exact: true }).click()
  const nextOwner = after.database.users.find(u => u.id === 'user-engineer-zhao')!
  await select(page, editor, '主负责工程师', `${nextOwner.name} · ${nextOwner.department}`)
  await editor.getByRole('button', { name: '保存修改', exact: true }).click()
  const save = page.getByRole('dialog', { name: '确认本次修改', exact: true })
  await save.getByLabel('修改原因').fill('隔离测试验证维护权限独立于工程师主责')
  await save.getByRole('button', { name: '确认保存', exact: true }).click()
  await expect(editor).not.toBeVisible()
  await page.reload()
  await expect(detail.getByRole('button', { name: '编辑项目', exact: true })).toBeVisible()
  expect((await workspace(page)).database.projects.find(p => p.id === project.id)).toMatchObject({
    primaryOwnerId: 'user-engineer-zhao', description: '维护工程师跨项目完整编辑验证'
  })
  await page.screenshot({ path: 'test-results/maintenance-engineer-access.png', fullPage: true })
})
