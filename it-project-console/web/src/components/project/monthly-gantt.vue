<template>
  <div
    class="gantt-scroll"
    tabindex="0"
    aria-label="月度项目时间轴，可横向和纵向滚动"
    @scroll="hideTip"
    @mouseleave="hideTip"
    @keydown.esc="hideTip"
  >
    <div class="gantt-grid" :style="{ '--days': days, minWidth: `${230 + days * 36}px` }">
      <div class="frozen header">项目 / 主负责人 / 当前环节</div>
      <div
        class="track header day-grid"
        :style="{ gridTemplateColumns: `repeat(${days}, minmax(0, 1fr))` }"
      >
        <span v-for="day in days" :key="day" :class="{ weekend: isWeekend(day) }">{{ day }}</span>
      </div>
      <template v-for="row in displayRows" :key="row.project.id">
        <button
          class="frozen project-cell"
          :style="{ minHeight: `${row.height}px` }"
          @click="emit('detail', row.project.id)"
          @mousemove="showTip($event, row)"
          @focus="showFocus($event, row)"
          @blur="hideTip"
        >
          <strong>{{ row.project.name }}</strong>
          <small>{{ teamSummary(row.project) }} · {{ row.project.stage }}</small>
          <small :class="{ 'risk-text': row.risks.length }">{{
            row.risks.join('；') || statusText(row)
          }}</small>
        </button>
        <div
          class="track project-track"
          :style="{ minHeight: `${row.height}px` }"
          @mousemove="showTip($event, row)"
        >
          <span
            v-for="day in days"
            v-show="isWeekend(day)"
            :key="day"
            class="weekend-column"
            :style="barStyle(day - 1, 1)"
          ></span>
          <button
            class="plan-bar"
            :style="barStyle(row.left, row.width)"
            :aria-label="`查看${row.project.name}详情`"
            @click="emit('detail', row.project.id)"
            @focus="showFocus($event, row)"
            @blur="hideTip"
          ></button>
          <button
            v-for="segment in row.segments"
            :key="segment.stage"
            class="phase-segment"
            :class="segment.state"
            :style="{
              ...barStyle(segment.left, segment.width),
              top: `${43 + segment.lane * 29}px`
            }"
            :aria-label="stageExplanation(segment)"
            @mousemove.stop="showTip($event, row, segment)"
            @focus="showFocus($event, row, segment)"
            @blur="hideTip"
            @click="emit('detail', row.project.id)"
          >
            {{ segment.width < 1.6 ? segment.stage.slice(2) : segment.stage }}
          </button>
          <span class="progress-label"
            >{{
              row.segments.length
                ? row.risks.length
                  ? row.risks.join('；')
                  : statusText(row)
                : '暂无本月环节排期'
            }}{{ row.clipped ? ' · 跨月' : '' }}</span
          >
          <span
            v-if="row.originalMarker !== null"
            class="original-marker"
            :style="{ left: `${(row.originalMarker / days) * 100}%` }"
            aria-label="原计划交付"
          ></span>
          <span
            v-if="todayIndex >= 0"
            class="today-line"
            :style="{ left: `${((todayIndex + 0.5) / days) * 100}%` }"
          ></span>
        </div>
      </template>
    </div>
  </div>
  <ElTooltip
    ref="tooltip"
    :visible="!!tip"
    virtual-triggering
    :virtual-ref="cursorRef"
    effect="light"
    placement="bottom-start"
    :offset="14"
    :show-arrow="false"
    :enterable="false"
    :persistent="false"
    :popper-options="popperOptions"
    :popper-style="{ pointerEvents: 'none', maxWidth: 'min(390px, calc(100vw - 16px))' }"
  >
    <template #content>
      <div v-if="tip" class="gantt-tip">
        <strong>{{ tip.row.project.name }}</strong>
        <p>{{ projectCode(tip.row.project) }} · {{ tip.row.project.priority }}</p>
        <template v-if="tip.segment">
          <p
            ><b>{{ tip.segment.stage }}</b> ·
            <span :class="{ 'risk-text': tip.segment.lateDays }"
              >{{ tip.segment.label
              }}{{ tip.segment.lateDays ? ` ${tip.segment.lateDays} 天` : '' }}</span
            ></p
          >
          <p>计划日期：{{ tip.segment.plan?.startDate }} → {{ tip.segment.plan?.endDate }}</p>
          <p
            >实际完成：{{
              tip.segment.completedAt
                ? displayTime(tip.segment.completedAt).slice(0, 10)
                : '尚未完成'
            }}</p
          >
        </template>
        <template v-else>
          <p>当前环节：{{ tip.row.project.stage }} · {{ statusText(tip.row) }}</p>
          <p>整体计划：{{ tip.row.start }} → {{ tip.row.project.expectedDeliveryDate }}</p>
          <p>原计划交付：{{ tip.row.project.originalDeliveryDate || '—' }}</p>
          <p>已完成环节：{{ completedNames(tip.row.project) }}</p>
          <p v-if="tip.row.project.blocker">阻塞：{{ tip.row.project.blocker }}</p>
        </template>
        <p>主负责人：{{ ownerName(tip.row.project.primaryOwnerId) }}</p>
        <p>协作人员：{{ tip.row.project.collaboratorIds.map(ownerName).join('、') || '无' }}</p>
        <p>最近更新：{{ displayTime(tip.row.project.lastOverallUpdatedAt) }}</p>
        <p v-if="tip.row.risks.length" class="risk-text">{{ tip.row.risks.join('；') }}</p>
        <p class="tip-note">分段长度表示计划天数，颜色表示环节状态 · 点击看详情</p>
      </div>
    </template>
  </ElTooltip>
  <div class="gantt-legend"
    ><span>上排灰条：整体计划</span><span>下排分段：环节计划</span>
    <span class="legend-done">● 按时完成</span><span class="legend-current">● 进行中</span>
    <span class="risk-text">● 延期 / 延期完成</span><span>● 未开始 / 待核实</span>
    <span>蓝色虚线：今天</span><span>竖标：原计划交付</span><span>悬停或键盘聚焦查看明细</span></div
  >
