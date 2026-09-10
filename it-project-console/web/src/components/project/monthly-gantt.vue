<template>
  <div class="gantt-scroll" tabindex="0" aria-label="月度项目时间轴，可横向和纵向滚动">
    <div class="gantt-grid" :style="{ '--days': days, minWidth: `${230 + days * 36}px` }">
      <div class="frozen header">项目 / 主负责人 / 当前环节</div>
      <div class="track header day-grid" :style="{ gridTemplateColumns: `repeat(${days}, minmax(0, 1fr))` }">
        <span v-for="day in days" :key="day" :class="{ weekend: isWeekend(day) }">{{ day }}</span>
      </div>
      <template v-for="row in rows" :key="row.project.id">
        <button class="frozen project-cell" @click="emit('detail', row.project.id)">
          <strong :title="row.project.name">{{ row.project.name }}</strong>
          <small>{{ ownerName(row.project.primaryOwnerId) }} · {{ row.project.stage }}</small>
          <small :class="{ 'risk-text': row.risks.length }">{{
            row.risks.join('；') || statusText(row)
          }}</small>
        </button>
        <ElTooltip placement="top" effect="light" :show-after="180">
          <template #content>
            <div class="gantt-tip">
              <strong>{{ row.project.name }}</strong>
              <p>{{ ownerName(row.project.primaryOwnerId) }} · {{ row.project.stage }}</p>
              <p>立项 {{ row.start }} → 预计交付 {{ row.project.expectedDeliveryDate }}</p>
              <p
                >原计划交付 {{ row.project.originalDeliveryDate
                }}{{ row.outside ? '（超出本月显示范围）' : '' }}</p
              >
              <p
                >整体进度 {{ row.project.overallProgress }}%{{
                  row.clipped ? ' · 跨月区间已裁剪' : ''
                }}</p
              >
              <p>{{ row.risks.join('；') || statusText(row) }}</p>
            </div>
          </template>
          <button
            class="track project-track"
            :aria-label="`查看${row.project.name}详情`"
            @click="emit('detail', row.project.id)"
          >
            <span class="plan-bar" :style="barStyle(row.left, row.width)"></span>
            <span
              class="progress-bar"
              :class="{
                completed: row.project.status === 'completed',
                stale: row.risks.some((r) => r.includes('未更新'))
              }"
              :style="barStyle(row.left, row.progressWidth)"
            ></span>
            <span class="progress-label"
              >{{ row.project.overallProgress }}%{{ row.clipped ? ' · 跨月' : '' }}</span
            >
            <span
              v-if="row.originalMarker !== null"
              class="original-marker"
              :style="{ left: `${row.originalMarker / days * 100}%` }"
              aria-label="原计划交付"
            ></span>
            <span
              v-if="todayIndex >= 0"
              class="today-line"
              :style="{ left: `${(todayIndex + 0.5) / days * 100}%` }"
            ></span>
          </button>
        </ElTooltip>
      </template>
    </div>
  </div>
  <div class="gantt-legend"
    ><span>灰条：计划区间</span><span>彩条：整体完成度</span><span>竖标：原计划交付</span
    ><span>蓝线：今天</span><span>悬停查看明细，点击打开详情</span></div
  >
</template>
<script setup lang="ts">
  import { computed } from 'vue'
  import type { DemoUser } from '@/domain/prototype'
  import { monthDays, type GanttRow } from '@/services/gantt-service'
  const props = defineProps<{ rows: GanttRow[]; month: string; today: string; users: DemoUser[] }>()
  const emit = defineEmits<{ detail: [id: string] }>()
  const days = computed(() => monthDays(props.month))
  const todayIndex = computed(() =>
    props.today.startsWith(props.month) ? Number(props.today.slice(8)) - 1 : -1
  )
  const ownerName = (id: string) => props.users.find((user) => user.id === id)?.name ?? '未分配'
  const barStyle = (left: number, width: number) => ({
    left: `${left / days.value * 100}%`,
    width: `${width / days.value * 100}%`
  })
  const statusText = (row: GanttRow) =>
    row.project.status === 'completed'
      ? '已完成'
      : row.project.status === 'cancelled'
        ? '已取消'
        : '正常推进'
  const isWeekend = (day: number) =>
    [0, 6].includes(
      new Date(`${props.month}-${String(day).padStart(2, '0')}T00:00:00Z`).getUTCDay()
    )
