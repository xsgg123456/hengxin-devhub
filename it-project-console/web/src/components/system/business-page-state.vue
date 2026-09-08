<template>
  <div class="business-page-state">
    <div v-if="store.snapshot?.scenario === 'loading'" class="art-card p-5" role="status"
      ><ElSkeleton :rows="8" animated /><p class="mt-4 text-sm text-g-500">正在加载…</p></div
    >
    <div v-else-if="store.snapshot?.scenario === 'forbidden'" class="art-card p-5"
      ><ElResult
        icon="warning"
        title="当前场景无查看权限"
        sub-title="可从顶部重置演示数据，恢复初始场景。"
    /></div>
    <slot v-else />
  </div>
</template>
<script setup lang="ts">
  import { usePrototypeStore } from '@/store/modules/prototype'
  const store = usePrototypeStore()
</script>
