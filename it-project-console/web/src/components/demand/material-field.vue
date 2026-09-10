<template>
  <div class="w-full material-field">
    <ElUpload
      drag
      multiple
      :auto-upload="false"
      :show-file-list="false"
      :disabled="disabled"
      :on-change="selectFile"
    >
      <ElIcon class="mb-2 text-primary" :size="28"><UploadFilled /></ElIcon>
      <div class="text-sm"><span class="text-primary">点击选择文件</span>，或将文件拖到这里</div>
      <div class="mt-1 text-xs text-g-500">不限文件格式 · 单文件 ≤100 MB · 合计 ≤500 MB</div>
    </ElUpload>
    <p class="mt-2 text-xs text-g-500">提交评估至少需要一个上传完成的文件，草稿可暂不上传。</p>
    <p v-if="runtimeConfig.isPrototype" class="mt-2 text-xs text-g-500">
      仅模拟：只保存文件信息，不上传或保存文件内容。
    </p>
    <p v-if="removedSaved" class="mt-2 text-xs text-g-500">
      已移除的原附件将在保存后释放空间。若上传提示空间不足，请先保存修改，再添加新文件。
    </p>
    <ul v-if="rows.length" class="mt-2 space-y-2">
      <li v-for="row in rows" :key="row.key" class="rounded border border-g-200 p-3">
        <div class="flex min-w-0 items-start gap-2">
          <div class="min-w-0 flex-1">
            <div class="break-all text-sm">{{ row.material.name }}</div>
            <div class="mt-1 text-xs text-g-500">
              {{ row.material.kind === 'link' ? '已有链接' : formatSize(row.material.size || 0) }} ·
              <span :data-status="row.material.status">{{
                statusLabel(row.material, row.progress)
              }}</span>
            </div>
            <div v-if="row.material.kind === 'link'" class="mt-1 break-all text-xs text-g-500">{{
              row.material.url
            }}</div>
          </div>
          <div class="flex shrink-0 gap-2">
            <ElButton
              v-if="row.file && row.material.status === 'failed'"
              link
              type="primary"
              :disabled="disabled || busy"
              @click="retry(row.key)"
              >重试上传</ElButton
            >
            <ElButton link type="danger" :disabled="disabled || busy" @click="remove(row.key)"
              >移除</ElButton
            >
          </div>
        </div>
        <ElProgress
          v-if="row.material.status === 'uploading'"
          class="mt-2"
          :percentage="row.progress"
          :stroke-width="4"
        />
        <p v-if="row.error" class="mt-1 text-xs text-danger" role="alert">{{ row.error }}</p>
      </li>
    </ul>
    <p v-if="error" class="text-danger text-xs mt-2" role="alert">{{ error }}</p>
  </div>
</template>
<script setup lang="ts">
  import { computed, onBeforeUnmount, watch } from 'vue'
  import { UploadFilled } from '@element-plus/icons-vue'
  import type { UploadFile } from 'element-plus'
  import type { DemoAttachment } from '@/domain/prototype'
  import { runtimeConfig } from '@/config/runtime'
  import { usePrototypeStore } from '@/store/modules/prototype'
  import { useMaterialQueue } from '@/hooks/business/use-material-queue'
  const props = defineProps<{
    modelValue: DemoAttachment[]
    disabled?: boolean
    ensureDemand?: () => Promise<string>
  }>()
  const emit = defineEmits<{
    'update:modelValue': [value: DemoAttachment[]]
    busy: [value: boolean]
  }>()
  const store = usePrototypeStore()
  const savedIds = props.modelValue.flatMap(file => file.attachmentId ? [file.attachmentId] : [])
  const removedSaved = computed(() => savedIds.some(id => !props.modelValue.some(file => file.attachmentId === id)))
  const controller = useMaterialQueue({
    prototype: runtimeConfig.isPrototype,
    ensureDemand: () =>
      props.ensureDemand ? props.ensureDemand() : Promise.reject(new Error('无法确定需求')),
    change: (value) => emit('update:modelValue', value),
    busy: (value) => {
      store.setUploadBusy(value)
      emit('busy', value)
    }
  })
  const { rows, busy, error, retry, remove } = controller
  watch(
    () => props.modelValue,
    (value) => controller.sync(value),
    { immediate: true }
  )
  onBeforeUnmount(controller.dispose)
  defineExpose({ releaseCleanup: controller.releaseCleanup })
  function selectFile(file: UploadFile) {
    if (file.raw && !props.disabled) controller.select(file.raw)
  }
  function formatSize(size: number) {
    return size >= 1024 * 1024
      ? `${(size / 1024 / 1024).toFixed(1)} MB`
      : `${(size / 1024).toFixed(1)} KB`
  }
  function statusLabel(material: DemoAttachment, progress: number) {
    if (material.kind === 'link') return '已保存'
    if (runtimeConfig.isPrototype) return '已选择（仅模拟）'
    if (material.status === 'failed') return '上传失败'
    if (material.status === 'uploading')
      return progress === 100 ? '正在确认文件' : `等待或上传中 ${progress}%`
    return '已上传'
  }
</script>
<style scoped>
  .material-field :deep(.el-upload),
  .material-field :deep(.el-upload-dragger) {
    width: 100%;
  }
  .material-field :deep(.el-upload-dragger) {
    padding: 22px 12px;
  }
</style>
