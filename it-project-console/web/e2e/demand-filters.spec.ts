import { expect, test } from '@playwright/test'
import type { PrototypeSnapshot } from '../src/domain/prototype'

test('统一部门、提出时间及完成筛选同步指标、图表和清单，空态与重置正常', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '直接创建项目' })).toBeVisible()
  await page.evaluate(() => {
    const key = 'it-project-console.prototype.v1'
    const snapshot: PrototypeSnapshot = JSON.parse(localStorage.getItem(key)!)
    const source = snapshot.database.demands[0],
      project = snapshot.database.projects[0]
    snapshot.database.demands = [
      {
        ...source,
        code: undefined,
        id: 'filter-early',
        name: '正常完成样例',
        department: '客服组',
        status: 'established',
        submittedAt: '2026-09-01T00:00:00+08:00'
      },
      {
        ...source,
        code: undefined,
        id: 'filter-late',
        name: '延期完成样例',
        department: '客服组',
        status: 'established',
        submittedAt: '2026-09-30T23:59:00+08:00'
      },
      {
        ...source,
        code: undefined,
        id: 'filter-pending',
        name: '尚未评估样例',
        department: '设计部',
        status: 'pending',
        submittedAt: '2026-08-10T09:00:00+08:00'
      }
    ]
    snapshot.database.projects = [
      {
        ...project,
        code: undefined,
        id: 'p-filter-early',
        demandId: 'filter-early',
        status: 'completed',
        stage: '验收交付',
        simpleStatus: 'completed',
        expectedDeliveryDate: '2026-09-20',
        actualCompletedAt: '2026-09-20T15:59:00Z',
        archived: false
      },
      {
        ...project,
        code: undefined,
        id: 'p-filter-late',
        demandId: 'filter-late',
        status: 'completed',
        stage: '验收交付',
        simpleStatus: 'completed',
        expectedDeliveryDate: '2026-09-20',
        actualCompletedAt: '2026-09-20T16:00:00Z',
        archived: false
      }
    ]
    snapshot.database.progressUpdates = []
    snapshot.database.stageHistories = []
    snapshot.database.scheduleChanges = []
    snapshot.database.lifecycleEvents = []
    localStorage.setItem(key, JSON.stringify(snapshot))
  })
  await page.goto('/#/my-demands')
  await page.reload()
  const rows = page.locator('.el-table__body-wrapper .el-table__row')
  await expect(rows).toHaveCount(3)
  await page.getByText('全部部门', { exact: true }).click()
  await page.getByRole('option', { name: '客服组', exact: true }).click()
  await page.getByPlaceholder('开始日期', { exact: true }).fill('2026-09-01')
  await page.getByPlaceholder('结束日期', { exact: true }).fill('2026-09-30')
  await page.getByPlaceholder('结束日期', { exact: true }).press('Enter')
  await expect(rows).toHaveCount(2)
  await page.getByText('全部完成情况', { exact: true }).click()
  await page.getByRole('option', { name: '延期完成', exact: true }).click()
  await expect(rows).toHaveCount(1)
  await expect(rows).toContainText('延期完成样例')
  await expect(rows).toContainText('2026-09-21')
  await expect(
    page.locator('.art-card').filter({ has: page.getByText('当前范围需求', { exact: true }) })
  ).toContainText('1')
  await expect(page.locator('.quantity-row').filter({ hasText: '客服组' })).toContainText(
    '1 · 100%'
  )
  await page.getByText('全部状态', { exact: true }).click()
  await page.getByRole('option', { name: '待评估', exact: true }).click()
  await expect(rows).toHaveCount(0)
  await expect(page.getByText('没有符合筛选条件的需求')).toBeVisible()
  await expect(
    page.locator('.art-card').filter({ has: page.getByText('当前范围需求', { exact: true }) })
  ).toContainText('0')
  await page.getByRole('button', { name: '重置筛选' }).click()
  await expect(rows).toHaveCount(3)
  await expect(page.getByText('全部部门', { exact: true })).toBeVisible()
})
