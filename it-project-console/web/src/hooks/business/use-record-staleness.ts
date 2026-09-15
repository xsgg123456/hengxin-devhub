import { computed } from 'vue'
import { runtimeConfig } from '@/config/runtime'
import { usePrototypeStore } from '@/store/modules/prototype'

export function useRecordStaleness(kind: 'project' | 'demand' | 'proposal', id: () => string | undefined, version: () => number | undefined) {
  const store = usePrototypeStore()
  return computed(() => {
    if (runtimeConfig.isPrototype || !id() || version() === undefined) return ''
    const records = kind === 'project' ? store.visibleProjects : kind === 'demand' ? store.visibleDemands : store.database?.projectProposals ?? []
    const latest = records.find(record => record.id === id())
    if (!latest) return '记录已移除或无法访问；填写内容已保留，请关闭后核对。'
    return latest.version !== version()
      ? '记录已被更新；填写内容已保留，请复制需要保留的内容，关闭后重新打开核对。' : ''
  })
}
