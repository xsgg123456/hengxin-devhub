<template>
  <div class="space-y-3">
    <div v-for="item in materials" :key="item.label">
      <p class="text-sm text-g-500 mb-1">{{ item.label }}</p>
      <ElLink
        v-if="item.material?.kind === 'link' && safeLink(item.material.url)"
        :href="item.material.url"
        target="_blank"
        rel="noopener noreferrer"
        type="primary"
        class="break-all"
        >{{ item.material.url }}</ElLink
      >
      <p v-else-if="item.material?.kind === 'file'" class="break-all"
        >{{ item.material.name }} <ElTag type="info" size="small">模拟文件 · 未上传</ElTag></p
      >
      <span v-else class="text-g-500">未提供有效材料</span>
    </div>
  </div>
</template>
<script setup lang="ts">
  import { computed } from 'vue'
  import type { DemoDemand } from '@/domain/prototype'
  const props = defineProps<{ demand: DemoDemand }>()
  const materials = computed(() => [
    { label: 'PRD 文档', material: props.demand.prd },
    { label: 'HTML 原型', material: props.demand.prototype }
  ])
  function safeLink(url?: string) {
    try {
      return new URL(url || '').protocol === 'https:'
    } catch {
      return false
    }
  }
</script>