</template>
<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
  import type { DemoProject, DemoStageHistory, DemoUser } from '@/domain/prototype'
  import { monthDays, type GanttRow } from '@/services/gantt-service'
  import { ganttStageSegments, type GanttSegment } from '@/services/gantt-stage-segments'
  import { stageExecutions, stageExplanation } from '@/services/stage-execution'
  import { projectCode } from '@/utils/project-code'
  import { displayTime } from '@/utils/project-display'
  const props = defineProps<{
    rows: GanttRow[]
    month: string
    today: string
    users: DemoUser[]
    histories: DemoStageHistory[]
  }>()
  const emit = defineEmits<{ detail: [id: string] }>()
  const days = computed(() => monthDays(props.month))
  const displayRows = computed(() =>
    props.rows.map((row) => {
      const segments = ganttStageSegments(row.project, props.histories, props.month, props.today)
      return { ...row, segments, height: 108 + Math.max(0, ...segments.map((s) => s.lane)) * 29 }
    })
  )
  const todayIndex = computed(() =>
    props.today.startsWith(props.month) ? Number(props.today.slice(8)) - 1 : -1
  )
  const ownerName = (id: string) => props.users.find((user) => user.id === id)?.name ?? '未分配'
  const teamSummary = (project: DemoProject) => {
    const members = project.collaboratorIds.map(ownerName)
    return (
      ownerName(project.primaryOwnerId) +
      (members.length
        ? ` + ${members.slice(0, 2).join('、')}${members.length > 2 ? ` 等${members.length}人` : ''}`
        : '')
    )
  }
  const barStyle = (left: number, width: number) => ({
    left: `${(left / days.value) * 100}%`,
    width: `${(width / days.value) * 100}%`
  })
  const statusText = (row: GanttRow) =>
    row.project.status === 'completed'
      ? '已完成'
      : row.project.status === 'cancelled'
        ? '已取消'
        : row.project.simpleStatus === 'blocked'
          ? '已阻塞'
          : '进行中'
  const isWeekend = (day: number) =>
    [0, 6].includes(
      new Date(`${props.month}-${String(day).padStart(2, '0')}T00:00:00Z`).getUTCDay()
    )
  const completedNames = (project: DemoProject) =>
    stageExecutions(project, props.histories, props.today)
      .filter((s) => s.completed)
      .map((s) => s.stage)
      .join('、') || '暂无可靠完成记录'
  const tip = shallowRef<{ row: GanttRow; segment?: GanttSegment } | null>(null)
  const cursor = shallowRef(new DOMRect())
  const cursorRef = { getBoundingClientRect: () => cursor.value }
  const tooltip = ref<{ updatePopper: () => void }>()
  const popperOptions = {
    strategy: 'fixed' as const,
    modifiers: [
      {
        name: 'flip',
        options: { fallbackPlacements: ['top-start', 'bottom-end', 'top-end'], padding: 8 }
      },
      { name: 'preventOverflow', options: { padding: 8, altAxis: true, tether: false } }
    ]
  }
  function showTip(event: MouseEvent, row: GanttRow, segment?: GanttSegment) {
    cursor.value = new DOMRect(event.clientX, event.clientY, 0, 0)
    tip.value = { row, segment }
    void nextTick(() => tooltip.value?.updatePopper())
  }
  function showFocus(event: FocusEvent, row: GanttRow, segment?: GanttSegment) {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    cursor.value = new DOMRect(rect.left, rect.bottom, 0, 0)
    tip.value = { row, segment }
    void nextTick(() => tooltip.value?.updatePopper())
  }
  const hideTip = () => {
    tip.value = null
  }
  watch(() => [props.rows, props.month, props.histories], hideTip)
  onMounted(() => {
    window.addEventListener('scroll', hideTip, true)
    window.addEventListener('resize', hideTip)
  })
  onBeforeUnmount(() => {
    window.removeEventListener('scroll', hideTip, true)
    window.removeEventListener('resize', hideTip)
  })
</script>
<style scoped src="./monthly-gantt.css"></style>
