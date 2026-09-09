<template>
  <BusinessPageState>
    <div>
      <div class="flex-cb mb-5">
        <div
          ><h2 class="text-xl font-medium text-g-900">我的需求 / 需求池</h2
          ><p class="mt-1.5 text-sm text-g-500"
            >查看需求材料、评估结果，以及立项后的推进状态</p
          ></div
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
            <div
              class="absolute top-0 bottom-0 right-5 m-auto size-11 rounded-xl flex-cc bg-theme/10"
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
      <ElAlert v-if="error" :title="error" type="error" :closable="false" class="mb-5"
        ><ElButton @click="retry">重新加载</ElButton></ElAlert
      >
      <ElSkeleton v-if="loading" :rows="5" animated class="mb-5" />
      <ElAlert
        v-if="deepLinkError"
        :title="deepLinkError"
        type="warning"
        class="mb-5"
        @close="closeDetail"
      />
      <DemandCharts
        v-if="!loading && !error"
        :statistics="statistics"
        :demands="demands"
        :users="prototypeStore.database?.users ?? []"
        @detail="showDemand"
      />
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
          v-if="!loading && !error"
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
          <ElTableColumn label="操作" fixed="right" min-width="195">
            <template #default="{ row }">
              <DemandLifecycleActions :demand="row" />
              <ElButton
                v-if="linkedProject(row.id)"
                link
                type="primary"
                @click="openProject(row.id)"
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
      <DemandDetail v-if="detail" :demand="detail" @close="closeDetail" />
      <DemandReview
        v-if="review"
        :demand="review"
        @close="review = undefined"
        @saved="review = undefined"
      />
    </div>
  </BusinessPageState>
</template>

<script setup lang="ts">
  import BusinessPageState from '@/components/system/business-page-state.vue'
  import DemandEditor from '@/components/demand/demand-editor.vue'
  import DemandDetail from '@/components/demand/demand-detail.vue'
  import DemandReview from '@/components/demand/demand-review.vue'
  import DemandLifecycleActions from '@/components/demand/demand-lifecycle-actions.vue'
  import DemandCharts from './modules/demand-charts.vue'
  import { useDemandPage } from '@/hooks/business/use-demand-page'
  const {
    prototypeStore,
    scope,
    keyword,
    status,
    department,
    departments,
    demands,
    metrics,
    editing,
    selected,
    detail,
    deepLinkError,
    closeDetail,
    review,
    showDemand,
    userName,
    canEdit,
    openEditor,
    openProject,
    demandStatusLabel,
    demandStatusText,
    demandStatusType,
    linkedProject,
    projectResult,
    formatDate,
    formatDateTime,
    statistics,
    loading,
    error,
    retry
  } = useDemandPage()
</script>
