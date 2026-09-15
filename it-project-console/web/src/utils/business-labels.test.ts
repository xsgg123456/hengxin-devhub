import { expect, it } from 'vitest'
import { businessError, scheduleFieldLabel, stageLabel } from './business-labels'
it('审批日期及环节日期中文显示，未知系统字段不外泄', () => {
  expect(scheduleFieldLabel('approvedLaunchDate')).toBe('审批确认上线日期')
  expect(scheduleFieldLabel('stage:方案设计:startDate')).toBe('方案设计计划开始')
  expect(scheduleFieldLabel('stage:internalStage:endDate')).toBe('日期调整')
  expect(scheduleFieldLabel('newInternalField')).toBe('日期调整')
  expect(stageLabel('internalStage')).toBe('未知环节')
  expect(stageLabel('方案设计')).toBe('方案设计')
})
it('英文系统错误中文兜底，保留中文业务错误中的产品名', () => {
  expect(businessError('name is required')).toBe('操作失败，请稍后重试')
  expect(businessError('项目 CRM 已被更新')).toBe('项目 CRM 已被更新')
})
