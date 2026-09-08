<template>
  <div class="demand-chart-grid mb-5">
    <section v-for="(group, index) in panels" :key="group.title" class="art-card p-5">
      <div class="art-card-header mb-4"
        ><div class="title"
          ><h4>{{ group.title }}</h4></div
        ><span class="text-xs text-g-500">占比 + 数量 + 需求明细</span></div
      >
      <ElEmpty v-if="!demands.length" description="当前范围暂无需求" />
      <div v-show="demands.length" class="distribution-body">
        <div
          :ref="(el) => setRingRef(el, index)"
          class="demand-ring"
          :aria-label="group.title + '环形图'"
        />
        <div class="quantity-list">
          <ElPopover
            v-for="(item, colorIndex) in group.items"
            :key="item.key"
            trigger="hover"
            :width="340"
          >
            <template #reference
              ><button class="quantity-row" @click="showDemands(item)"
                ><span>{{ item.name }}</span
                ><span class="quantity-track"
                  ><i
                    :style="{
                      width: `${(item.value / demands.length) * 100}%`,
                      background: CHART_COLORS[colorIndex % CHART_COLORS.length]
                    }" /></span
                ><span
                  >{{ item.value }} · {{ Math.round((item.value / demands.length) * 100) }}%</span
                ></button
              ></template
            >
            <div class="demand-links"
              ><ElButton v-for="d in item.demands" :key="d.id" text @click="emit('detail', d.id)"
                >{{ d.name }} · {{ d.department }}</ElButton
              ></div
            >
          </ElPopover>
        </div>
      </div>
    </section>
    <section class="art-card p-5 trend-panel">
      <div class="art-card-header mb-4"
        ><div class="title"><h4>按月需求趋势</h4></div
        ><span class="text-xs text-g-500">每月需求数量 · 按部门堆叠</span></div
      >
      <ElEmpty v-if="!trend.months.length" description="当前范围暂无已提交需求趋势" />
      <div
        v-show="trend.months.length"
        ref="trendChartRef"
        style="height: 270px"
        aria-label="月度部门需求堆叠柱形图"
      />
      <p class="text-xs text-g-500 mt-3"
        >全部图表与需求表格共用范围；月度以提交时间统计，无提交时间的草稿不计入趋势。</p
      >
    </section>
    <ElDialog
      :model-value="!!selected.length"
      :title="selectedTitle + ' · 对应需求'"
      width="min(560px, 95vw)"
      @close="selected = []"
      ><div class="demand-links"
        ><ElButton v-for="d in selected" :key="d.id" text @click="openDemand(d.id)"
          >{{ d.name }} · {{ d.department }}</ElButton
        ></div
      ></ElDialog
    >
  </div>
