<template>
  <div v-if="store.snapshot?.scenario === 'save-error'" class="mb-4">
    <ElButton :disabled="store.saving" @click="recover">恢复正常并保留输入</ElButton>
    <ElAlert v-if="error" class="mt-2" :title="error" type="error" :closable="false" />
  </div>
</template>
<script setup lang="ts">
  import { ref } from 'vue'
  import { usePrototypeStore } from '@/store/modules/prototype'
  const store = usePrototypeStore()
  const error = ref('')
  function recover() {
    try {
      store.setScenario('normal')
      error.value = ''
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '恢复失败，请重试'
    }
  }
</script>
