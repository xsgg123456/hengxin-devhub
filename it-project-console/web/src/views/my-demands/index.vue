<template>
  <div>
    <div class="flex-cb mb-5">
      <div
        ><h2 class="text-xl font-medium text-g-900">我的需求 / 需求池</h2
        ><p class="mt-1.5 text-sm text-g-500">查看需求材料、评估结果，以及立项后的推进状态</p></div
      >
      <ElRadioGroup v-model="scope" aria-label="需求范围">
        <ElRadioButton value="mine">本人需求</ElRadioButton>
        <ElRadioButton value="all">全部需求</ElRadioButton>
      </ElRadioGroup>
    </div>
    <ElRow :gutter="20">
      <ElCol v-for="metric in metrics" :key="metric.label" :span="6">
        <div class="art-card relative flex flex-col justify-center h-30 px-5 mb-5">
          <span class="text-g-600 text-sm">{{ metric.label }}</span
          ><span class="text-2xl font-medium mt-2">{{ metric.value }}</span>
          <div class="absolute top-0 bottom-0 right-5 m-auto size-11 rounded-xl flex-cc bg-theme/10"
            ><ArtSvgIcon :icon="metric.icon" class="text-xl text-theme"
          /></div>
        </div>
      </ElCol>
    </ElRow>
    <div class="art-card p-5 mb-5">
      <h3 class="font-medium mb-3">需求提交通道</h3>
      <ElAlert
        title="填写业务目标与材料，提交后进入待评估；管理人员立项后将生成正式项目。"
        type="info"
        :closable="false"
        class="mb-4"
      />
      <ElButton class="mt-4" type="primary" @click="openEditor()">提交正式项目需求</ElButton>
    </div>
    <div class="art-card p-5">
      <div class="art-card-header mb-4"
        ><div class="title"><h4>需求清单</h4><p>按提交时间从新到旧排列</p></div
        ><ElTag effect="plain" round>{{ demands.length }} 条记录</ElTag></div
      >
      <ElForm inline label-position="top" class="mb-3">
        <ElFormItem label="搜索需求"
          ><ElInput v-model="keyword" placeholder="名称或编号" clearable
        /></ElFormItem>
        <ElFormItem label="需求状态"
          ><ElSelect v-model="status" clearable placeholder="全部状态" style="width: 170px">
            <ElOption
              v-for="(label, value) in demandStatusLabel"
              :key="value"
              :value="value"
              :label="label"
            /> </ElSelect
        ></ElFormItem>
        <ElFormItem label="需求部门"
          ><ElSelect v-model="department" clearable placeholder="全部部门" style="width: 170px">
            <ElOption
              v-for="item in departments"
              :key="item"
              :value="item"
              :label="item"
            /> </ElSelect
        ></ElFormItem>
      </ElForm>
      <ElTable
        :data="demands"
        row-key="id"
        stripe
        :empty-text="
          keyword || status || department
            ? '没有符合筛选条件的需求'
            : '还没有需求，可点击上方按钮提交'
        "
      >
        <ElTableColumn label="需求名称" min-width="190"
          ><template #default="{ row }"
            ><div class="leading-5"
              ><p class="font-medium text-g-900">{{ row.name }}</p
              ><span class="text-xs text-g-500">{{ row.id }}</span></div
            ></template
          ></ElTableColumn
        >
        <ElTableColumn prop="department" label="提出部门" min-width="105" />
        <ElTableColumn label="提出人" min-width="80"
          ><template #default="{ row }">{{ userName(row.submitterId) }}</template></ElTableColumn
        >
        <ElTableColumn label="需求状态" min-width="100"
          ><template #default="{ row }"
            ><ElTag :type="demandStatusType(row.status)" effect="light" round>{{
              demandStatusText(row.status)
            }}</ElTag></template
          ></ElTableColumn
        >
        <ElTableColumn label="期望上线" min-width="110"
          ><template #default="{ row }">{{
            formatDate(row.expectedLaunchDate)
          }}</template></ElTableColumn
        >
        <ElTableColumn label="提交时间" min-width="120"
          ><template #default="{ row }">{{
            formatDateTime(row.submittedAt)
          }}</template></ElTableColumn
        >
        <ElTableColumn label="推进结果" min-width="140"
          ><template #default="{ row }"
            ><span :class="linkedProject(row.id) ? 'text-theme' : 'text-g-500'">{{
              projectResult(row.id)
            }}</span></template
          ></ElTableColumn
        >
        <ElTableColumn label="操作" fixed="right" min-width="160">
          <template #default="{ row }">
            <ElButton v-if="linkedProject(row.id)" link type="primary" @click="openProject(row.id)"
              >项目进展</ElButton
            >
            <ElButton v-else link type="primary" @click="detail = row">查看</ElButton>
            <ElButton v-if="canEdit(row)" link type="primary" @click="openEditor(row)">{{
              row.status === 'returned' ? '补充重提' : '编辑'
            }}</ElButton>
            <ElButton
              v-if="prototypeStore.currentUser.role === 'manager' && row.status === 'pending'"
              link
              type="primary"
              @click="review = row"
              >评估</ElButton
            >
          </template>
        </ElTableColumn>
      </ElTable>
    </div>
    <DemandEditor
      v-if="editing"
      :demand="selected"
      @close="editing = false"
      @saved="editing = false"
    />
    <DemandDetail v-if="detail" :demand="detail" @close="detail = undefined" />
    <DemandReview
      v-if="review"
      :demand="review"
      @close="review = undefined"
      @saved="review = undefined"
    />
  </div>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { useRouter } from 'vue-router'
  import { displayTime } from '@/utils/project-display'
  import DemandEditor from '@/components/demand/demand-editor.vue'
  import DemandDetail from '@/components/demand/demand-detail.vue'
  import DemandReview from '@/components/demand/demand-review.vue'
  import type { DemoDemand, DemandStatus } from '@/domain/prototype'
  import { usePrototypeStore } from '@/store/modules/prototype'

  const prototypeStore = usePrototypeStore()
  const router = useRouter()
  const scope = ref(prototypeStore.currentUser.role === 'business' ? 'mine' : 'all')
  const keyword = ref('')
  const status = ref('')
  const department = ref('')
  const editing = ref(false)
  const selected = ref<DemoDemand>()
  const detail = ref<DemoDemand>()
  const review = ref<DemoDemand>()
  watch(
    () => prototypeStore.currentUser.id,
    () => {
      scope.value = prototypeStore.currentUser.role === 'business' ? 'mine' : 'all'
      keyword.value = ''
      status.value = ''
      department.value = ''
      editing.value = false
      selected.value = undefined
      detail.value = undefined
      review.value = undefined
    }
  )
  const departments = computed(() => [
    ...new Set(prototypeStore.database?.demands.map((d) => d.department) || [])
  ])
  const demands = computed(() =>
    (prototypeStore.database?.demands || [])
      .filter(
        (d) =>
          (scope.value === 'all' || d.submitterId === prototypeStore.currentUser.id) &&
          (!status.value || d.status === status.value) &&
          (!department.value || d.department === department.value) &&
          (!keyword.value.trim() ||
            `${d.name} ${d.id}`.toLowerCase().includes(keyword.value.trim().toLowerCase()))
      )
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
  )
  const userName = (id: string) =>
    prototypeStore.database?.users.find((user) => user.id === id)?.name || id
  const canEdit = (demand: DemoDemand) =>
    demand.submitterId === prototypeStore.currentUser.id &&
    ['draft', 'pending', 'returned', 'withdrawn'].includes(demand.status)
  function openEditor(demand?: DemoDemand) {
    selected.value = demand
    editing.value = true
  }
  function openProject(demandId: string) {
    const project = linkedProject(demandId)
    if (project) router.push({ path: '/project-overview', query: { projectId: project.id } })
  }
  const pendingCount = computed(
    () => demands.value.filter((demand) => demand.status === 'pending').length
  )
  const establishedCount = computed(
    () => demands.value.filter((demand) => demand.status === 'established').length
  )
  const metrics = computed(() => [
    { label: '当前范围需求', value: demands.value.length, icon: 'ri:file-list-3-line' },
    { label: '待评估', value: pendingCount.value, icon: 'ri:timer-line' },
    { label: '已立项', value: establishedCount.value, icon: 'ri:checkbox-circle-line' },
    {
      label: '关联在途项目',
      value: demands.value.filter((d) => linkedProject(d.id)?.status === 'active').length,
      icon: 'ri:git-branch-line'
    }
  ])
  const demandStatusLabel: Record<DemandStatus, string> = {
    draft: '草稿',
    rejected: '不予立项',
    pending: '待评估',
    returned: '退回补充',
    established: '已立项',
    withdrawn: '已撤回'
  }
  const demandStatusText = (status: DemandStatus) => demandStatusLabel[status]
  const demandStatusType = (status: DemandStatus) =>
    status === 'established' ? 'success' : status === 'pending' ? 'warning' : 'info'
  const linkedProject = (demandId: string) =>
    (prototypeStore.database?.projects || []).find((project) => project.demandId === demandId)
  const projectResult = (demandId: string) => {
    const project = linkedProject(demandId)
    return project ? `已转 ${project.id} · ${project.stage}` : '尚未转为项目'
  }
  const formatDate = (value: string) => value || '—'
  const formatDateTime = displayTime
</script>
