import { expect, it } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { useRetainedSelection } from './use-retained-selection'
it('外部更新反映最新记录，删除保留当前编辑对象，关闭后释放', async () => {
  const scope = effectScope(), id = ref('a'), rows = ref([{ id: 'a', version: 1 }])
  const selected = scope.run(() => useRetainedSelection(() => id.value, () => rows.value))!
  expect(selected.value?.version).toBe(1)
  rows.value = [{ id: 'a', version: 2 }]; await nextTick()
  expect(selected.value?.version).toBe(2)
  rows.value = []; await nextTick()
  expect(selected.value?.version).toBe(2)
  id.value = 'b'; await nextTick(); expect(selected.value).toBeUndefined()
  id.value = 'a'; rows.value = [{ id: 'a', version: 3 }]; await nextTick()
  id.value = ''; await nextTick(); expect(selected.value).toBeUndefined()
  scope.stop()
})
