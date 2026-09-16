<template>
  <ElFormItem label="关联原项目" prop="parentProjectId" :error="error" required>
    <template v-if="locked && modelValue">
      <ElButton
        link
        type="primary"
        class="parent-link"
        @click="router.push({ path: '/project-overview', query: { projectId: modelValue } })"
      >
        {{ selected ? `${selected.name} · ${projectCode(selected)}` : '查看原项目' }}
      </ElButton>
    </template>
    <template v-else>
      <ElSelect
        :model-value="modelValue"
        aria-label="关联原项目"
        filterable
        clearable
        class="w-full"
        placeholder="搜索项目名称或编号"
        no-data-text="暂无可关联的已完成主项目"
        no-match-text="未找到匹配的项目"
        @update:model-value="emit('update:modelValue', $event || null)"
      >
        <ElOption
          v-for="project in candidates"
          :key="project.id"
          :value="project.id"
          :label="`${project.name} · ${projectCode(project)}`"
        />
      </ElSelect>
      <p class="mt-2 text-xs text-g-500">仅可关联你有权查看的已完成主项目。</p>
    </template>
  </ElFormItem>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { useRouter } from 'vue-router'
  import { usePrototypeStore } from '@/store/modules/prototype'
  import { projectCode } from '@/utils/project-code'

  const props = defineProps<{ modelValue: string | null; locked: boolean; error?: string }>()
  const emit = defineEmits<{ 'update:modelValue': [value: string | null] }>()
  const store = usePrototypeStore()
  const router = useRouter()
  const candidates = computed(() =>
    store.visibleProjects.filter((p) => p.status === 'completed' && !p.parentProjectId)
  )
  const selected = computed(() => store.visibleProjects.find((p) => p.id === props.modelValue))
</script>

<style scoped>
  .parent-link {
    height: auto;
    text-align: left;
    overflow-wrap: anywhere;
    white-space: normal;
  }
</style>
