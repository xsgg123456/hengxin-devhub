<template>
  <div class="business-page-state">
    <div v-if="scenario !== 'normal'" class="scenario-banner">
      <ElTag size="small" type="info">场景模拟 · {{ selected?.label }}</ElTag>
      <span>{{ selected?.description }}</span>
      <ElButton size="small" :disabled="store.saving" @click="recover">恢复正常</ElButton>
    </div>
    <ElAlert v-if="error" :title="error" type="error" :closable="false" class="mb-4" />
    <div v-if="scenario === 'loading'" class="art-card p-5" role="status">
      <ElSkeleton :rows="8" animated /><p class="mt-4 text-sm text-g-500">正在加载…</p>
    </div>
    <div v-else-if="scenario === 'forbidden' || scenario === 'network-error'" class="art-card p-5">
      <ElResult
        :icon="scenario === 'forbidden' ? 'warning' : 'error'"
        :title="scenario === 'forbidden' ? '当前场景无查看权限' : '模拟网络错误，数据加载失败'"
        sub-title="已保存数据保留。点击恢复正常后可继续当前页面。"
      />
    </div>
    <div v-else :key="scenario === 'empty' ? 'empty' : 'content'"><slot /></div>
  </div>
</template>
<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { PROTOTYPE_SCENARIOS } from '@/mocks/scenarios'
  import { usePrototypeStore } from '@/store/modules/prototype'
  const store = usePrototypeStore()
  const error = ref('')
  const scenario = computed(() => store.snapshot?.scenario ?? 'normal')
  const selected = computed(() => PROTOTYPE_SCENARIOS.find((item) => item.value === scenario.value))
  function recover() {
    try {
      store.setScenario('normal')
      error.value = ''
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '恢复失败，请重试'
    }
  }
</script>
<style scoped>
  .scenario-banner {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    margin-bottom: 16px;
    font-size: 12px;
    color: var(--art-gray-600);
  }
</style>
