<template>
  <section class="art-card p-5 mb-5">
    <div class="workload-header mb-4"
      ><div
        ><h4 class="font-medium">月度人员负载</h4
        ><p class="text-xs text-g-500 mt-1">主责与协作分开统计，按人员顺序展示</p></div
      >
      <div class="month-actions"
        ><ElButton aria-label="负载上一月" @click="month = shiftMonth(month, -1)">上一月</ElButton
        ><span>{{ month }}</span
        ><ElButton aria-label="负载下一月" @click="month = shiftMonth(month, 1)">下一月</ElButton
        ><ElButton @click="month = currentMonth()">本月</ElButton></div
      >
    </div>
    <ElEmpty v-if="!rows.length" description="该月当前范围暂无人员项目" />
    <div
      v-show="rows.length"
      ref="chartRef"
      :style="{ height: `${Math.max(220, rows.length * 58 + 65)}px` }"
      aria-label="人员主责与协作项目柱形图"
    />
    <ElTable v-if="rows.length" :data="rows" size="small" style="width: 100%">
      <ElTableColumn label="人员" prop="user.name" min-width="100" />
      <ElTableColumn label="主责 / 协作" min-width="110"
        ><template #default="{ row }"
          ><ElPopover trigger="click" :width="340"
            ><template #reference
              ><ElButton link type="primary"
                >{{ row.primary.length }} / {{ row.collaboration.length }}</ElButton
              ></template
            ><div class="project-links"
              ><ElButton v-for="p in row.projects" :key="p.id" text @click="emit('detail', p.id)"
                >{{ p.primaryOwnerId === row.user.id ? '主责' : '协作' }} · {{ p.name }}</ElButton
              ></div
            ></ElPopover
          ></template
        ></ElTableColumn
      >
      <ElTableColumn label="同期主责" prop="overlap" min-width="90" />
      <ElTableColumn label="当前阶段" min-width="210"
        ><template #default="{ row }"
          ><span v-for="s in row.stages" :key="s.stage" class="stage-count"
            >{{ s.stage }} {{ s.count }}</span
          ></template
        ></ElTableColumn
      >
      <ElTableColumn v-for="risk in riskColumns" :key="risk.key" :label="risk.label" min-width="100"
        ><template #default="{ row }"
          ><ElPopover trigger="click" :width="340"
            ><template #reference
              ><ElButton link :type="row[risk.key].length ? risk.type : 'info'">{{
                row[risk.key].length
              }}</ElButton></template
            ><p v-if="!row[risk.key].length">当前无{{ risk.label }}项目</p
            ><div class="project-links"
              ><ElButton v-for="p in row[risk.key]" :key="p.id" text @click="emit('detail', p.id)"
                >{{ p.name }} · {{ p.risks.join('；') }}</ElButton
              ></div
            ></ElPopover
          ></template
        ></ElTableColumn
      >
    </ElTable>
    <p class="text-xs text-g-500 mt-3"
      >同期主责 = 本月计划区间同时重叠的最多主责项目数（无重叠为
      0）；含归档范围可查看历史负载，已取消项目不计负载。</p
    >
  </section>
</template>

<script setup lang="ts">
  import type { DemoProject, DemoUser } from '@/domain/prototype'
  import { personWorkload, shiftMonth } from '@/services/analytics-service'
  import { shanghaiDay } from '@/services/workflow-validation'
  import { useChartComponent } from '@/hooks/core/useChart'
  import type { EChartsOption } from '@/plugins/echarts'
  const props = defineProps<{ projects: DemoProject[]; users: DemoUser[] }>()
  const emit = defineEmits<{ detail: [projectId: string] }>()
  const currentMonth = () => shanghaiDay(new Date().toISOString()).slice(0, 7)
  const month = ref(currentMonth())
  const rows = computed(() => personWorkload(props.projects, props.users, month.value))
  const riskColumns = [
    { key: 'delayed', label: '延期', type: 'danger' },
    { key: 'blocked', label: '阻塞', type: 'danger' },
    { key: 'stale', label: '停更', type: 'warning' }
  ] as const
  function tooltip(index: number) {
    const row = rows.value[index]
    const root = document.createElement('div')
    root.style.cssText = 'max-height:300px;overflow:auto;max-width:360px;white-space:normal'
    if (!row) return root
    const title = document.createElement('strong')
    title.textContent = `${row.user.name} · 主责 ${row.primary.length} / 协作 ${row.collaboration.length} · 同期主责 ${row.overlap}`
    root.append(title)
    row.projects.forEach((p) => {
      const button = document.createElement('button')
      button.style.cssText =
        'display:block;white-space:normal;text-align:left;padding:8px 0;width:100%;cursor:pointer;border-bottom:1px solid #eee'
      button.textContent = `${p.primaryOwnerId === row.user.id ? '主责' : '协作'} · ${p.name} · ${p.stage} · 预计交付 ${p.expectedDeliveryDate}${p.risks.length ? ' · ' + p.risks.join('；') : ''}`
      button.onclick = () => emit('detail', p.id)
      root.append(button)
    })
    return root
  }
  const {
    chartRef,
    getAxisLabelStyle,
    getSplitLineStyle,
    getTooltipStyle,
    getLegendStyle,
    handleResize
  } = useChartComponent({
    props: { height: '300px' },
    checkEmpty: () => !rows.value.length,
    watchSources: [() => rows.value],
    generateOptions: (): EChartsOption => ({
      color: ['#5d87ff', '#49beff'],
      grid: { left: 15, right: 30, top: 15, bottom: 40, containLabel: true },
      tooltip: {
        ...getTooltipStyle('axis'),
        enterable: true,
        confine: true,
        hideDelay: 250,
        formatter: (params) => tooltip((Array.isArray(params) ? params[0] : params).dataIndex)
      },
      legend: getLegendStyle('bottom'),
      xAxis: {
        type: 'value',
        minInterval: 1,
        splitLine: getSplitLineStyle(),
        axisLabel: getAxisLabelStyle()
      },
      yAxis: {
        type: 'category',
        inverse: true,
        data: rows.value.map((r) => r.user.name),
        axisTick: { show: false },
        axisLabel: getAxisLabelStyle()
      },
      series: [
        {
          name: '主责项目',
          type: 'bar',
          barMaxWidth: 16,
          data: rows.value.map((r) => r.primary.length),
          itemStyle: { borderRadius: [0, 4, 4, 0] }
        },
        {
          name: '协作项目',
          type: 'bar',
          barMaxWidth: 16,
          data: rows.value.map((r) => r.collaboration.length),
          itemStyle: { borderRadius: [0, 4, 4, 0] }
        }
      ]
    })
  })
  watch(rows, () => nextTick(handleResize))
</script>

<style scoped>
  .workload-header,
  .month-actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
    justify-content: space-between;
  }
  .month-actions :deep(.el-button) {
    margin-left: 0;
  }
  .stage-count {
    display: inline-block;
    margin: 3px 8px 3px 0;
    color: var(--art-gray-600);
  }
  .project-links {
    display: grid;
    max-height: 300px;
    overflow: auto;
  }
  .project-links :deep(.el-button) {
    margin: 0;
    height: auto;
    white-space: normal;
    text-align: left;
    justify-content: flex-start;
  }
</style>
