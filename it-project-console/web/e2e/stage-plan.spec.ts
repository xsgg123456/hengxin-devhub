import { expect, test } from '@playwright/test'
import type { PrototypeSnapshot } from '../src/domain/prototype'

test('无日期立项、先排五环节、调整留痕、逐环节完成后自动完结', async ({ page }) => {
  test.setTimeout(90_000)
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto('/')
  await expect(page.getByRole('button', { name: '直接创建项目' })).toBeVisible()
  await page.getByRole('button', { name: '直接创建项目' }).click()
  const creation = page.getByRole('dialog', { name: '直接创建项目', exact: true })
  await creation.getByLabel('项目名称', { exact: true }).fill('五环节排期验收项目')
  await creation.getByLabel('需求部门', { exact: true }).fill('IT部')
  await creation
    .locator('.el-select')
    .filter({ has: page.getByRole('combobox', { name: '主负责人', exact: true }) })
    .click()
  await page.getByRole('option', { name: '王浩然', exact: true }).click()
  await expect(creation.locator('.el-date-editor')).toHaveCount(0)
  await creation.getByRole('button', { name: '创建项目', exact: true }).click()
  const detail = page.getByRole('dialog', { name: '项目详情', exact: true })
  await expect(detail).toBeVisible()
  await expect(detail.getByRole('button', { name: '更新环节', exact: true })).toHaveCount(0)
  await detail.getByRole('button', { name: '关闭', exact: true }).click()
  await page.getByRole('button', { name: '切换演示身份' }).click()
  await page.locator('.identity-menu-item').filter({ hasText: '王浩然' }).click()
  const card = page.locator('[data-project-id]').filter({ hasText: '五环节排期验收项目' })
  await card.getByRole('button', { name: '制定计划', exact: true }).click()
  const plan = page.getByRole('dialog', { name: '制定项目计划', exact: true })
  await plan.getByRole('button', { name: '保存计划' }).click()
  await expect(plan.getByRole('alert')).toBeVisible()
  const stages = ['方案设计', '开发编码', '联调测试', '上线部署', '验收交付']
  for (const [index, stage] of stages.entries()) {
    for (const [suffix, day] of [
      ['开始', index * 2 + 1],
      ['结束', index * 2 + 2]
    ] as const) {
      const input = plan.getByLabel(`${stage}计划${suffix}日期`, { exact: true })
      await input.fill(`2099-10-${String(day).padStart(2, '0')}`)
      await input.press('Tab')
    }
  }
  await page.screenshot({ path: '../output/playwright/stage-plan-implemented/plan.png' })
  await plan.getByRole('button', { name: '保存计划' }).click()
  await expect(plan).not.toBeVisible()
  await card.getByRole('button', { name: '详情', exact: true }).click()
  await expect(detail).toContainText('保存项目计划 · 首次排期')
  await expect(detail).not.toContainText('[object Object]')
  await page.screenshot({ path: '../output/playwright/stage-plan-implemented/detail.png' })
  await detail.getByRole('button', { name: '调整计划', exact: true }).click()
  const adjustment = page.getByRole('dialog', { name: '调整项目计划', exact: true })
  await adjustment.getByLabel('验收交付计划结束日期', { exact: true }).fill('2099-10-11')
  await adjustment.getByLabel('验收交付计划结束日期', { exact: true }).press('Tab')
  await adjustment.getByRole('button', { name: '保存计划' }).click()
  await expect(adjustment.getByRole('alert')).toBeVisible()
  await adjustment
    .locator('.el-select')
    .filter({ has: page.getByRole('combobox', { name: '日期调整原因', exact: true }) })
    .click()
  await page.getByRole('option', { name: '等待外部资源', exact: true }).click()
  await adjustment.getByLabel('日期调整说明', { exact: true }).fill('验收人员时间调整')
  await adjustment.getByRole('button', { name: '保存计划' }).click()
  await expect(adjustment).not.toBeVisible()
  await expect(detail).toContainText('2099-10-10 → 2099-10-11')
  await expect(detail).toContainText('王浩然')
  await detail.getByRole('button', { name: '关闭', exact: true }).click()
  for (const stage of stages) {
    await card.getByRole('button', { name: '更新环节', exact: true }).click()
    const update = page.getByRole('dialog', { name: '更新环节', exact: true })
    await expect(update.locator('input[readonly]').first()).toHaveValue(stage)
    await expect(update.locator('.el-date-editor')).toHaveCount(0)
    await expect(update.getByRole('spinbutton')).toHaveCount(0)
    await update.getByText('已完成', { exact: true }).click()
    if (stage === '方案设计')
      await page.screenshot({ path: '../output/playwright/stage-plan-implemented/update.png' })
    await update.getByRole('button', { name: '保存更新', exact: true }).click()
    await expect(update).not.toBeVisible()
  }
  const snapshot: PrototypeSnapshot = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('it-project-console.prototype.v1')!)
  )
  const saved = snapshot.database.projects.find((p) => p.name === '五环节排期验收项目')!
  expect(saved).toMatchObject({
    status: 'completed',
    archived: false,
    expectedDeliveryDate: '2099-10-11'
  })
  expect(saved.actualCompletedAt).toBeTruthy()
  expect(
    snapshot.database.stageHistories.filter((h) => h.projectId === saved.id && h.completedAt)
  ).toHaveLength(7)
  expect(
    snapshot.database.progressUpdates.filter(
      (u) => u.projectId === saved.id && u.kind === 'overall'
    )
  ).toHaveLength(5)
  await page.reload()
  await page.goto('/#/my-demands')
  // 完成证据从持久化重新读取，避免仅验证页面内存。
  const stored: PrototypeSnapshot = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('it-project-console.prototype.v1')!)
  )
  expect(stored.database.projects.find((p) => p.id === saved.id)?.actualCompletedAt).toBe(
    saved.actualCompletedAt
  )
})
