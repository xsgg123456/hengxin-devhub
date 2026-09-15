import { expect, test } from '@playwright/test'
import { PROJECT_STAGES } from '../src/domain/prototype'
import { card, identity, key, reset, select, snapshot } from './review-helpers'
import { acceptanceDetail, acceptanceIdentity, openAcceptance } from './business-acceptance-helpers'

for (const role of ['manager', 'engineer'] as const) {
  test(`${role} 可从完整编辑和改派下拉选择，指定后通过原验收入口操作`, async ({ page }) => {
    await page.goto('/')
    await reset(page)
    await identity(page, '陈立峰')
    const data = await snapshot(page)
    const project = data.database.projects.find(p => p.status === 'active' && !p.archived)!
    const owner = data.database.users.find(u => u.role === role && u.id !== project.primaryOwnerId)!
    const primary = data.database.users.find(u => u.id === project.primaryOwnerId)!
    project.stage = '验收交付'
    project.stagePlans = PROJECT_STAGES.map(stage => ({ stage, startDate: '2099-10-10', endDate: '2099-10-10' }))
    project.acceptanceStatus = 'none'
    await page.evaluate(({ key, data }) => localStorage.setItem(key, JSON.stringify(data)), { key, data })
    await page.reload()
    await card(page, project.name).getByRole('button', { name: '编辑项目', exact: true }).click()
    const editor = page.getByRole('dialog', { name: '编辑项目', exact: true })
    await editor.getByRole('tab', { name: '人员关联' }).click()
    await select(page, editor, '业务验收人', owner.name + ' · ' + owner.department)
    await page.screenshot({ path: `../output/all-staff-${role}-edit.png`, fullPage: true, animations: 'disabled' })
    await editor.getByRole('button', { name: '保存修改', exact: true }).click()
    const confirmation = page.getByRole('dialog', { name: '确认本次修改', exact: true })
    await confirmation.getByLabel('修改原因').fill('公司人员均可指定验收')
    await confirmation.getByRole('button', { name: '确认保存', exact: true }).click()
    await expect(editor).not.toBeVisible()
    expect((await snapshot(page)).database.projects.find(p => p.id === project.id)?.acceptanceOwnerId).toBe(owner.id)
    await openAcceptance(page, project.id)
    await select(page, acceptanceDetail(page), '业务验收负责人', '李思敏')
    await acceptanceDetail(page).getByLabel('改派原因', { exact: true }).fill('测试改派')
    await acceptanceDetail(page).getByRole('button', { name: '保存验收负责人', exact: true }).click()
    await expect.poll(async () => (await snapshot(page)).database.projects.find(p => p.id === project.id)?.acceptanceOwnerId).toBe('user-business-li')
    await select(page, acceptanceDetail(page), '业务验收负责人', owner.name)
    await acceptanceDetail(page).getByLabel('改派原因', { exact: true }).fill('指定公司人员验收')
    await acceptanceDetail(page).getByRole('button', { name: '保存验收负责人', exact: true }).click()
    await expect.poll(async () => (await snapshot(page)).database.projects.find(p => p.id === project.id)?.acceptanceOwnerId).toBe(owner.id)
    await acceptanceIdentity(page, primary.name)
    await openAcceptance(page, project.id)
    await acceptanceDetail(page).getByLabel('交付说明', { exact: true }).fill('完整交付材料')
    await acceptanceDetail(page).getByRole('button', { name: '提交验收', exact: true }).click()
    await expect.poll(async () => (await snapshot(page)).database.projects.find(p => p.id === project.id)?.acceptanceStatus).toBe('pending')
    await acceptanceIdentity(page, '李思敏')
    await openAcceptance(page, project.id)
    await expect(acceptanceDetail(page).getByRole('button', { name: '验收通过', exact: true })).toHaveCount(0)
    await acceptanceIdentity(page, owner.name)
    await page.goto('/#/today-tasks')
    await expect(page.locator('.task-row').filter({ hasText: project.name })).toContainText('待我验收')
    await openAcceptance(page, project.id)
    await acceptanceDetail(page).getByRole('button', { name: '验收通过', exact: true }).scrollIntoViewIfNeeded()
    await page.screenshot({ path: `../output/all-staff-${role}-acceptance.png`, fullPage: true, animations: 'disabled' })
    await acceptanceDetail(page).getByRole('button', { name: '验收通过', exact: true }).click()
    await expect.poll(async () => (await snapshot(page)).database.projects.find(p => p.id === project.id)?.acceptanceStatus).toBe('accepted')
  })
}
