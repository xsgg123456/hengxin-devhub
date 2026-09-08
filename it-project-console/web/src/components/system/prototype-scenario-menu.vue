<template>
  <div class="prototype-scenario-menu">
    <label>演示场景</label>
    <ElSelect
      :model-value="store.snapshot?.scenario ?? 'normal'"
      aria-label="演示场景"
      :disabled="store.saving || changing"
      @change="changeScenario"
    >
      <ElOption
        v-for="option in PROTOTYPE_SCENARIOS"
        :key="option.value"
        :label="option.label"
        :value="option.value"
      />
    </ElSelect>
    <p>{{ selected?.description }}</p>
    <ElAlert v-if="error" :title="error" type="error" :closable="false" />
  </div>
</template>
<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { ElMessageBox } from 'element-plus'
  import type { PrototypeScenario } from '@/domain/prototype'
  import { PROTOTYPE_SCENARIOS } from '@/mocks/scenarios'
  import { usePrototypeStore } from '@/store/modules/prototype'
  const store = usePrototypeStore()
  const changing = ref(false)
  const error = ref('')
  const selected = computed(() =>
    PROTOTYPE_SCENARIOS.find((item) => item.value === store.snapshot?.scenario)
  )
  async function changeScenario(scenario: PrototypeScenario) {
    if (store.saving || changing.value || scenario === store.snapshot?.scenario) return
    changing.value = true
    error.value = ''
    try {
      const discardsForm = scenario !== 'normal' && scenario !== 'save-error'
      if (store.hasUnsavedChanges && discardsForm) {
        try {
          await ElMessageBox.confirm(
            '当前表单尚未保存，切换场景后会丢失修改。已保存数据保留。',
            '切换演示场景？',
            {
              confirmButtonText: '放弃并切换',
              cancelButtonText: '继续编辑',
              type: 'warning'
            }
          )
        } catch {
          return
        }
      }
      store.setScenario(scenario)
      if (discardsForm) store.clearDirty()
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '场景切换失败，请重试'
    } finally {
      changing.value = false
    }
  }
</script>
<style scoped>
  .prototype-scenario-menu {
    display: grid;
    gap: 8px;
    padding: 12px 8px;
    border-top: 1px solid var(--art-gray-300);
  }
  label {
    font-size: 13px;
    font-weight: 600;
  }
  p {
    margin: 0;
    color: var(--art-gray-500);
    font-size: 12px;
    line-height: 1.6;
  }
</style>