</template>
<script setup lang="ts">
  import type { ComponentPublicInstance, ComputedRef } from 'vue'
  import type { DemandStatistics } from '@/services/live-dashboard-types'
  import { runtimeConfig } from '@/config/runtime'
  import type { DemoDemand, DemoUser } from '@/domain/prototype'
  import {
    CHART_COLORS,
    demandDistribution,
    demandMonthlyTrend
  } from '@/services/analytics-service'
  import { shanghaiDay } from '@/services/workflow-validation'
  import { useChartComponent } from '@/hooks/core/useChart'
  import type { EChartsOption } from '@/plugins/echarts'
  const props = defineProps<{
    demands: DemoDemand[]
    users: DemoUser[]
    statistics?: DemandStatistics
  }>()
  const emit = defineEmits<{ detail: [demandId: string] }>()
  const selected = ref<DemoDemand[]>([])
  const selectedTitle = ref('')
  function showDemands(item: { name: string; demands: DemoDemand[] }) {
    selected.value = item.demands
    selectedTitle.value = item.name
  }
  function openDemand(id: string) {
    emit('detail', id)
    selected.value = []
  }
  const submitters = computed(() =>
    runtimeConfig.isPrototype
      ? demandDistribution(props.demands, props.users, 'submitter')
      : (props.statistics?.submitters ?? [])
  )
  const departments = computed(() =>
    runtimeConfig.isPrototype
      ? demandDistribution(props.demands, props.users, 'department')
      : (props.statistics?.departments ?? [])
  )
  const trend = computed(() =>
    runtimeConfig.isPrototype
      ? demandMonthlyTrend(props.demands)
      : (props.statistics?.trend ?? { months: [], departments: [] })
  )
  const panels = computed(() => [
    { title: '需求提出人分布', items: submitters.value },
    { title: '需求部门分布', items: departments.value }
  ])
  function detailTooltip(title: string, demands: DemoDemand[]) {
    const root = document.createElement('div')
    root.style.cssText = 'max-height:280px;max-width:340px;overflow:auto;white-space:normal'
    const heading = document.createElement('strong')
    heading.textContent = `${title} · ${demands.length} 个需求`
    root.append(heading)
    demands.forEach((d) => {
      const button = document.createElement('button')
      button.textContent = `${d.name} · ${props.users.find((u) => u.id === d.submitterId)?.name || '未知提出人'} · ${d.department}`
      button.style.cssText =
        'display:block;white-space:normal;text-align:left;padding:8px 0;width:100%;cursor:pointer;border-bottom:1px solid #eee'
      button.onclick = () => emit('detail', d.id)
      root.append(button)
    })
    return root
  }
  // 沿用 ArtRingChart 的环形系列与 useChartComponent，增加真实需求悬停明细。
  function ring(groups: ComputedRef<ReturnType<typeof demandDistribution>>) {
    const chart = useChartComponent({
      props: { height: '230px' },
      checkEmpty: () => !props.demands.length,
      watchSources: [() => groups.value],
      generateOptions: (): EChartsOption => ({
        color: CHART_COLORS,
        tooltip: {
          ...chart.getTooltipStyle('item'),
          confine: true,
          enterable: true,
          hideDelay: 250,
          formatter: (params) => {
            const item = groups.value[(Array.isArray(params) ? params[0] : params).dataIndex]
            return detailTooltip(item?.name || '', item?.demands || [])
          }
        },
        title: {
          text: `${props.demands.length}`,
          subtext: '需求总数',
          left: 'center',
          top: '38%',
          textStyle: {
            fontSize: 24,
            fontWeight: 500,
            color: chart.isDark.value ? '#ddd' : '#323251'
          },
          subtextStyle: { fontSize: 12 }
        },
        series: [
          {
            type: 'pie',
            radius: ['56%', '78%'],
            center: ['50%', '50%'],
            label: { show: false },
            data: groups.value.map((g) => ({ name: g.name, value: g.value })),
            emphasis: { scale: true },
            itemStyle: { borderRadius: 3 }
          }
        ]
      })
    })
    return chart.chartRef
  }
  const submitterChartRef = ring(submitters)
  const departmentChartRef = ring(departments)
  function setRingRef(el: Element | ComponentPublicInstance | null, index: number) {
    const target = index === 0 ? submitterChartRef : departmentChartRef
    target.value = el instanceof HTMLElement ? el : undefined
  }
  const {
    chartRef: trendChartRef,
    getAxisLabelStyle,
    getTooltipStyle,
    getSplitLineStyle,
    getLegendStyle,
    getChartInstance
  } = useChartComponent({
    props: { height: '270px' },
    checkEmpty: () => !trend.value.months.length,
    watchSources: [() => props.demands, () => props.users],
    generateOptions: (): EChartsOption => {
      getChartInstance()?.clear()
      return {
        color: CHART_COLORS,
        grid: { top: 15, right: 10, bottom: 50, left: 25, containLabel: true },
        tooltip: {
          ...getTooltipStyle('item'),
          confine: true,
          enterable: true,
          hideDelay: 250,
          formatter: (params) => {
            const item = Array.isArray(params) ? params[0] : params
            const month = trend.value.months[item.dataIndex]
            const matching = props.demands.filter(
              (d) =>
                d.department === item.seriesName &&
                d.submittedAt &&
                shanghaiDay(d.submittedAt).startsWith(month)
            )
            return detailTooltip(`${month} · ${item.seriesName}`, matching)
          }
        },
        legend: { ...getLegendStyle('bottom'), type: 'scroll' },
        xAxis: {
          type: 'category',
          data: trend.value.months,
          axisLabel: getAxisLabelStyle(),
          axisTick: { show: false }
        },
        yAxis: {
          type: 'value',
          minInterval: 1,
          axisLabel: getAxisLabelStyle(),
          splitLine: getSplitLineStyle()
        },
        series: trend.value.departments.map((d) => ({
          name: d.name,
          type: 'bar',
          stack: 'department',
          barMaxWidth: 38,
          data: d.data
        }))
      }
    }
  })
</script>
<style scoped src="./demand-charts.css"></style>
