import { onBeforeUnmount, watch, type Ref } from 'vue'
import { ElMessageBox } from 'element-plus'
import { usePrototypeStore } from '@/store/modules/prototype'
let formSequence = 0

export function useUnsavedForm(key: string, dirty: Ref<boolean>, busy: Ref<boolean>) {
  key = `${key}-${++formSequence}`
  const store = usePrototypeStore()
  watch(dirty, (value) => store.setDirty(key, value), { immediate: true })
  onBeforeUnmount(() => store.setDirty(key, false))
  async function beforeClose(done: () => void): Promise<void> {
    if (busy.value) return
    if (dirty.value) {
      try {
        await ElMessageBox.confirm('尚有未保存的内容，关闭后会丢失。', '放弃本次修改？', {
          confirmButtonText: '放弃修改',
          cancelButtonText: '继续编辑',
          type: 'warning'
        })
      } catch {
        return
      }
    }
    store.setDirty(key, false)
    done()
  }
  return { beforeClose }
}
