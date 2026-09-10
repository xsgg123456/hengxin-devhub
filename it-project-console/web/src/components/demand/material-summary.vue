<template>
  <div class="space-y-3">
    <h4 class="text-sm text-g-500">需求附件 · {{ materials.length }}</h4>
    <p v-if="!materials.length" class="text-g-500">暂无附件</p>
    <div v-for="(material, index) in materials" :key="material.attachmentId || material.url || index">
      <ElLink
        v-if="material.kind === 'link' && safeLink(material.url)"
        :href="material.url"
        target="_blank"
        rel="noopener noreferrer"
        type="primary"
        class="break-all"
        >历史链接 · {{ material.url }}</ElLink
      >
      <p v-else-if="material.kind === 'file'" class="break-all"
        >{{ material.name }}
        <span v-if="material.size" class="text-xs text-g-500 ml-2">{{ formatSize(material.size) }}</span>
        <ElTag v-if="runtimeConfig.isPrototype" type="info" size="small">模拟文件 · 未上传</ElTag>
        <ElButton
          v-else-if="material.attachmentId"
          link
          type="primary"
          :loading="downloading === material.attachmentId"
          @click="download(material.attachmentId)"
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
  import { demandMaterials } from '@/services/demand-materials'
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
  const materials = computed(() => demandMaterials(props.demand))
  const formatSize = (size: number) => size >= 1024 * 1024
    ? `${(size / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(size / 1024)} KB`
  function safeLink(url?: string) {
    try {
      return new URL(url || '').protocol === 'https:'
    } catch {
      return false
    }
  }
</script>
