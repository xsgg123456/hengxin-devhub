import type { ComputedRef, Ref } from 'vue'
import type { AcceptanceAction, DemoProject } from '@/domain/prototype'
import { usePrototypeStore } from '@/store/modules/prototype'
import { actionAcceptance, actionLiveAcceptance } from '@/services/acceptance-service'
import { runtimeConfig } from '@/config/runtime'
import { ApiError } from '@/services/api-client'
import { liveOperationKey } from '@/services/live-demand-service'
import { ElMessage, ElMessageBox } from 'element-plus'
import { deliveryHref } from '@/utils/delivery-url'

type AcceptanceActionParams = {
  project: () => DemoProject
  store: ReturnType<typeof usePrototypeStore>
  baselineVersion: Ref<number>
  projectMissing: ComputedRef<boolean>
  staleDraft: ComputedRef<boolean>
  ownerId: Ref<string>
  assignReason: Ref<string>
  summary: Ref<string>
  url: Ref<string>
  opinion: Ref<string>
  withdrawReason: Ref<string>
  error: Ref<string>
  saveNotice: Ref<string>
  resetForm: () => void
}

export function useAcceptanceAction(params: AcceptanceActionParams) {
  let operationKey = liveOperationKey()

  async function save(action: AcceptanceAction) {
    const {
      project, store, baselineVersion, projectMissing, staleDraft,
      assignReason, summary, url, opinion, withdrawReason, error, saveNotice, resetForm
    } = params
    if (projectMissing.value) {
      error.value = '项目已被删除或移除，验收草稿已保留，无法提交验收'
      return
    }
    if (staleDraft.value) return
    error.value = ''
    saveNotice.value = ''
    const text = (action === 'assign' ? assignReason.value : action === 'submit' ? summary.value :
      action === 'withdraw' ? withdrawReason.value : opinion.value).trim()
    if (action !== 'accept' && !text) {
      error.value = '请填写说明或原因'
      return
    }
    if (action === 'assign' && !params.ownerId.value) {
      error.value = '请选择业务验收负责人'
      return
    }
    if (action === 'submit' && deliveryHref(url.value) === null) {
      error.value = '请输入有效网页地址，支持HTTP/HTTPS和内网地址，请勿包含账号密码'
      return
    }
    const input = {
      projectId: project().id,
      version: baselineVersion.value,
      action,
      summary: text,
      ...(action === 'assign' ? { ownerId: params.ownerId.value } : {}),
      ...(action === 'submit' ? { url: url.value.trim() } : {})
    }
    const command = { ...input, requestId: operationKey(input) }
    if (action === 'withdraw') {
      try {
        await ElMessageBox.confirm(
          `撤回「${project().name}」后，当前业务验收待办将失效。`,
          '撤回验收？',
          { confirmButtonText: '确认撤回验收', cancelButtonText: '继续验收', type: 'warning' }
        )
      } catch {
        return
      }
    }
    try {
      if (runtimeConfig.isPrototype) await store.runCommand((draft) => { actionAcceptance(draft, command) })
      else await store.runLiveCommand(() => actionLiveAcceptance(command))
      operationKey = liveOperationKey()
      resetForm()
      saveNotice.value = ''
      ElMessage.success('验收操作已保存')
    } catch (cause) {
      if (cause instanceof ApiError && (cause.status === 0 || cause.status >= 500)) {
        let refreshed = await store.refreshLive()
        if (refreshed.status === 'superseded') refreshed = await store.refreshLive()
        if (refreshed.status === 'applied') {
          const current = store.visibleProjects.find((item) => item.id === project().id)
          const committed = current?.acceptanceHistory?.some((item) =>
            item.requestId === command.requestId && item.action === action)
          if (committed) {
            resetForm()
            saveNotice.value = '网络响应异常，但本次验收已保存，页面已同步当前状态。'
            return
          }
        }
      }
      error.value = cause instanceof Error ? cause.message : '保存失败，请重试'
      if (cause instanceof ApiError && cause.status === 409) {
        await store.refreshLive().catch(() => undefined)
        error.value += '；已尝试刷新项目，草稿已保留，请核对后重试'
      }
    }
  }

  return { save }
}
