import { expect, test } from '@playwright/test'
import { card, identity, key, reset, snapshot } from './review-helpers'

test('项目卡片和详情展示当前业务负责人，直接创建与原提出人不替代人员', async ({ page }) => {
  await page.goto('/')
  await reset(page)
  await identity(page, '陈立峰')
  const data = await snapshot(page)
  const project = data.database.projects.find(p => p.status === 'active' && !p.archived)!
  const business = data.database.users.find(u => u.role === 'business')!
  project.source = 'direct'
  project.demandId = null
  project.businessOwnerId = business.id
  await page.evaluate(({key,data}) => localStorage.setItem(key, JSON.stringify(data)), {key,data})
  await page.reload()
  const ownerCell = () => card(page, project.name).locator('dl > div').filter({hasText:'业务负责人'})
  await expect(ownerCell()).toHaveText(`业务负责人${business.name}`)
  await card(page, project.name).getByRole('button', {name:'详情',exact:true}).click()
  const detail = page.getByRole('dialog', {name:'项目详情',exact:true})
  const detailOwner = () => detail.locator('tr').filter({has:page.getByText('业务负责人',{exact:true})})
  await expect(detailOwner()).toContainText(business.name)
  await expect(detail).toContainText('直接创建')
  await detail.getByRole('button', {name:'关闭此对话框',exact:true}).click()
  project.demandId = data.database.demands[0]!.id
  project.businessOwnerId = ''
  await page.evaluate(({key,data}) => localStorage.setItem(key, JSON.stringify(data)), {key,data})
  await page.reload()
  await expect(ownerCell()).toHaveText('业务负责人未设置')
  // The projectId deep link restores the detail drawer after reload.
  await expect(detailOwner()).toContainText('未设置')
})
