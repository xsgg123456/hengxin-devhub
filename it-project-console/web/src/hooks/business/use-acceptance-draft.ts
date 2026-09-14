import { computed, ref, watch } from 'vue'
import type { DemoProject } from '@/domain/prototype'

// 草稿属于项目及编辑身份；workspace 刷新替换对象不等于更换编辑对象。
export function useAcceptanceDraft(project: () => DemoProject, actorId: () => string) {
  const baselineVersion = ref(project().version ?? 0)
  const baseline = ref({ ownerId: '', summary: '', url: '' })
  const ownerId = ref(''),
    assignReason = ref(''),
    summary = ref(''),
    url = ref('')
  const opinion = ref(''),
    withdrawReason = ref(''),
    error = ref('')
  const staleDraft = computed(() => baselineVersion.value !== (project().version ?? 0))
  const dirty = computed(() =>
    Boolean(
      assignReason.value ||
      opinion.value ||
      withdrawReason.value ||
      ownerId.value !== baseline.value.ownerId ||
      summary.value !== baseline.value.summary ||
      url.value !== baseline.value.url
    )
  )
  function resetForm() {
    const current = project()
    ownerId.value = current.acceptanceOwnerId ?? ''
    summary.value = current.acceptanceSummary ?? ''
    url.value = current.acceptanceUrl ?? ''
    baseline.value = { ownerId: ownerId.value, summary: summary.value, url: url.value }
    baselineVersion.value = current.version ?? 0
    assignReason.value = opinion.value = withdrawReason.value = error.value = ''
  }
  watch([() => project().id, actorId], resetForm, { immediate: true })
  watch([() => project().version, () => project().acceptanceOwnerId], () => {
    if (!dirty.value) resetForm()
  })
  return {
    baselineVersion,
    staleDraft,
    ownerId,
    assignReason,
    summary,
    url,
    opinion,
    withdrawReason,
    error,
    dirty,
    resetForm
  }
}
