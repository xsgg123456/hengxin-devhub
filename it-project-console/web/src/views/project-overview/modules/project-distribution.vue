<template>
  <section class="art-card p-5 mb-5">
    <div class="art-card-header mb-4"
      ><div class="title"><h4>项目状态分布</h4></div
      ><span class="text-xs text-g-500">悬停查看项目，点击明细打开详情</span></div
    >
    <ElEmpty v-if="!projects.length" description="当前范围暂无项目" />
    <div
      v-show="projects.length"
      ref="chartRef"
      style="height: 225px"
      aria-label="项目状态分布柱形图"
    />
    <div class="bucket-actions">
      <ElPopover v-for="bucket in buckets" :key="bucket.key" trigger="click" :width="340">
        <template #reference
          ><ElButton text size="small"
            >{{ bucket.name }} {{ bucket.projects.length }}</ElButton
          ></template
        >
        <p v-if="!bucket.projects.length">当前指标无项目</p>
        <div class="project-links"
          ><ElButton
            v-for="project in bucket.projects"
            :key="project.id"
            text
            @click="emit('select', project.id)"
            >{{ project.name }} · {{ owner(project) }}</ElButton
          ></div
        >
      </ElPopover>
    </div>
    <p class="text-xs text-g-500 mt-3">柱高 = 项目数；各指标可重叠，统计范围与下方项目明细一致。</p>
  </section>
</template>

<script setup lang="ts">
  import type { DemoProject, DemoUser } from '@/domain/prototype'
  import { projectDistribution } from '@/services/analytics-service'
  import { useChartComponent } from '@/hooks/core/useChart'
  import type { EChartsOption } from '@/plugins/echarts'

  const props = defineProps<{ projects: DemoProject[]; users: DemoUser[] }>()
  const emit = defineEmits<{ select: [projectId: string] }>()
  const buckets = computed(() => projectDistribution(props.projects))
  const owner = (p: DemoProject) =>
    props.users.find((u) => u.id === p.primaryOwnerId)?.name || '未指派'
  function tooltip(index: number) {
    const bucket = buckets.value[index]
    const root = document.createElement('div')
    root.style.cssText = 'max-height:280px;overflow:auto;max-width:340px;white-space:normal'
    if (!bucket) return root
    const title = document.createElement('strong')
    title.textContent = `${bucket.name} · ${bucket.projects.length} 个项目`
    root.append(title)
    bucket.projects.forEach((p) => {
      const button = document.createElement('button')
      button.style.cssText =
        'display:block;text-align:left;white-space:normal;padding:8px 0;width:100%;cursor:pointer;border-bottom:1px solid #eee'
      button.textContent = `${p.name} · ${owner(p)} · ${p.stage} · 预计交付 ${p.expectedDeliveryDate}${p.risks.length ? ' · ' + p.risks.join('；') : ''}`
      button.onclick = () => emit('select', p.id)
      root.append(button)
    })
    return root
  }
  // 复用 ArtBarChart 同源 hook，扩展其未开放的 tooltip 明细能力。
  const { chartRef, getAxisLabelStyle, getSplitLineStyle, getTooltipStyle } = useChartComponent({
    props: { height: '225px' },
    checkEmpty: () => !props.projects.length,
    watchSources: [() => props.projects, () => props.users],
    generateOptions: (): EChartsOption => ({
      grid: { left: 30, right: 15, top: 20, bottom: 35, containLabel: true },
      tooltip: {
        ...getTooltipStyle('item'),
        enterable: true,
        confine: true,
        hideDelay: 250,
        formatter: (params) => tooltip((Array.isArray(params) ? params[0] : params).dataIndex)
      },
      xAxis: {
        type: 'category',
        data: buckets.value.map((b) => b.name),
        axisTick: { show: false },
        axisLabel: { ...getAxisLabelStyle(), interval: 0 }
      },
      yAxis: {
        type: 'value',
        minInterval: 1,
        splitLine: getSplitLineStyle(),
        axisLabel: getAxisLabelStyle()
      },
      series: [
        {
          type: 'bar',
          barMaxWidth: 46,
          label: { show: true, position: 'top' },
          itemStyle: { borderRadius: [4, 4, 0, 0] },
          data: buckets.value.map((b) => ({
            value: b.projects.length,
            itemStyle: { color: b.color }
          }))
        }
      ]
    })
  })
</script>

<style scoped>
  .bucket-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-around;
    gap: 4px;
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
    justify-content: flex-start;
    text-align: left;
  }
</style>
