import { expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import type { DemoDemand } from '@/domain/prototype'
import { useDemandDeepLink } from './use-demand-deep-link'
import { createInitialPrototypeSnapshot } from '@/mocks/seed'

it('需求深链复用当前可读数据打开详情，关闭移除query', () => {
  const scope = effectScope()
  const demand = createInitialPrototypeSnapshot().database.demands[0]!
  const detail = ref<DemoDemand>()
  const remove = vi.fn()
  const state = scope.run(() =>
    useDemandDeepLink(
      () => demand.id,
      () => [demand],
      detail,
      remove
    )
  )!
  expect(detail.value?.id).toBe(demand.id)
  state.closeDetail()
  expect(detail.value).toBeUndefined()
  expect(remove).toHaveBeenCalledOnce()
  scope.stop()
})
it('未知或已失权需求清空详情，不向其他查询暴露数据', async () => {
  const scope = effectScope()
  const demand = createInitialPrototypeSnapshot().database.demands[0]!
  const readable = ref([demand])
  const id = ref<unknown>(demand.id)
  const detail = ref<DemoDemand>()
  const state = scope.run(() =>
    useDemandDeepLink(
      () => id.value,
      () => readable.value,
      detail,
      vi.fn()
    )
  )!
  readable.value = []
  await nextTick()
  expect(detail.value).toBeUndefined()
  expect(state.deepLinkError.value).toContain('无权查看')
  id.value = [demand.id, 'other']
  await nextTick()
  expect(detail.value).toBeUndefined()
  scope.stop()
})
