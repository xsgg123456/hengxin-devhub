import { onScopeDispose, watch } from 'vue'
import { runtimeConfig } from '@/config/runtime'
import { apiRequest } from '@/services/api-client'
import { usePrototypeStore } from '@/store/modules/prototype'

// 每个前台应用只有一个连接；事件仅作失效通知，数据仍由鉴权接口读取。
export function useWorkspaceSync() {
  const store = usePrototypeStore()
  let dispose = () => {}
  function restart() {
    dispose()
    dispose = () => {}
    if (runtimeConfig.isPrototype || !store.ready || store.authRequired ||
      document.visibilityState === 'hidden' || !navigator.onLine) return
    let stopped = false, running = false, pending = false
    let known = '', wanted = '', force = false
    const controller = new AbortController()
    async function refresh(revision = '', unconditional = false) {
      if (stopped) return
      wanted = revision || wanted
      force ||= unconditional
      pending = true
      if (running) return
      running = true
      try {
        while (pending && !stopped) {
          pending = false
          const target = wanted, mustRefresh = force
          force = false
          if (!mustRefresh && target === known) continue
          try {
            await store.refreshLive({ background: true, signal: controller.signal })
            if (!stopped) known = target
          } catch { /* 保留页面，下一事件或兜底重试。 */ }
        }
      } finally { running = false }
    }
    const source = new EventSource(`${runtimeConfig.apiBaseUrl.replace(/\/$/, '')}/workspace/events`, { withCredentials: true })
    source.addEventListener('change', event => {
      try {
        const value: unknown = JSON.parse((event as MessageEvent<string>).data)
        if (value && typeof value === 'object' && 'revision' in value && typeof value.revision === 'string')
          void refresh(value.revision)
      } catch { /* 损坏事件交由定时版本检查恢复。 */ }
    })
    source.addEventListener('open', () => { void refresh('', true) })
    source.addEventListener('session-expired', () => {
      source.close()
      window.dispatchEvent(new Event('itpc-session-expired'))
    })
    let checking = false
    async function check() {
      if (stopped || checking) return
      checking = true
      try {
        const result = await apiRequest<{ revision: string }>('/workspace/revision', {
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)])
        })
        if (!stopped && typeof result.revision === 'string') await refresh(result.revision)
      } catch { /* 短暂断网不关闭已有内容。 */ }
      finally { checking = false }
    }
    const timer = setInterval(() => { void check() }, 30000)
    void refresh('', true)
    dispose = () => { stopped = true; source.close(); controller.abort(); clearInterval(timer) }
  }
  watch([() => store.ready, () => store.authRequired, () => store.currentUser.id], restart, { immediate: true })
  document.addEventListener('visibilitychange', restart)
  window.addEventListener('online', restart)
  window.addEventListener('offline', restart)
  window.addEventListener('focus', restart)
  onScopeDispose(() => {
    dispose()
    document.removeEventListener('visibilitychange', restart)
    window.removeEventListener('online', restart)
    window.removeEventListener('offline', restart)
    window.removeEventListener('focus', restart)
  })
}
