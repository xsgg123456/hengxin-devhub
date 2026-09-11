<template>
  <div class="stage-progress" aria-label="项目七阶段">
    <div class="stage-blocks">
      <ElTooltip v-for="item in stages" :key="item.stage" :content="stageExplanation(item)">
        <div
          class="stage-block"
          :class="item.state"
          tabindex="0"
          :aria-label="stageExplanation(item)"
        >
          <span class="stage-number">0{{ item.index + 1 }}</span>
          <b>{{ item.stage.slice(0, 2) }}<br />{{ item.stage.slice(2) }}</b>
          <small>{{ item.label }}</small>
        </div>
      </ElTooltip>
    </div>
    <p v-if="lateStages.length" class="delay-note">
      <template v-for="(item, i) in lateStages" :key="item.stage">
        {{ i ? '；' : '' }}{{ item.stage }}{{ item.label }} {{ item.lateDays }} 天
      </template>
    </p>
    <p v-else class="normal-note">蓝色：进行中　绿色：按时完成　红色：延期</p>
  </div>
</template>
<script setup lang="ts">
  import { computed } from 'vue'
  import type { DemoProject, DemoStageHistory } from '@/domain/prototype'
  import { stageExecutions, stageExplanation } from '@/services/stage-execution'
  const props = defineProps<{
    project: DemoProject
    histories: DemoStageHistory[]
    today?: string
  }>()
  const stages = computed(() => stageExecutions(props.project, props.histories, props.today))
  const lateStages = computed(() => stages.value.filter((item) => item.lateDays > 0))
</script>
<style scoped>
  .stage-blocks {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 6px;
  }
  .stage-block {
    height: 106px;
    border-radius: 7px;
    background: #f4f5f7;
    border: 1px solid #e9ebf0;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 5px;
    color: #737c8c;
  }
  .stage-number {
    font-size: 10px;
    opacity: 0.75;
    line-height: 12px;
  }
  .stage-block b {
    font-size: 13px;
    line-height: 18px;
    font-weight: 500;
  }
  .stage-block small {
    font-size: 10px;
    white-space: nowrap;
    line-height: 16px;
  }
  .done {
    background: #e9f8f2;
    border-color: #c1e9d8;
    color: #19875b;
  }
  .current {
    background: #edf1ff;
    border-color: #a6b6ff;
    color: #5276ff;
  }
  .late,
  .late-done {
    background: #fff0f1;
    border-color: #ffadb6;
    color: #d9374b;
  }
  .stage-block:focus-visible {
    outline: 2px solid var(--el-color-primary);
    outline-offset: 2px;
  }
  .delay-note,
  .normal-note {
    font-size: 11px;
    line-height: 18px;
    margin-top: 9px;
    min-height: 18px;
  }
  .delay-note {
    color: #d9374b;
  }
  .normal-note {
    color: #737c8c;
  }
</style>
