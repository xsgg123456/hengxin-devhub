<template>
  <div class="w-full">
    <ElRadioGroup v-model="mode" class="mb-2" :disabled="disabled" @change="clear">
      <ElRadioButton value="link">HTTPS 链接</ElRadioButton>
      <ElRadioButton value="file">模拟文件</ElRadioButton>
    </ElRadioGroup>
    <ElInput
      v-if="mode === 'link'"
      :model-value="modelValue?.url || ''"
      :disabled="disabled"
      placeholder="https://"
      @update:model-value="setLink"
    />
    <template v-else>
      <ElUpload
        :auto-upload="false"
        :show-file-list="false"
        :accept="accept"
        :disabled="disabled"
        :on-change="selectFile"
      >
        <ElButton :disabled="disabled">{{
          modelValue ? '重新选择文件' : '选择文件（仅模拟）'
        }}</ElButton>
      </ElUpload>
      <div v-if="modelValue" class="mt-2 flex items-center gap-2 flex-wrap">
        <span class="break-all"
          >{{ modelValue.name }} · {{ ((modelValue.size || 0) / 1024).toFixed(1) }} KB</span
        >
        <ElTag size="small" type="info">元数据已选择 · 未上传</ElTag>
        <ElButton link type="danger" :disabled="disabled" @click="clear">移除</ElButton>
      </div>
      <p class="mt-2 text-xs text-g-500"
        >{{ accept }}；单文件 ≤20 MB，单需求合计 ≤50 MB。只保存元数据，不上传或保存文件内容。</p
      >
    </template>
    <p v-if="error" class="text-danger text-xs mt-1" role="alert">{{ error }}</p>
  </div>
</template>
<script setup lang="ts">
  import { computed, ref } from 'vue'
  import type { UploadFile } from 'element-plus'
  import type { DemoAttachment } from '@/domain/prototype'
  import { validateAttachment } from '@/services/workflow-service'
  const props = defineProps<{
    modelValue: DemoAttachment | null
    type: 'prd' | 'prototype'
    disabled?: boolean
  }>()
  const emit = defineEmits<{ 'update:modelValue': [value: DemoAttachment | null] }>()
  const mode = ref(props.modelValue?.kind || 'link')
  const error = ref('')
  const accept = computed(() => (props.type === 'prd' ? '.pdf,.doc,.docx' : '.html,.zip'))
  function clear() {
    error.value = ''
    emit('update:modelValue', null)
  }
  function setLink(url: string) {
    error.value = ''
    emit(
      'update:modelValue',
      url
        ? {
            kind: 'link',
            name: props.type === 'prd' ? 'PRD 文档' : 'HTML 原型',
            url,
            status: 'ready'
          }
        : null
    )
  }
  function selectFile(file: UploadFile) {
    const material: DemoAttachment = {
      kind: 'file',
      name: file.name,
      size: file.size || 0,
      mime: file.raw?.type,
      status: 'ready'
    }
    try {
      validateAttachment(material, props.type)
      error.value = ''
      emit('update:modelValue', material)
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '文件校验失败，请重新选择'
    }
  }
</script>
