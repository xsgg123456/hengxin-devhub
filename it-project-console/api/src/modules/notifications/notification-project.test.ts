import { expect, it } from 'vitest'
import { notificationProjectLabels } from './notification-project.js'

it('优化通知显示独立类型与唯一节点，风险保持数值及阻塞原文', () => {
  expect(notificationProjectLabels('parent', '验收交付', ['验收交付延期 2 天', '项目延期 3 天', '当前已阻塞：等待接口'])).toEqual({
    type: '项目优化', stage: '优化完成验收', risks: ['优化完成验收延期 2 天', '优化延期 3 天', '当前已阻塞：等待接口']
  })
})
it('正式项目保留原阶段与风险描述', () => {
  expect(notificationProjectLabels(null, '开发编码', ['项目延期 3 天'])).toEqual({
    type: '正式项目', stage: '开发编码', risks: ['项目延期 3 天']
  })
})
