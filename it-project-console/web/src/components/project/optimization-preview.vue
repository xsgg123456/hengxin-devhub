<template>
  <section class="optimization-section">
    <template v-if="project.parentProjectId">
      <span class="text-xs text-g-500">所属原项目</span>
      <ElButton link type="primary" @click="openProject(project.parentProjectId)">{{ parent?.name || '查看原项目' }}</ElButton>
    </template>
    <template v-else>
      <div class="section-heading">
        <div><h4>后续优化 <ElTag size="small" type="info">{{ records.length }} 条</ElTag></h4><p>独立审批、排期与业务验收</p></div>
        <ElButton v-if="project.status === 'completed'" type="primary" plain @click="editing = true">提优化需求</ElButton>
      </div>
      <p v-if="!records.length" class="empty">暂无优化需求</p>
      <div v-for="row in records" :key="row.id" class="optimization-row">
        <div><strong>{{ row.name || '未命名草稿' }}</strong><p>期望完成 {{ row.expectedLaunchDate || '未填写' }}</p></div>
        <ElTag>{{ linkedProject(row.id) ? optimizationStatus(linkedProject(row.id)!) : demandLabels[row.status] }}</ElTag>
        <ElButton link type="primary" @click="inspect(row)">查看</ElButton>
      </div>
    </template>
    <DemandEditor v-if="editing" :parent-project-id="project.id" @close="editing = false" @saved="editing = false" />
  </section>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { DemoProject, DemoDemand } from '@/domain/prototype'
import { usePrototypeStore } from '@/store/modules/prototype'
import { optimizationStatus } from '@/utils/optimization-display'
import DemandEditor from '@/components/demand/demand-editor.vue'
const props = defineProps<{ project: DemoProject }>()
const store = usePrototypeStore(), router = useRouter(), editing = ref(false)
const records = computed(() => store.visibleDemands.filter(d => d.parentProjectId === props.project.id))
const parent = computed(() => store.visibleProjects.find(p => p.id === props.project.parentProjectId))
const linkedProject = (id: string) => store.visibleProjects.find(p => p.demandId === id)
const demandLabels = { draft: '草稿', pending: '待优化审批', returned: '退回补充', rejected: '未通过', established: '优化已批准', withdrawn: '已撤回', awaiting_engineer: '待工程师接单' }
function openProject(id: string) { void router.push({ path: '/project-overview', query: { projectId: id } }) }
function inspect(row: DemoDemand) {
  const project = linkedProject(row.id)
  if (project) openProject(project.id)
  else void router.push({ path: '/my-demands', query: { demandId: row.id } })
}
</script>
<style scoped>
.optimization-section { margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--art-card-border); }
.section-heading, .optimization-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
h4 { font-weight: 500; overflow-wrap: anywhere; }
.section-heading p, .optimization-row p, .empty { font-size: 12px; color: var(--art-gray-600); margin-top: 7px; }
.optimization-row { padding: 15px 0; border-bottom: 1px solid var(--art-card-border); font-size: 13px; }
.optimization-row > div { flex: 1; min-width: 140px; overflow-wrap: anywhere; }
</style>
