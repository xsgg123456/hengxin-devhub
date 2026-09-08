import { beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, reactive } from 'vue'
import type { FormInstance } from 'element-plus'
import { ApiError } from '@/services/api-client'
import type { DemoProject } from '@/domain/prototype'
import { useProgressForm } from './use-progress-form'
const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  correct: vi.fn(),
  runCommand: vi.fn(),
  refresh: vi.fn(),
  store: {
    currentUser: { id: 'owner', role: 'engineer' },
    visibleProjects: [] as DemoProject[],
    database: { stageHistories: [] }
  }
}))
vi.mock('@/config/runtime', () => ({ runtimeConfig: { isPrototype: false } }))
vi.mock('element-plus', () => ({ ElMessage: { success: vi.fn() } }))
vi.mock('@/hooks/business/use-unsaved-form', () => ({
  useUnsavedForm: () => ({ beforeClose: vi.fn() })
}))
vi.mock('@/store/modules/prototype', () => ({
  usePrototypeStore: () => ({
    ...mocks.store,
    runCommand: mocks.runCommand,
    runLiveCommand: (fn: () => Promise<unknown>) => fn(),
    refreshLive: mocks.refresh
  })
}))
vi.mock('@/services/live-project-service', async (original) => ({
  ...(await original<typeof import('@/services/live-project-service')>()),
  updateLiveProgress: mocks.update,
  correctLiveProject: mocks.correct
}))
const project: DemoProject = {
  id: 'p1',
  requestId: 'test-create',
  name: '项目',
  version: 1,
  department: 'IT',
  source: 'direct',
  demandId: null,
  primaryOwnerId: 'owner',
  collaboratorIds: ['helper'],
  priority: 'P1',
  status: 'active',
  stage: '方案设计',
  simpleStatus: 'in-progress',
  overallProgress: 20,
  archived: false,
  originalLaunchDate: '2027-01-01',
  expectedLaunchDate: '2027-01-01',
  originalDeliveryDate: '2027-02-01',
  expectedDeliveryDate: '2027-02-01',
  stageExpectedDate: '2026-12-01',
  blocker: '',
  risks: [],
  createdAt: '',
  updatedAt: '',
  lastOverallUpdatedAt: ''
}
async function openForm() {
  const scope = effectScope()
  const props = reactive({ modelValue: false, project: { ...project } })
  const emit = vi.fn()
  const form = scope.run(() => useProgressForm(props, emit))!
  props.modelValue = true
  await nextTick()
  form.formRef.value = { validate: vi.fn().mockResolvedValue(true) } as unknown as FormInstance
  form.form.value.summary = '已完成接口设计'
  return { form, props, emit, scope }
}
describe('真实进度表单状态', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.store.currentUser = { id: 'owner', role: 'engineer' }
    mocks.store.visibleProjects = [{ ...project, version: 2 }]
    mocks.refresh.mockResolvedValue(undefined)
  })
  it('网络失败保留输入、相同请求键重试，成功才关闭', async () => {
    const { form, emit, scope } = await openForm()
    mocks.update.mockRejectedValueOnce(new Error('断网'))
    await form.save()
    expect(form.form.value.summary).toBe('已完成接口设计')
    expect(form.busy.value).toBe(false)
    expect(emit).not.toHaveBeenCalled()
    await form.save()
    expect(mocks.update.mock.calls[0]).toEqual(mocks.update.mock.calls[1])
    expect(emit).toHaveBeenCalledWith('update:modelValue', false)
    expect(mocks.runCommand).not.toHaveBeenCalled()
    scope.stop()
  })
  it('409刷新版本且不重置输入，下次明确保存使用新版本和键', async () => {
    const { form, scope } = await openForm()
    mocks.update.mockRejectedValueOnce(new ApiError('版本冲突', 409))
    await form.save()
    expect(mocks.refresh).toHaveBeenCalledOnce()
    expect(form.form.value.summary).toBe('已完成接口设计')
    await form.save()
    expect(mocks.update.mock.calls[0]?.[1]).toBe(1)
    expect(mocks.update.mock.calls[1]?.[1]).toBe(2)
    expect(mocks.update.mock.calls[0]?.[2]).not.toBe(mocks.update.mock.calls[1]?.[2])
    scope.stop()
  })
  it('协作只发送个人进展和阻塞，即使表单意外残留整体字段', async () => {
    mocks.store.currentUser = { id: 'helper', role: 'engineer' }
    const { form, scope } = await openForm()
    form.form.value.overallProgress = 100
    form.blocked.value = true
    form.form.value.blocker = '等待主责联调'
    await form.save()
    expect(mocks.update.mock.calls[0]?.[0]).toEqual({
      projectId: 'p1',
      kind: 'personal',
      summary: '已完成接口设计',
      status: 'blocked',
      blocker: '等待主责联调'
    })
    scope.stop()
  })
})
