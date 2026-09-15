import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiRequest } from './api-client'
import { editLiveProject } from './live-project-service'
import { liveOperationKey } from './live-demand-service'
import { createInitialPrototypeSnapshot } from '@/mocks/seed'
vi.mock('./api-client', () => ({ apiRequest: vi.fn() }))
const api = vi.mocked(apiRequest)
describe('正式完整编辑请求', () => {
  beforeEach(() => vi.resetAllMocks())
  it('仅发送可编辑字段，过滤全空阶段计划且不发送历史字段', async () => {
    const project = createInitialPrototypeSnapshot().database.projects[0]!
    project.version = 8
    project.firstRequestedOn = ''
    project.businessOwnerId = ''
    project.stagePlans = [{ stage: '需求受理', startDate: '', endDate: '' }, { stage: '方案设计', startDate: '2026-09-01', endDate: '2026-09-03' }]
    await editLiveProject(project, ' 核对原始资料 ', false, 'stable-key')
    expect(api).toHaveBeenCalledWith('/projects/' + project.id + '/edit', {
      method: 'POST', body: expect.objectContaining({ version: 8, requestId: 'stable-key', reason: '核对原始资料', firstRequestedOn: null, businessOwnerId: null, verify: false,
        stagePlans: [{ stage: '方案设计', startDate: '2026-09-01', endDate: '2026-09-03' }] })
    })
    const body = api.mock.calls[0]![1]!.body as Record<string, unknown>
    expect(Object.keys(body).sort()).toEqual(['requestId','version','reason','verify','name','description','department','priority','firstRequestedOn','primaryOwnerId','collaboratorIds','businessOwnerId','acceptanceOwnerId','stage','simpleStatus','blocker','approvedLaunchDate','originalLaunchDate','originalDeliveryDate','expectedLaunchDate','expectedDeliveryDate','stagePlans','acceptanceUrl','acceptanceSummary'].sort())
  })
  it.each(['网络请求失败', '项目版本冲突', '无完整编辑权限'])('失败保留原表单，原请求重试幂等：%s', async message => {
    const project = createInitialPrototypeSnapshot().database.projects[0]!
    project.version = 2
    const baseline = structuredClone(project)
    const key = liveOperationKey()
    api.mockRejectedValueOnce(new Error(message))
    await expect(editLiveProject(project, '核实', true, key(project))).rejects.toThrow(message)
    await editLiveProject(project, '核实', true, key(project))
    expect(project).toEqual(baseline)
    expect(api.mock.calls[0]).toEqual(api.mock.calls[1])
  })
  it('版本缺失与原因空白均不能发出写请求', () => {
    const project = createInitialPrototypeSnapshot().database.projects[0]!
    delete project.version
    expect(() => editLiveProject(project, '核实', false, 'key')).toThrow('版本缺失')
    project.version = 0
    expect(() => editLiveProject(project, ' ', false, 'key')).toThrow('修改原因')
    expect(api).not.toHaveBeenCalled()
  })
})
