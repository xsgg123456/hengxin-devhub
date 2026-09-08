<template>
  <div>
    <PrototypeState v-if="PrototypeState"><slot /></PrototypeState>
    <template v-else>
      <ElAlert
        v-if="store.loadError"
        :title="store.loadError"
        type="error"
        :closable="false"
        class="mb-4"
      >
        <ElButton
          :disabled="store.saving || store.uploading || store.hasUnsavedChanges"
          @click="refresh"
          >刷新数据</ElButton
        >
      </ElAlert>
      <slot />
    </template>
  </div>
</template>
<script setup lang="ts">
  import { defineAsyncComponent } from 'vue'
  import { usePrototypeStore } from '@/store/modules/prototype'
  const store = usePrototypeStore()
  const PrototypeState =
    import.meta.env.MODE === 'prototype'
      ? defineAsyncComponent(() => import('./prototype-page-state.vue'))
      : null
  async function refresh() {
    try {
      await store.refreshLive()
    } catch {
      /* store exposes retry feedback */
    }
  }
</script>
