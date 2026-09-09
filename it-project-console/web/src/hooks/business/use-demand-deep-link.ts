import { ref, watch, type Ref } from 'vue'
import type { DemoDemand } from '@/domain/prototype'

export function useDemandDeepLink(
  queryId: () => unknown,
  readableDemands: () => DemoDemand[],
  detail: Ref<DemoDemand | undefined>,
  removeQuery: () => void
) {
  const deepLinkError = ref('')
  watch(
    [queryId, readableDemands],
    ([id, demands]) => {
      deepLinkError.value = ''
      if (id === undefined) return
      detail.value = typeof id === 'string' ? demands.find((demand) => demand.id === id) : undefined
      if (!detail.value) deepLinkError.value = '该需求不存在或你已无权查看，请联系管理员'
    },
    { immediate: true }
  )
  function closeDetail() {
    detail.value = undefined
    deepLinkError.value = ''
    if (queryId() !== undefined) removeQuery()
  }
  return { deepLinkError, closeDetail }
}
