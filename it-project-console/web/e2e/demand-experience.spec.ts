import { expect, test } from '@playwright/test'
import { identity, snapshot, key, date } from './review-helpers'

test('教程资源诚实占位，电脑缩放保留表单内容与路由', async ({ page }) => {
  await page.goto('/')
  await identity(page, '李思敏')
  await expect(page.getByText('business-prd-prototype.zip', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '下载 Skill 成品包' })).toBeDisabled()
  await page.getByRole('button', { name: '观看教程', exact: true }).click()
  const video = page.getByRole('dialog', { name: '视频教程 · 如何正确提 0→1 项目需求' })
  await expect(video).toContainText('视频素材待放入')
  await video.getByRole('button', { name: '关闭', exact: true }).click()
  await page.screenshot({ path: '../output/playwright/demand-experience-desktop.png', animations: 'disabled' })
  await page.getByRole('button', { name: '提交正式项目需求', exact: true }).click()
  const editor = page.getByRole('dialog', { name: '提交正式项目需求', exact: true })
  await editor.getByLabel('项目名称', { exact: true }).fill('缩小窗口保留的未保存名称')
  for (const width of [930, 600, 1440]) {
    await page.setViewportSize({ width, height: 1000 })
    await expect(editor.getByLabel('项目名称', { exact: true })).toHaveValue('缩小窗口保留的未保存名称')
    await expect(page.getByRole('heading', { name: '请在电脑端使用' })).toHaveCount(0)
    await expect(page).toHaveURL(/#\/my-demands$/)
    await expect.poll(async () => (await editor.boundingBox())!.x).toBeGreaterThanOrEqual(-1)
    await expect.poll(async () => (await editor.boundingBox())!.width).toBeLessThanOrEqual(width)
  }
  await editor.getByRole('button', { name: '取消', exact: true }).click()
  await page.getByRole('button', { name: '放弃修改', exact: true }).click()
  await page.setViewportSize({ width: 930, height: 1000 })
  await expect(page.locator('.el-menu--collapse')).toBeVisible()
  await page.screenshot({ path: '../output/playwright/demand-experience-narrow.png', animations: 'disabled' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
})

test('需求池选择已完成主项目、按编号搜索、草稿再提交，关联不会误变为正式需求', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/')
  const initial = await snapshot(page)
  const parent = initial.database.projects[0]
  parent.status = 'completed'; parent.simpleStatus = 'completed'; parent.stage = '验收交付'
  parent.actualCompletedAt = '2026-09-10T00:00:00.000Z'
  parent.code = 'XM-2026-8801'
  await page.evaluate(({ k, value }) => localStorage.setItem(k, JSON.stringify(value)), { k: key, value: initial })
  await page.reload()
  await identity(page, '李思敏')
  const before = (await snapshot(page)).database.demands.length
  await page.getByRole('button', { name: '提交优化需求', exact: true }).click()
  const editor = page.getByRole('dialog', { name: '优化需求', exact: true })
  await editor.getByRole('button', { name: '保存草稿', exact: true }).click()
  await expect(editor).toContainText('请选择关联原项目')
  expect((await snapshot(page)).database.demands.length).toBe(before)
  await editor.getByRole('combobox', { name: '关联原项目', exact: true }).fill('8801')
  await page.getByRole('option', { name: `${parent.name} · XM-2026-8801`, exact: true }).click()
  await editor.getByLabel('优化标题', { exact: true }).fill('需求池关联项目回归')
  await editor.getByLabel('当前问题', { exact: true }).fill('导出缺少业务部门')
  await editor.getByLabel('期望效果 / 验收标准', { exact: true }).fill('导出包含正确部门')
  await date(editor, '期望完成日期', '2099-10-20')
  await editor.locator('.el-drawer__body').evaluate(el => { el.scrollTop = 0 })
  await page.screenshot({ path: '../output/playwright/demand-experience-optimization.png', animations: 'disabled' })
  await editor.getByRole('button', { name: '保存草稿', exact: true }).click()
  await expect(editor).not.toBeVisible()
  const draft = (await snapshot(page)).database.demands.find(d => d.name === '需求池关联项目回归')!
  expect(draft).toMatchObject({ parentProjectId: parent.id, status: 'draft' })
  await page.getByRole('row').filter({ hasText: draft.name }).getByRole('button', { name: '编辑', exact: true }).click()
  await expect(editor.getByRole('combobox', { name: '关联原项目', exact: true })).toHaveCount(0)
  await editor.getByRole('button', { name: '提交优化审批', exact: true }).click()
  await expect(editor).not.toBeVisible()
  expect((await snapshot(page)).database.demands.find(d => d.id === draft.id)).toMatchObject({ parentProjectId: parent.id, status: 'pending' })
  expect((await snapshot(page)).database.projects.find(p => p.id === parent.id)).toEqual(parent)
})

test('无已完成主项目时说明空状态且不产生普通需求', async ({ page }) => {
  await page.goto('/')
  const initial = await snapshot(page)
  initial.database.projects.forEach(p => { p.status = 'active' })
  await page.evaluate(({ k, value }) => localStorage.setItem(k, JSON.stringify(value)), { k: key, value: initial })
  await page.reload()
  await identity(page, '李思敏')
  await page.getByRole('button', { name: '提交优化需求', exact: true }).click()
  const editor = page.getByRole('dialog', { name: '优化需求', exact: true })
  await editor.getByRole('combobox', { name: '关联原项目', exact: true }).click()
  await expect(page.getByText('暂无可关联的已完成主项目', { exact: true })).toBeVisible()
  await editor.getByRole('button', { name: '提交优化审批', exact: true }).click()
  await expect(editor).toContainText('请选择关联原项目')
  expect((await snapshot(page)).database.demands).toEqual(initial.database.demands)
})
