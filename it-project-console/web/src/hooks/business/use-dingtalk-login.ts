import { ref } from 'vue'
import { fetchDingTalkConfig, loginDingTalkH5, type DingTalkConfig } from '@/services/dingtalk-auth'
import { isDesktopDingTalk, requestDingTalkCode } from '@/utils/dingtalk/runtime'
import { isSupportedDevice } from '@/utils/device'

export function useDingTalkLogin(onAuthenticated: () => Promise<void>) {
  const busy = ref(false)
  const error = ref('')
  const config = ref<DingTalkConfig | null>(null)
  let controller: AbortController | undefined

  function cancel() {
    controller?.abort()
    controller = undefined
    busy.value = false
  }
  async function start(autoLogin = true) {
    if (busy.value || !isSupportedDevice()) return
    const request = new AbortController()
    controller = request
    busy.value = true
    error.value = ''
    try {
      const settings = await fetchDingTalkConfig(request.signal)
      request.signal.throwIfAborted()
      config.value = settings
      if (!settings.enabled || !settings.clientId || !settings.corpId) {
        throw new Error('企业登录尚未配置，请联系管理员')
      }
      if (autoLogin && isDesktopDingTalk(window.navigator.userAgent)) {
        const code = await requestDingTalkCode(settings, request.signal)
        request.signal.throwIfAborted()
        if (!isSupportedDevice()) return
        await loginDingTalkH5(code, request.signal)
        request.signal.throwIfAborted()
        if (isSupportedDevice()) await onAuthenticated()
      }
    } catch (cause) {
      if (!request.signal.aborted)
        error.value = cause instanceof Error ? cause.message : '登录失败，请重试'
    } finally {
      if (controller === request) {
        busy.value = false
        controller = undefined
      }
    }
  }
  return { busy, error, config, start, cancel }
}
