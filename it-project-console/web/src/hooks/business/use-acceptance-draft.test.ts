import { describe, expect, it } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { fresh } from '@/services/workflow-fixtures'
import { useAcceptanceDraft } from './use-acceptance-draft'

describe('验收草稿与 workspace 刷新', () => {
  it('计划保存替换完整项目对象后保留全部草稿及原版本，重新确认才解除冲突', async () => {
    const scope = effectScope()
    const p = ref({ ...fresh().database.projects[0], version: 5 })
    const actor = ref({ id: p.value.primaryOwnerId })
    const draft = scope.run(() =>
      useAcceptanceDraft(
        () => p.value,
        () => actor.value.id
      )
    )!
    draft.summary.value = '第一轮交付：请检查导出与查询功能'
    draft.url.value = 'https://example.com/acceptance'
    draft.assignReason.value = '替换业务负责人'
    draft.opinion.value = '业务意见草稿'
    draft.withdrawReason.value = '撤回原因草稿'
    await nextTick()
    // 复现真实 refreshLive：snapshot/project/user 全对象替换，身份 ID 未变。
    p.value = { ...p.value, version: 6, expectedDeliveryDate: '2099-10-11' }
    actor.value = { ...actor.value }
    await nextTick()
    expect(draft.summary.value).toBe('第一轮交付：请检查导出与查询功能')
    expect(draft.url.value).toBe('https://example.com/acceptance')
    expect(draft.assignReason.value).toBe('替换业务负责人')
    expect(draft.opinion.value).toBe('业务意见草稿')
    expect(draft.withdrawReason.value).toBe('撤回原因草稿')
    expect(draft.baselineVersion.value).toBe(5)
    expect(draft.staleDraft.value).toBe(true)
    draft.baselineVersion.value = p.value.version
    expect(draft.staleDraft.value).toBe(false)
    expect(draft.dirty.value).toBe(true)
    scope.stop()
  })
  it('无草稿自动跟新版本，明确保存后清草稿，切换身份不泄露原身份编辑', async () => {
    const scope = effectScope()
    const p = ref({ ...fresh().database.projects[0], version: 2, acceptanceSummary: '旧交付' })
    const actor = ref('engineer')
    const draft = scope.run(() =>
      useAcceptanceDraft(
        () => p.value,
        () => actor.value
      )
    )!
    p.value = { ...p.value, version: 3, acceptanceSummary: '服务器新交付' }
    await nextTick()
    expect(draft.summary.value).toBe('服务器新交付')
    expect(draft.staleDraft.value).toBe(false)
    draft.summary.value = '私人草稿'
    actor.value = 'business'
    await nextTick()
    expect(draft.summary.value).toBe('服务器新交付')
    draft.opinion.value = '验收通过'
    draft.resetForm()
    expect(draft.opinion.value).toBe('')
    expect(draft.dirty.value).toBe(false)
    scope.stop()
  })
})
