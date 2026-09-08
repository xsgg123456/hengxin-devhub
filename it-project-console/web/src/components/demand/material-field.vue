<template>
  <div class="w-full">
    <ElRadioGroup
      :model-value="mode"
      class="mb-2"
      :disabled="disabled || working"
      @update:model-value="changeMode"
    >
      <ElRadioButton value="link">HTTPS 链接</ElRadioButton>
      <ElRadioButton value="file">{{
        runtimeConfig.isPrototype ? '模拟文件' : '上传文件'
      }}</ElRadioButton>
    </ElRadioGroup>
    <ElInput
      v-if="mode === 'link'"
      :model-value="modelValue?.url || ''"
      :disabled="disabled || working"
      placeholder="https://"
      @update:model-value="setLink"
    />
    <template v-else>
      <ElUpload
        :auto-upload="false"
        :show-file-list="false"
        :accept="accept"
        :disabled="disabled || working"
        :on-change="selectFile"
      >
        <ElButton :disabled="disabled || working">{{
          modelValue
            ? '重新选择文件'
            : runtimeConfig.isPrototype
              ? '选择文件（仅模拟）'
              : '选择文件'
        }}</ElButton>
      </ElUpload>
      <div v-if="modelValue" class="mt-2 flex items-center gap-2 flex-wrap">
        <span class="break-all"
          >{{ modelValue.name }} · {{ ((modelValue.size || 0) / 1024).toFixed(1) }} KB</span
        >
        <ElTag size="small" type="info">{{
          runtimeConfig.isPrototype
            ? '元数据已选择 · 未上传'
            : uploading
              ? '上传中…'
              : modelValue.status === 'ready'
                ? '已上传'
                : '上传失败'
        }}</ElTag>
        <ElButton
          v-if="!runtimeConfig.isPrototype && rawFile && modelValue.status === 'failed'"
          link
          type="primary"
          :disabled="disabled || working"
          @click="upload"
          >重试上传</ElButton
        >
        <ElButton link type="danger" :disabled="disabled || working" @click="clear">移除</ElButton>
      </div>
      <p class="mt-2 text-xs text-g-500"
        >{{ accept }}；单文件 ≤20 MB，单需求合计 ≤50 MB。{{
          runtimeConfig.isPrototype
            ? '只保存元数据，不上传或保存文件内容。'
            : '文件上传成功后可保存需求。'
        }}</p
      >
    </template>
    <p v-if="error" class="text-danger text-xs mt-1" role="alert">{{ error }}</p>
  </div>
</template>
<script setup lang="ts">
  import { computed, ref, onBeforeUnmount } from 'vue'
  import { runtimeConfig } from '@/config/runtime'
  import { uploadLiveMaterial, createMaterialCleanup } from '@/services/live-material-service'
  import { usePrototypeStore } from '@/store/modules/prototype'
  import type { UploadFile } from 'element-plus'
  import type { DemoAttachment } from '@/domain/prototype'
  import { validateAttachment } from '@/services/workflow-service'
  const props = defineProps<{
    modelValue: DemoAttachment | null
    type: 'prd' | 'prototype'
    disabled?: boolean
    ensureDemand?: () => Promise<string>
  }>()
  const emit = defineEmits<{
    'update:modelValue': [value: DemoAttachment | null]
    busy: [value: boolean]
  }>()
  const store = usePrototypeStore()
  const uploading = ref(false)
  const cleaning = ref(false)
  const working = computed(() => uploading.value || cleaning.value)
  const cleanup = createMaterialCleanup()
  const rawFile = ref<File>()
  let mounted = true
  onBeforeUnmount(() => {
    mounted = false
    void cleanup.discardAll().catch(() => {
      /* 关闭后由服务端孤儿回收兜底。 */
    })
  })
  const mode = ref(props.modelValue?.kind || 'link')
  const error = ref('')
  const accept = computed(() => (props.type === 'prd' ? '.pdf,.doc,.docx' : '.html,.zip'))
  async function discardSelected(): Promise<boolean> {
    if (runtimeConfig.isPrototype) return true
    cleaning.value = true
    emit('busy', true)
    store.setUploadBusy(true)
    try {
      await cleanup.discardAll()
      return true
    } catch {
      error.value = '未能清理刚上传的文件，材料已保留，请再次移除或重新选择以重试。'
      return false
    } finally {
      cleaning.value = false
      store.setUploadBusy(false)
      if (mounted) emit('busy', false)
    }
  }
  async function clear(): Promise<boolean> {
    if (working.value || !(await discardSelected())) return false
    if (!mounted) return false
    rawFile.value = undefined
    error.value = ''
    emit('update:modelValue', null)
    return true
  }
  async function changeMode(value: string | number | boolean | undefined) {
    if ((value === 'file' || value === 'link') && (await clear())) mode.value = value
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
  async function selectFile(file: UploadFile) {
    if (working.value) return
    const material: DemoAttachment = {
      kind: 'file',
      name: file.name,
      size: file.size || 0,
      mime: file.raw?.type,
      status: 'ready'
    }
    try {
      validateAttachment(material, props.type)
      if (!(await discardSelected()) || !mounted) return
      error.value = ''
      rawFile.value = file.raw
      emit('update:modelValue', material)
      if (!runtimeConfig.isPrototype) void upload()
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '文件校验失败，请重新选择'
    }
  }
  async function upload() {
    if (working.value || !rawFile.value) return
    const file = rawFile.value
    if (!(await discardSelected()) || !mounted) return
    uploading.value = true
    emit('busy', true)
    store.setUploadBusy(true)
    error.value = ''
    emit('update:modelValue', {
      kind: 'file',
      name: file.name,
      size: file.size,
      status: 'uploading'
    })
    try {
      if (!props.ensureDemand) throw new Error('无法确定需求，请关闭后重试')
      const id = await props.ensureDemand()
      const material = await uploadLiveMaterial(id, props.type, file, cleanup.track)
      if (mounted) emit('update:modelValue', material)
      else await cleanup.discardAll()
    } catch (cause) {
      if (mounted) {
        error.value = cause instanceof Error ? cause.message : '上传失败，请重试'
        emit('update:modelValue', {
          kind: 'file',
          name: file.name,
          size: file.size,
          status: 'failed'
        })
      }
    } finally {
      uploading.value = false
      store.setUploadBusy(false)
      if (mounted) emit('busy', false)
    }
  }
</script>
