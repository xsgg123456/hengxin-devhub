import { expect, type Page } from '@playwright/test'
import { identity, select } from './review-helpers'

export const acceptanceDetail = (page: Page) => page.getByRole('dialog', { name: '项目详情', exact: true })
export async function acceptanceIdentity(page: Page, name: string, live = false) {
  const detail = acceptanceDetail(page)
  if (await detail.isVisible()) {
    await detail.getByRole('button', { name: '关闭', exact: true }).click()
    await expect(detail).not.toBeVisible()
  }
  if (!live) return identity(page, name)
  if ((await page.getByRole('button', { name: '当前用户' }).textContent())?.includes(name)) return
  await page.getByRole('button', { name: '当前用户' }).click()
  await page.getByRole('button', { name: new RegExp(name + ' ·') }).click()
  await expect(page.getByRole('button', { name: '当前用户' })).toContainText(name)
  const path = name === '陈立峰' ? 'project-overview' : name === '李思敏' ? 'my-demands' : 'my-projects'
  await expect(page).toHaveURL(new RegExp('#/' + path + '$'))
}
export async function openAcceptance(page: Page, id: string) {
  await page.goto(`/#/project-overview?projectId=${id}`)
  await expect(acceptanceDetail(page)).toBeVisible()
}
export async function assignAcceptance(page: Page, id: string, live = false) {
  await acceptanceIdentity(page, '陈立峰', live)
  await openAcceptance(page, id)
  const detail = acceptanceDetail(page)
  const ownerRow = detail.locator('.el-descriptions__body tr').filter({ hasText: '业务验收负责人' })
  if ((await ownerRow.innerText()).includes('李思敏')) return
  await select(page, detail, '业务验收负责人', '李思敏')
  await detail.getByLabel('改派原因', { exact: true }).fill('指定业务负责人验收本次交付')
  await detail.getByRole('button', { name: '保存验收负责人', exact: true }).click()
  await expect(detail.getByRole('button', { name: '保存验收负责人', exact: true })).toBeEnabled()
  await expect(detail).toContainText('指定业务负责人验收本次交付')
}
export async function completeBusinessAcceptance(page: Page, id: string, summary: string, live = false) {
  await assignAcceptance(page, id, live)
  await acceptanceIdentity(page, '王浩然', live)
  await openAcceptance(page, id)
  await acceptanceDetail(page).getByLabel('交付说明', { exact: true }).fill(summary)
  await acceptanceDetail(page).getByRole('button', { name: '提交验收', exact: true }).click()
  await expect(acceptanceDetail(page)).toContainText('待业务验收')
  await acceptanceIdentity(page, '李思敏', live)
  await openAcceptance(page, id)
  await acceptanceDetail(page).getByRole('button', { name: '验收通过', exact: true }).click()
  await expect(acceptanceDetail(page).getByRole('button', { name: '验收通过', exact: true })).toHaveCount(0)
}
