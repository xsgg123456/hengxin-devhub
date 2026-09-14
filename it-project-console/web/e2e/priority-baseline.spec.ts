import { expect, test } from '@playwright/test'
import type { PrototypeSnapshot } from '../src/domain/prototype'
import { date, snapshot } from './review-helpers'

test('项目和甘特优先级一致，P0重点标识可见，历史项目无审批基准', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.clock.setFixedTime(new Date('2026-09-14T04:00:00Z'))
  await page.goto('/')
  await expect(page.getByRole('button', { name: '直接创建项目' })).toBeVisible()
  await page.evaluate(() => {
    const key = 'it-project-console.prototype.v1'
    const state: PrototypeSnapshot = JSON.parse(localStorage.getItem(key)!)
    state.database.projects.forEach((p, index) => {
      p.name = ['普通项目P2', '重点项目P0', '优先项目P1'][index]
      p.priority = (['P2', 'P0', 'P1'] as const)[index]
      p.createdAt = '2026-09-01T00:00:00Z'
      p.expectedDeliveryDate = '2026-09-30'
      p.archived = false
      p.status = 'active'
    })
    localStorage.setItem(key, JSON.stringify(state))
  })
  await page.reload()
  const cards = page.locator('[data-project-id]')
  await expect(cards).toHaveCount(3)
  await expect(cards.nth(0)).toContainText('重点项目P0')
  await expect(cards.nth(1)).toContainText('优先项目P1')
  await expect(cards.nth(2)).toContainText('普通项目P2')
  await expect(cards.nth(0).locator('.priority-focus')).toHaveText('P0 · 重点项目')
  await expect(cards.nth(1).locator('.priority-focus')).toHaveCount(0)
  await cards.nth(0).screenshot({ path: '../../output/playwright/priority-acceptance/p0-card.png' })
  await cards.nth(0).getByRole('button', { name: '详情', exact: true }).click()
  const detail = page.getByRole('dialog', { name: '项目详情', exact: true })
  await expect(detail).toContainText('审批确认上线日期')
  await expect(detail).toContainText('未设置')
  await expect(detail).not.toContainText('超出审批日期')
  await detail.getByRole('button', { name: '关闭', exact: true }).click()
  await page.getByRole('menuitem', { name: '甘特图', exact: true }).click()
  const rows = page.locator('.project-cell')
  await expect(rows.nth(0)).toContainText('重点项目P0')
  await expect(rows.nth(1)).toContainText('优先项目P1')
  await expect(rows.nth(2)).toContainText('普通项目P2')
  await expect(rows.nth(0).locator('.priority-focus')).toBeVisible()
  await page.screenshot({ path: '../../output/playwright/priority-acceptance/gantt.png' })
})

test('工程师首次排期超审批日期可保存且基准不覆盖', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto('/')
  await expect(page.getByRole('button', { name: '直接创建项目' })).toBeVisible()
  await page.evaluate(() => {
    const key = 'it-project-console.prototype.v1'
    const state: PrototypeSnapshot = JSON.parse(localStorage.getItem(key)!)
    const project = state.database.projects[0]
    state.activeUserId = project.primaryOwnerId
    Object.assign(project, {
      name: '审批基准排期验证',
      stage: '方案设计',
      simpleStatus: 'not-started',
      status: 'active',
      archived: false,
      approvedLaunchDate: '2099-10-07',
      stagePlans: [],
      expectedLaunchDate: '',
      originalLaunchDate: '',
      expectedDeliveryDate: '',
      originalDeliveryDate: ''
    })
    localStorage.setItem(key, JSON.stringify(state))
  })
  await page.reload()
  const card = page.locator('[data-project-id]').filter({ hasText: '审批基准排期验证' })
  await card.getByRole('button', { name: '制定计划', exact: true }).click()
  const plan = page.getByRole('dialog', { name: '制定项目计划', exact: true })
  for (const [index, stage] of [
    '方案设计',
    '开发编码',
    '联调测试',
    '上线部署',
    '验收交付'
  ].entries()) {
    await date(plan, `${stage}计划开始日期`, `2099-10-${String(index * 2 + 1).padStart(2, '0')}`)
    await date(plan, `${stage}计划结束日期`, `2099-10-${String(index * 2 + 2).padStart(2, '0')}`)
  }
  await expect(plan).toContainText('超出审批日期 1 天')
  await plan.getByRole('button', { name: '保存计划' }).click()
  await expect(plan).not.toBeVisible()
  const saved = (await snapshot(page)).database.projects.find((p) => p.name === '审批基准排期验证')!
  expect(saved.approvedLaunchDate).toBe('2099-10-07')
  expect(saved.expectedLaunchDate).toBe('2099-10-08')
  expect(saved.originalLaunchDate).toBe('2099-10-08')
  await card.getByRole('button', { name: '详情', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '项目详情', exact: true })).toContainText(
    '超出审批日期 1 天'
  )
})
