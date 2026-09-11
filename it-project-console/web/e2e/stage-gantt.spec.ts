import { expect, test } from '@playwright/test'
import type { PrototypeSnapshot } from '../src/domain/prototype'

test('真实完成快照决定卡片和甘特颜色，浮层跟随鼠标并避开边缘', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 945 })
  await page.clock.setFixedTime(new Date('2026-09-16T04:00:00Z'))
  await page.goto('/')
  await expect(page.getByRole('button', { name: '直接创建项目' })).toBeVisible()
  await page.evaluate(() => {
    const key = 'it-project-console.prototype.v1'
    const snapshot: PrototypeSnapshot = JSON.parse(localStorage.getItem(key)!)
    const project = snapshot.database.projects[0]!
    Object.assign(project, { name: '阶段颜色真实验证', stage: '上线部署', status: 'active', archived: false,
      createdAt: '2026-08-29T00:00:00Z', expectedDeliveryDate: '2026-09-30',
      stagePlans: [
        { stage: '方案设计', startDate: '2026-08-29', endDate: '2026-09-02' },
        { stage: '开发编码', startDate: '2026-09-02', endDate: '2026-09-10' },
        { stage: '联调测试', startDate: '2026-09-10', endDate: '2026-09-20' },
        { stage: '上线部署', startDate: '2026-09-15', endDate: '2026-09-18' },
        { stage: '验收交付', startDate: '2026-09-18', endDate: '2026-09-30' }
      ] })
    snapshot.database.stageHistories = snapshot.database.stageHistories.filter(h => h.projectId !== project.id)
    snapshot.database.stageHistories.push(
      { projectId: project.id, stage: '方案设计', startedAt: project.createdAt, completedAt: '2026-09-02T00:00:00Z', plannedStartDate: '2026-08-29', plannedEndDate: '2026-09-02' },
      { projectId: project.id, stage: '开发编码', startedAt: '2026-09-02T00:00:00Z', completedAt: '2026-09-10T00:00:00Z', plannedStartDate: '2026-09-02', plannedEndDate: '2026-09-10' },
      { projectId: project.id, stage: '联调测试', startedAt: '2026-09-10T00:00:00Z', completedAt: '2026-09-15T00:00:00Z', plannedStartDate: '2026-09-10', plannedEndDate: '2026-09-13' }
    )
    localStorage.setItem(key, JSON.stringify(snapshot))
  })
  await page.reload()
  const card = page.locator('[data-project-id]').filter({ hasText: '阶段颜色真实验证' })
  await expect(card.locator('.stage-block')).toHaveCount(7)
  await expect(card.locator('.stage-block.late-done')).toHaveCount(1)
  await expect(card).toContainText('联调测试延期完成 2 天')
  await card.screenshot({ path: '../output/playwright/round2-card-actual.png' })
  await page.goto('/#/monthly-gantt')
  const track = page.getByRole('button', { name: '查看阶段颜色真实验证详情', exact: true }).locator('..')
  await expect(track.locator('.phase-segment')).toHaveCount(5)
  const late = track.locator('.phase-segment.late-done')
  await expect(late).toContainText('联调测试')
  const rect = (await late.boundingBox())!
  const pointer = { x: rect.x + 10, y: rect.y + 10 }
  await page.mouse.move(pointer.x, pointer.y)
  const tip = page.locator('.gantt-tip')
  await expect(tip).toContainText('延期完成 2 天')
  await expect(tip).toContainText('2026-09-13')
  await expect(tip.locator('..')).toHaveCSS('opacity', '1')
  await expect.poll(async () => Math.abs((await tip.boundingBox())!.x - pointer.x)).toBeLessThan(40)
  await page.screenshot({ path: '../output/playwright/round2-gantt-actual.png' })
  const row = (await track.boundingBox())!
  await page.mouse.move(row.x + row.width - 5, row.y + 15)
  await expect(tip).toBeVisible()
  await expect.poll(async () => { const box = (await tip.boundingBox())!; return box.x >= 0 && box.x + box.width <= 1920 && box.y + box.height <= 945 }).toBe(true)
  await page.locator('.gantt-scroll').evaluate(el => el.dispatchEvent(new Event('scroll')))
  await expect(tip).not.toBeVisible()
  await late.focus()
  await expect(tip).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(tip).not.toBeVisible()
  await late.click()
  await expect(page.getByRole('dialog', { name: '项目详情', exact: true })).toContainText('延期完成 2天')
})