</script>
<style scoped>
  .gantt-scroll {
    max-width: 100%;
    height: max(400px, calc(100dvh - 370px));
    overflow: auto;
    scrollbar-gutter: stable;
    scrollbar-width: auto;
    scrollbar-color: #aeb7c6 #f1f3f7;
    border: 1px solid var(--el-border-color-light);
    border-radius: 10px;
  }
  .gantt-grid {
    display: grid;
    width: 100%;
    grid-template-columns: 230px minmax(0, 1fr);
  }
  .gantt-scroll::-webkit-scrollbar {
    /* Override the application's global zero-height horizontal scrollbar. */
    width: 12px !important;
    height: 12px !important;
    display: block;
  }
  .gantt-scroll::-webkit-scrollbar-thumb {
    background: #aeb7c6;
    border: 2px solid #f1f3f7;
    border-radius: 8px;
  }
  .gantt-scroll::-webkit-scrollbar-track {
    background: #f1f3f7;
  }
  .gantt-grid > .header {
    position: sticky;
    top: 0;
    z-index: 5;
    box-shadow: 0 1px 0 var(--el-border-color-light);
  }
  .gantt-grid > .frozen.header {
    z-index: 6;
  }
  .frozen {
    position: sticky;
    left: 0;
    z-index: 3;
    background: var(--el-bg-color);
    border-right: 1px solid var(--el-border-color-light);
  }
  .header {
    height: 42px;
    align-content: center;
    font-size: 11px;
    color: var(--el-text-color-secondary);
    background: var(--el-fill-color-light);
  }
  .frozen.header {
    padding: 0 16px;
  }
  .day-grid {
    display: grid;
    text-align: center;
  }
  .weekend {
    color: var(--el-text-color-placeholder);
  }
  .project-cell {
    min-height: 82px;
    padding: 13px 16px;
    text-align: left;
    cursor: pointer;
    border-bottom: 1px solid var(--el-border-color-lighter);
  }
  .project-cell strong {
    display: block;
    font-size: 13px;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .project-cell small {
    display: block;
    font-size: 11px;
    color: var(--el-text-color-secondary);
    margin-top: 4px;
  }
  .project-cell .risk-text {
    color: var(--el-color-danger);
  }
  .track {
    position: relative;
  }
  .project-track {
    cursor: pointer;
    border-bottom: 1px solid var(--el-border-color-lighter);
    background: repeating-linear-gradient(
      to right,
      transparent 0,
      transparent calc(100% / var(--days) - 1px),
      var(--el-border-color-lighter) calc(100% / var(--days) - 1px),
      var(--el-border-color-lighter) calc(100% / var(--days))
    );
  }
  .plan-bar,
  .progress-bar {
    position: absolute;
    border-radius: 4px;
    height: 10px;
    top: 22px;
    background: #dbe4f0;
  }
  .progress-bar {
    height: 8px;
    top: 39px;
    background: #5d87ff;
  }
  .progress-bar.completed {
    background: #13b99a;
  }
  .progress-bar.stale {
    background: #f59b18;
  }
  .progress-label {
    position: absolute;
    bottom: 8px;
    right: 8px;
    font-size: 11px;
    color: var(--el-text-color-secondary);
    background: var(--el-bg-color);
  }
  .original-marker {
    position: absolute;
    top: 17px;
    height: 35px;
    border-left: 2px dashed #7987a1;
  }
  .today-line {
    position: absolute;
    top: 0;
    bottom: 0;
    border-left: 1px solid #5d87ff;
  }
  .gantt-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 20px;
    margin-top: 14px;
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }
  .gantt-tip {
    max-width: 430px;
    line-height: 1.8;
  }
</style>
