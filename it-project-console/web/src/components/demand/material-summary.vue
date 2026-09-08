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
        >{{ item.material.name }}
        <ElTag v-if="runtimeConfig.isPrototype" type="info" size="small">模拟文件 · 未上传</ElTag>
        <ElButton
          v-else-if="item.material.attachmentId"
          link
          type="primary"
          :loading="downloading === item.material.attachmentId"
          @click="download(item.material.attachmentId)"
          >下载文件</ElButton
        ></p
      >
      <span v-else class="text-g-500">未提供有效材料</span>
    </div>
  </div>
</template>
<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { ElMessage } from 'element-plus'
  import { runtimeConfig } from '@/config/runtime'
  import { downloadLiveMaterial } from '@/services/live-material-service'
  import type { DemoDemand } from '@/domain/prototype'
  const downloading = ref('')
  async function download(id: string) {
    if (downloading.value) return
    downloading.value = id
    try {
      await downloadLiveMaterial(id)
    } catch (cause) {
      ElMessage.error(cause instanceof Error ? cause.message : '下载失败，请重试')
    } finally {
      downloading.value = ''
    }
  }
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
