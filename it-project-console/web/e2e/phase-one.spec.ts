import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
})

test('默认以管理者身份展示总览，并支持切换研发身份与刷新保留', async ({ page }) => {
  await expect(page).toHaveURL(/#\/project-overview$/)
  await expect(page.getByRole('heading', { name: '项目运行概览' })).toBeVisible()
  await expect(page.getByRole('button', { name: '切换演示身份' })).toContainText('陈立峰')

  await page.getByRole('button', { name: '切换演示身份' }).click()
  await page.getByRole('button', { name: /王浩然 项目主负责人/ }).click()
  await expect(page).toHaveURL(/#\/my-projects$/)
  await expect(page.getByRole('heading', { name: '我的项目', level: 2 })).toBeVisible()
  await expect(page.getByText('主责', { exact: true }).first()).toBeVisible()

  await page.reload()
  await expect(page.getByRole('button', { name: '切换演示身份' })).toContainText('王浩然')
  await expect(page).toHaveURL(/#\/my-projects$/)
})

test('业务身份只能进入业务页面，越权会得到明确反馈', async ({ page }) => {
  await page.getByRole('button', { name: '切换演示身份' }).click()
  await page.getByRole('button', { name: /李思敏 业务需求负责人/ }).click()
  await expect(page).toHaveURL(/#\/my-demands$/)
  await expect(page.getByRole('heading', { name: '我的需求', level: 2 })).toBeVisible()

  await page.goto('/#/project-overview')
  await expect(page).toHaveURL(/#\/403\?from=/)
  await expect(page.getByRole('heading', { name: '当前身份无法访问这个页面' })).toBeVisible()
})

test('重置演示数据会恢复固定业务数据并保留当前身份', async ({ page }) => {
  await page.getByRole('button', { name: '切换演示身份' }).click()
  await page.getByRole('button', { name: /赵清越 项目协作人员/ }).click()
  await page.getByRole('button', { name: '切换演示身份' }).click()
  await page.getByRole('button', { name: '重置演示数据' }).click()
  await page.getByRole('button', { name: '确认重置' }).click()

  await expect(page).toHaveURL(/#\/my-projects$/)
  await expect(page.getByRole('button', { name: '切换演示身份' })).toContainText('赵清越')
})

test('小于 1024px 时在读取业务数据前给出桌面端提示', async ({ page }) => {
  await page.evaluate(() => localStorage.clear())
  await page.setViewportSize({ width: 900, height: 800 })
  await page.reload()

  await expect(page.getByRole('heading', { name: '请在电脑端使用' })).toBeVisible()
  await expect(page.getByText('最低工作区宽度 1024px')).toBeVisible()
  expect(
    await page.evaluate(() => localStorage.getItem('it-project-console.prototype.v1'))
  ).toBeNull()
})
