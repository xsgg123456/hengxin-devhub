import { onScopeDispose, ref, shallowRef, watch, type WatchSource } from 'vue'
import { runtimeConfig } from '@/config/runtime'
import { apiRequest } from '@/services/api-client'
import { usePrototypeStore } from '@/store/modules/prototype'

export type QueryParams = Record<string, string | number | boolean | undefined>
export function queryString(params: QueryParams) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params))
    if (value !== undefined && value !== '') search.set(key, String(value))
  return search.toString()
}

// 筛选变化先失效旧请求，旧响应不能覆盖新范围；生产失败不回退原型计算。
export function useLiveQuery<T>(path: string, params: WatchSource<QueryParams>) {
  const store = usePrototypeStore()
  const data = shallowRef<T>()
  const loading = ref(false)
  const error = ref('')
  const retryVersion = ref(0)
  watch(
    [params, () => store.snapshot?.revision, retryVersion],
    (_, __, cleanup) => {
      if (runtimeConfig.isPrototype) return
      data.value = undefined
      error.value = ''
      if (!store.ready || store.authRequired) {
        loading.value = false
        return
      }
      loading.value = true
      let current = true
      const controller = new AbortController()
      const timer = setTimeout(async () => {
        try {
          const result = await apiRequest<T>(
            `${path}?${queryString(typeof params === 'function' ? params() : params.value)}`,
            {
              signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)])
            }
          )
          if (current) data.value = result
        } catch (cause) {
          if (current) error.value = cause instanceof Error ? cause.message : '数据加载失败，请重试'
        } finally {
          if (current) loading.value = false
        }
      }, 180)
      cleanup(() => {
        current = false
        clearTimeout(timer)
        controller.abort()
      })
    },
    { immediate: true, deep: true }
  )
  onScopeDispose(() => {
    loading.value = false
  })
  return {
    data,
    loading,
    error,
    retry: () => {
      retryVersion.value++
    }
  }
}
