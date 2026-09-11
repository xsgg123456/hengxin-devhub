import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
})

test('默认以管理者身份展示总览，并支持切换研发身份与刷新保留', async ({ page }) => {
  await expect(page).toHaveURL(/#\/project-overview$/, { timeout: 15000 })
  await expect(page.getByRole('heading', { name: '项目总览', exact: true, level: 2 })).toBeVisible()
  await expect(page.getByRole('button', { name: '切换演示身份' })).toContainText('陈立峰')

  await page.getByRole('button', { name: '切换演示身份' }).click()
  await expect(page.getByRole('button', { name: /王浩然 IT工程师/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /赵清越 IT工程师/ })).toBeVisible()
  await expect(page.getByText('演示项目关系')).toHaveCount(0)
  await page.getByRole('button', { name: /王浩然 IT工程师/ }).click()
  await expect(page).toHaveURL(/#\/my-projects$/)
  await expect(page.getByRole('heading', { name: '我的项目 / 全部项目', level: 2 })).toBeVisible()
  await expect(page.getByText('主责', { exact: true }).first()).toBeVisible()

  await page.reload()
  await expect(page.getByRole('button', { name: '切换演示身份' })).toContainText('王浩然')
  await expect(page).toHaveURL(/#\/my-projects$/)
})

test('业务身份默认本人需求，可只读访问全部项目', async ({ page }) => {
  await page.getByRole('button', { name: '切换演示身份' }).click()
  await page.getByRole('button', { name: /李思敏 业务人员/ }).click()
  await expect(page).toHaveURL(/#\/my-demands$/)
  await expect(page.getByRole('heading', { name: '我的需求 / 需求池', level: 2 })).toBeVisible()

  await page.goto('/#/project-overview')
  await expect(page).toHaveURL(/#\/project-overview$/)
  await expect(page.locator('[data-project-id]').first()).toBeVisible()
  await expect(page.getByRole('button', { name: '直接创建项目' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '更新环节' })).toHaveCount(0)
})

test('重置演示数据会恢复固定业务数据并保留当前身份', async ({ page }) => {
  await page.getByRole('button', { name: '切换演示身份' }).click()
  await page.getByRole('button', { name: /赵清越 IT工程师/ }).click()
  await page.getByRole('button', { name: '切换演示身份' }).click()
  await page.getByRole('button', { name: '重置演示数据' }).click()
  await page.getByRole('button', { name: '确认重置' }).click()

  await expect(page).toHaveURL(/#\/my-projects$/)
  await expect(page.getByRole('button', { name: '切换演示身份' })).toContainText('赵清越')
})

test.describe('窄屏首次访问门禁', () => {
  test.use({ viewport: { width: 900, height: 800 } })
  test('小于 1024px 时在读取业务数据前给出桌面端提示', async ({ page }) => {
    await expect(page.getByRole('heading', { name: '请在电脑端使用' })).toBeVisible()
    await expect(page.getByText('最低工作区宽度 1024px')).toBeVisible()
    expect(
      await page.evaluate(() => localStorage.getItem('it-project-console.prototype.v1'))
    ).toBeNull()
  })
})
