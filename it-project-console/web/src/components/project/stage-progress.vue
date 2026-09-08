<template>
  <div class="stage-progress" aria-label="项目七阶段">
    <div class="stage-bars">
      <ElTooltip
        v-for="(item, index) in PROJECT_STAGES"
        :key="item"
        :content="`${item} · ${index < active ? '已完成' : index === active ? statusLabel[status] : '未开始'}`"
      >
        <span
          :class="{
            done: index < active,
            current: index === active,
            blocked: index === active && status === 'blocked'
          }"
        />
      </ElTooltip>
    </div>
    <p
      >七环节：<template v-for="(item, index) in PROJECT_STAGES" :key="item"
        ><strong v-if="index === active">{{ item }}</strong
        ><span v-else>{{ item }}</span
        ><span v-if="index < 6"> → </span></template
      ></p
    >
  </div>
</template>
<script setup lang="ts">
  import { computed } from 'vue'
  import { PROJECT_STAGES, type ProjectStage, type SimpleStatus } from '@/domain/prototype'
  import { statusLabel } from '@/utils/project-display'
  const props = defineProps<{ stage: ProjectStage; status: SimpleStatus }>()
  const active = computed(() => PROJECT_STAGES.indexOf(props.stage))
</script>
<style scoped>
  .stage-bars {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 3px;
  }
  .stage-bars span {
    height: 5px;
    background: var(--art-gray-200);
    border-radius: 2px;
  }
  .stage-bars .done {
    background: var(--el-color-success-light-5);
  }
  .stage-bars .current {
    background: var(--el-color-primary);
  }
  .stage-bars .blocked {
    background: var(--el-color-danger);
  }
  p {
    margin: 8px 0 0;
    font-size: 12px;
    line-height: 1.6;
    color: var(--art-gray-600);
  }
  strong {
    color: var(--el-color-primary);
    font-weight: 500;
  }
</style>
