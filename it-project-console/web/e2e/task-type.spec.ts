import { expect, test } from '@playwright/test'
import { snapshot, select } from './review-helpers'

test('管理审批优先、分类及旧优化编号迁移跨卡片甘特搜索一致', async ({page}) => {
  await page.setViewportSize({width:1920,height:1080})
  await page.goto('/')
  const initial=await snapshot(page), db=initial.database
  const parent=db.projects[0], child=db.projects[1], old=child.code!
  parent.status='completed'; parent.simpleStatus='completed'; parent.stage='验收交付'
  child.parentProjectId=parent.id; child.name='优化类型回归'; child.stage='验收交付'
  child.stagePlans=[{stage:'验收交付',startDate:'2026-09-15',endDate:'2026-09-18'}]
  child.expectedDeliveryDate='2026-09-18'; child.expectedLaunchDate='2026-09-18'
  db.lifecycleEvents.push({id:'audit-free-text',entityType:'project',entityId:child.id,action:'edit',authorId:db.users[0].id,createdAt:'2026-09-15T10:00:00+08:00',reason:'核对原文',before:{description:'上线接口优化原文'},after:{description:'上线接口优化调整后'}})
  db.demands.push({...structuredClone(db.demands[0]),id:'new-optimization',code:'XQ-2026-0999',name:'优化审批回归',parentProjectId:parent.id,optimizationOutcome:'优化验收标准',submittedAt:'2026-09-01T10:00:00+08:00'})
  await page.evaluate(value => localStorage.setItem('it-project-console.prototype.v1',JSON.stringify(value)), initial)
  await page.goto('/#/today-tasks'); await page.reload()
  await expect(page.locator('.task-row').first()).toContainText('优化审批回归')
  await expect(page.locator('.task-row').first().getByRole('button',{name:'优化审批',exact:true})).toBeVisible()
  await page.screenshot({path:'../output/playwright/task-type-today.png',animations:'disabled'})
  await page.getByRole('tab',{name:/^项目异常/}).click()
  await expect(page.getByRole('button',{name:'优化审批',exact:true})).toHaveCount(0)
  await page.getByRole('tab',{name:/^待审批事项/}).click()
  await page.getByRole('button',{name:'优化审批',exact:true}).click()
  const review=page.getByRole('dialog',{name:'优化审批 · 优化审批回归',exact:true})
  await expect(review).toContainText(parent.name)
  await expect(review.getByRole('radio',{name:'批准优化',exact:true})).toBeChecked()
  await expect(review).not.toContainText('后续五个环节')
  await review.getByRole('button',{name:'取消',exact:true}).click()
  const migrated=(await snapshot(page)).database.projects.find(p=>p.id===child.id)!
  expect(migrated.code).toMatch(/^YH-/); expect(migrated.legacyCode).toBe(old)
  await page.goto('/#/project-overview')
  await page.getByRole('textbox',{name:'搜索项目',exact:true}).fill(old)
  await expect(page.locator('[data-project-id]')).toHaveCount(1)
  await expect(page.locator('[data-project-id]')).toContainText(migrated.code!)
  await expect(page.locator('[data-project-id]')).toContainText(parent.name)
  await page.goto('/#/monthly-gantt')
  await select(page,page.locator('main'),'甘特项目类型','项目优化')
  await expect(page.locator('.project-cell')).toHaveCount(1)
  await expect(page.locator('.project-cell')).toContainText(migrated.code!)
  await expect(page.locator('.project-cell')).toContainText('优化完成验收')
  await page.locator('.project-cell').click()
  await expect(page.getByRole('dialog',{name:'优化详情',exact:true})).toContainText('优化审批通过')
  await expect(page.getByRole('dialog',{name:'优化详情',exact:true})).toContainText('上线接口优化原文')
  await expect(page.getByRole('dialog',{name:'优化详情',exact:true})).toContainText('上线接口优化调整后')
  await page.screenshot({path:'../output/playwright/task-type-gantt.png',animations:'disabled'})
})
