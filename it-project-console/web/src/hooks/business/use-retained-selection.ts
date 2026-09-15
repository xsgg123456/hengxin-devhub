import { shallowRef, watch } from 'vue'

// 外部删除记录不能卸载仍在编辑的抽屉；关闭/更换选择才释放副本。
export function useRetainedSelection<T extends { id: string }>(id: () => string, records: () => T[]) {
  const selected = shallowRef<T>()
  watch([id, records], ([key, rows]) => {
    if (!key) { selected.value = undefined; return }
    selected.value = rows.find(row => row.id === key) ?? (selected.value?.id === key ? selected.value : undefined)
  }, { immediate: true })
  return selected
}
