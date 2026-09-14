import { expect, test } from '@playwright/test'
import { key, snapshot } from './review-helpers'

test('普通管理员保留查看和名单，隐藏直接创建、评估与立项待办', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '直接创建项目', exact: true })).toBeVisible()
  const state = await snapshot(page)
  const manager = state.database.users.find(u => u.id === state.activeUserId)!
  manager.canApproveProjects = false
  await page.evaluate(({ key, state }) => localStorage.setItem(key, JSON.stringify(state)), { key, state })
  await page.reload()
  await expect(page.getByRole('button', { name: '管理人员名单', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '直接创建项目', exact: true })).toHaveCount(0)
  await page.goto('/#/my-demands')
  await expect(page.getByRole('button', { name: '评估', exact: true })).toHaveCount(0)
  await page.goto('/#/today-tasks')
  await expect(page.getByRole('button', { name: '评估需求', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '重新评估', exact: true })).toHaveCount(0)
  await page.screenshot({ path: 'test-results/project-approver-manager.png', fullPage: true })
})
