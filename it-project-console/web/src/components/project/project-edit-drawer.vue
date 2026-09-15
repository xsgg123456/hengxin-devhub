<template>
  <ElDrawer :model-value="modelValue" title="编辑项目" size="min(960px, 95vw)" :before-close="beforeClose" append-to-body @update:model-value="emit('update:modelValue', $event)">
    <template v-if="form">
      <div class="edit-heading"><div><h3>{{ project.name }}</h3><p>{{ projectCode(project) }} · 全局编辑</p></div><ElTag :type="pending ? 'warning' : 'success'">{{ pending ? '迁移待核实' : '正常项目' }}</ElTag></div>
      <ElAlert v-if="runtimeConfig.isPrototype" title="交互预览：修改保存在当前浏览器，未接入生产数据和通知。" type="info" :closable="false" class="mb-4" />
      <ElAlert v-if="store.currentUser.role === 'engineer'" title="主负责工程师可整理本项目的迁移资料；完成核实或转交主责后，恢复原有日常权限。" type="warning" :closable="false" class="mb-4" />
      <ElTabs v-model="tab">
        <ElTabPane label="基本资料" name="basic" />
        <ElTabPane label="人员关联" name="people" />
        <ElTabPane label="阶段与日期" name="schedule" />
        <ElTabPane v-if="pending" label="迁移核实" name="migration" />
      </ElTabs>
      <ElForm label-position="top" :disabled="busy" class="edit-form">
        <section v-show="tab === 'basic'">
          <ElFormItem label="项目名称" required><ElInput v-model="form.name" aria-label="项目名称" maxlength="100" /></ElFormItem>
          <ElFormItem label="需求首次提出日期"><ElDatePicker v-model="form.firstRequestedOn" aria-label="需求首次提出日期" type="date" value-format="YYYY-MM-DD" placeholder="未知可暂留空，待核实后补录" :disabled-date="futureDate" /><p class="hint">业务实际首次提出需求的日期。退回重提、立项和迁移不改变该日期。</p></ElFormItem>
          <div class="edit-grid"><ElFormItem label="需求部门" required><ElInput v-model="form.department" aria-label="需求部门" /></ElFormItem><ElFormItem label="优先级"><ElRadioGroup v-model="form.priority"><ElRadioButton v-for="p in ['P0','P1','P2']" :key="p" :value="p">{{ p }}</ElRadioButton></ElRadioGroup></ElFormItem></div>
          <ElFormItem label="项目描述"><ElInput v-model="form.description" aria-label="项目描述" type="textarea" :rows="5" maxlength="3000" show-word-limit /></ElFormItem>
          <ElFormItem label="交付访问链接"><ElInput v-model="form.acceptanceUrl" aria-label="交付访问链接" placeholder="填写项目访问地址" /></ElFormItem>
          <ElFormItem label="交付说明"><ElInput v-model="form.acceptanceSummary" aria-label="交付说明" type="textarea" :rows="3" /></ElFormItem>
          <p class="hint">项目编号和历史操作记录保留。关联需求附件仍通过原有需求材料入口管理。</p>
        </section>
        <section v-show="tab === 'people'">
          <div class="edit-grid"><ElFormItem label="业务负责人"><ElSelect v-model="form.businessOwnerId" filterable clearable aria-label="业务负责人"><ElOption v-for="u in users" :key="u.id" :label="u.name + ' · ' + u.department" :value="u.id" /></ElSelect></ElFormItem><ElFormItem label="业务验收人"><ElSelect v-model="form.acceptanceOwnerId" filterable clearable aria-label="业务验收人"><ElOption v-for="u in users" :key="u.id" :label="u.name + ' · ' + u.department" :value="u.id" /></ElSelect></ElFormItem></div>
          <ElFormItem label="主负责工程师" required><ElSelect v-model="form.primaryOwnerId" filterable aria-label="主负责工程师" @change="form.collaboratorIds = form.collaboratorIds.filter(id => id !== form!.primaryOwnerId)"><ElOption v-for="u in engineers" :key="u.id" :label="u.name + ' · ' + u.department" :value="u.id" /></ElSelect></ElFormItem>
          <ElFormItem label="协作人员"><ElSelect v-model="form.collaboratorIds" multiple filterable aria-label="协作人员"><ElOption v-for="u in engineers" :key="u.id" :label="u.name + ' · ' + u.department" :value="u.id" :disabled="u.id === form.primaryOwnerId" /></ElSelect></ElFormItem>
          <ElAlert v-if="peopleChanges.length" title="保存后的人员变化" type="warning" :closable="false" show-icon><p v-for="line in peopleChanges" :key="line">{{ line }}</p><p>工程师的负责/参与项目、编辑权限和人员负载同步更新。业务负责人独立记录，原提出人和历史操作人保留；{{ runtimeConfig.isPrototype ? '当前为本地预览，不发送正式通知。' : '关联待办和后续通知按最新人员归属及系统通知设置处理。' }}</p></ElAlert>
          <ElEmpty v-if="!users.length" description="暂无可选人员" />
        </section>
        <section v-show="tab === 'schedule'">
          <div class="edit-grid"><ElFormItem label="当前环节"><ElSelect v-model="form.stage" aria-label="当前环节"><ElOption v-for="s in (project.parentProjectId ? ['验收交付'] : PROJECT_STAGES)" :key="s" :label="project.parentProjectId ? '优化交付' : s" :value="s" /></ElSelect></ElFormItem><ElFormItem label="环节状态"><ElSelect v-model="form.simpleStatus" aria-label="环节状态"><ElOption v-for="s in editableStatuses" :key="s" :label="statusLabel[s]" :value="s" /></ElSelect></ElFormItem></div>
          <ElAlert title="业务验收结果继续沿用原验收入口；本表单不会直接标记项目验收通过。" type="info" :closable="false" class="mb-4" />
          <ElFormItem v-if="form.simpleStatus === 'blocked'" label="阻塞说明" required><ElInput v-model="form.blocker" aria-label="阻塞说明" type="textarea" /></ElFormItem>
          <div class="edit-grid"><ElFormItem v-for="item in (project.parentProjectId ? dateFields.filter(d => d.key === 'approvedLaunchDate') : dateFields)" :key="item.key" :label="item.label"><ElDatePicker v-model="form[item.key]" :aria-label="item.label" value-format="YYYY-MM-DD" type="date" /></ElFormItem></div>
          <h4 class="mb-3">{{ project.parentProjectId ? '优化交付计划' : '七个环节计划' }}</h4>
          <div v-for="plan in form.stagePlans" :key="plan.stage" class="plan-row"><span>{{ project.parentProjectId ? '优化交付' : plan.stage }}</span><ElDatePicker v-model="plan.startDate" :aria-label="plan.stage + '计划开始'" value-format="YYYY-MM-DD" placeholder="计划开始" /><ElDatePicker v-model="plan.endDate" :aria-label="plan.stage + '计划结束'" value-format="YYYY-MM-DD" placeholder="计划结束" /></div>
          <p class="hint">历史实际发生记录保留；计划日期修改将记录本次原因。各环节计划须按顺序衔接；已填写上线部署或验收交付计划时，预计上线、交付须与对应计划结束日期一致。</p>
        </section>
        <section v-show="tab === 'migration'">
          <ElAlert title="核实完成后，项目恢复正常管理" type="success" :closable="false">保存修改可分次整理；完成核实将去掉项目名称中的迁移标记，真实延期和阻塞仍保留。</ElAlert>
          <div class="check-row" v-for="item in checks" :key="item.label"><span>{{ item.label }}</span><ElTag :type="item.ok ? 'success' : 'warning'">{{ item.ok ? '已填写' : '待补齐' }}</ElTag></div>
          <p class="hint">请核对内容真实性。系统检查字段是否齐备，不能代替人工核实。</p>
        </section>
      </ElForm>
      <ElAlert v-if="error" class="mt-4" :title="error" type="error" :closable="false" show-icon />
    </template>
    <template #footer><div class="edit-footer"><span class="hint">{{ dirty ? '有未保存的修改' : '尚未修改' }}</span><div><ElButton v-if="canRegisterHistory && !project.parentProjectId" :disabled="busy" @click="openHistorical">登记历史已交付</ElButton><ElButton :disabled="busy" @click="beforeClose(() => emit('update:modelValue', false))">取消</ElButton><ElButton :loading="busy" :disabled="!dirty" :type="pending ? 'default' : 'primary'" @click="prepare(false)">保存修改</ElButton><ElButton v-if="pending" type="primary" :loading="busy" @click="prepare(true)">保存并完成核实</ElButton></div></div></template>
    <HistoricalDeliveryDialog v-model="historicalOpen" :project="project" :dirty="dirty" @completed="emit('update:modelValue', false)" />
    <ElDialog v-model="confirmOpen" title="确认本次修改" width="min(560px, 92vw)" append-to-body :close-on-click-modal="false" :show-close="!busy" :close-on-press-escape="!busy">
      <p class="mb-3">{{ verifying ? '保存全部修改，并解除迁移待核实标记。' : '以下修改将同步到项目相关页面。' }}</p>
      <ElAlert v-if="store.currentUser.role === 'engineer' && (verifying || form?.primaryOwnerId !== store.currentUser.id)" title="保存后你将不再拥有此项目的完整编辑权限；后续资料纠正可联系指定管理员。" type="warning" :closable="false" class="mb-3" />
      <div v-for="line in changes" :key="line" class="change-row">{{ line }}</div>
      <ElFormItem label="修改原因" required class="mt-4"><ElInput v-model="reason" aria-label="修改原因" type="textarea" :rows="3" maxlength="300" placeholder="例如：按旧系统实际资料核实项目" /></ElFormItem>
      <ElAlert v-if="error" :title="error" type="error" :closable="false" />
      <template #footer><ElButton :disabled="busy" @click="confirmOpen = false">返回编辑</ElButton><ElButton type="primary" :loading="busy" @click="save">确认保存</ElButton></template>
    </ElDialog>
  </ElDrawer>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import HistoricalDeliveryDialog from './historical-delivery-dialog.vue'
import { canEditProject } from '@/utils/project-edit-permission'
import { runtimeConfig } from '@/config/runtime'
import { editLiveProject } from '@/services/live-project-service'
import { liveOperationKey } from '@/services/live-demand-service'
import { ElMessage } from 'element-plus'
import { PROJECT_STAGES, type DemoProject, type SimpleStatus } from '@/domain/prototype'
import { usePrototypeStore } from '@/store/modules/prototype'
import { useUnsavedForm } from '@/hooks/business/use-unsaved-form'
import { projectCode } from '@/utils/project-code'
import { statusLabel } from '@/utils/project-display'
import { isEngineerEligible } from '@/utils/engineer-eligibility'
import { shanghaiDay } from '@/services/workflow-validation'
import { isMigrationPending, saveProjectEditPreview } from '@/services/project-edit-preview'
const props = defineProps<{ modelValue: boolean; project: DemoProject }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
const store = usePrototypeStore()
let operationKey = liveOperationKey()
const futureDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` > shanghaiDay(new Date().toISOString())
const form = ref<DemoProject>()
const baseline = ref(''), initialForm = ref(''), tab = ref('basic'), reason = ref(''), error = ref('')
const confirmOpen = ref(false), verifying = ref(false)
const historicalOpen = ref(false)
const canRegisterHistory = computed(() => canEditProject(store.currentUser, props.project) && props.project.status === 'active' && !props.project.archived)
function openHistorical() {
  if (dirty.value) { error.value = '有未保存的修改，请先保存或放弃修改，再登记历史交付'; return }
  error.value = ''; historicalOpen.value = true
}
const busy = computed(() => store.saving)
const dirty = computed(() => props.modelValue && JSON.stringify(form.value) !== initialForm.value)
const { beforeClose } = useUnsavedForm('project-edit', dirty, busy)
const users = computed(() => store.database?.users ?? [])
const engineers = computed(() => users.value.filter(isEngineerEligible))
const pending = computed(() => isMigrationPending(props.project))
const editableStatuses = computed<SimpleStatus[]>(() => props.project.simpleStatus === 'completed' ? ['completed'] : ['not-started', 'in-progress', 'nearly-done', 'blocked'])
const dateFields = [
  { key: 'approvedLaunchDate', label: '审批确认上线日期' }, { key: 'expectedLaunchDate', label: '预计上线' }, { key: 'expectedDeliveryDate', label: '预计交付' }, { key: 'originalLaunchDate', label: '原计划上线' }, { key: 'originalDeliveryDate', label: '原计划交付' }
] as const
const name = (id?: string | null) => users.value.find(u => u.id === id)?.name || '未指定'
const peopleChanges = computed(() => {
  if (!form.value) return []
  const fields = [['primaryOwnerId', '主负责工程师'], ['businessOwnerId', '业务负责人'], ['acceptanceOwnerId', '业务验收人']] as const
  const lines = fields.filter(([key]) => form.value![key] !== props.project[key]).map(([key, label]) => `${label}：${name(props.project[key])} → ${name(form.value![key])}`)
  if (JSON.stringify(form.value.collaboratorIds) !== JSON.stringify(props.project.collaboratorIds)) lines.push(`协作人员：${props.project.collaboratorIds.map(name).join('、') || '无'} → ${form.value.collaboratorIds.map(name).join('、') || '无'}`)
  return lines
})
const changes = computed(() => {
  if (!form.value) return []
  const lines = [...peopleChanges.value]
  const originalDate = (JSON.parse(initialForm.value) as DemoProject).firstRequestedOn || ''
  if ((form.value.firstRequestedOn || '') !== originalDate) lines.push(`需求首次提出日期：${originalDate || '待核实'} → ${form.value.firstRequestedOn || '待核实'}`)
  for (const [key, label] of [['name','项目名称'], ['department','需求部门'], ['priority','优先级'], ['stage','当前环节'], ['simpleStatus','环节状态'], ...dateFields.map(d => [d.key, d.label])] as [keyof DemoProject, string][]) {
    if (form.value[key] !== props.project[key]) lines.push(`${label}：${props.project[key] || '未填写'} → ${form.value[key] || '未填写'}`)
  }
  if (JSON.stringify(form.value.stagePlans) !== JSON.stringify((JSON.parse(initialForm.value) as DemoProject).stagePlans)) lines.push('七环节计划已调整，请核对日期')
  if (['description','acceptanceUrl','acceptanceSummary','blocker'].some(k => form.value![k as keyof DemoProject] !== props.project[k as keyof DemoProject])) lines.push('项目描述、交付资料或阻塞说明已修改')
  return lines
})
const checks = computed(() => [
  { label: '需求首次提出日期', ok: !!form.value?.firstRequestedOn },
  { label: '项目名称与需求部门', ok: !!form.value?.name.trim() && !!form.value.department.trim() },
  { label: '主负责工程师', ok: !!form.value?.primaryOwnerId },
  { label: '业务负责人及验收人', ok: !!form.value?.businessOwnerId && !!form.value.acceptanceOwnerId },
  { label: '预计上线与交付日期', ok: !!form.value?.expectedLaunchDate && !!form.value.expectedDeliveryDate }
])
watch(() => props.modelValue, open => {
  if (!open) return
  operationKey = liveOperationKey()
  baseline.value = JSON.stringify(store.database?.projects.find(p => p.id === props.project.id) ?? props.project)
  form.value = JSON.parse(baseline.value) as DemoProject
  form.value.firstRequestedOn ||= store.database?.demands.find(d => d.id === form.value!.demandId)?.firstRequestedOn || ''
  form.value.stagePlans = (props.project.parentProjectId ? ['验收交付' as const] : PROJECT_STAGES).map(stage => form.value!.stagePlans?.find(p => p.stage === stage) ?? { stage, startDate: '', endDate: '' })
  initialForm.value = JSON.stringify(form.value)
  tab.value = 'basic'; reason.value = ''; error.value = ''; confirmOpen.value = false; historicalOpen.value = false
}, { immediate: true })
function prepare(verify: boolean) {
  const delivery = form.value?.parentProjectId ? form.value.stagePlans?.find(p => p.stage === '验收交付' && p.startDate && p.endDate) : undefined
  if (delivery && form.value) form.value.expectedLaunchDate = form.value.expectedDeliveryDate = delivery.endDate
  verifying.value = verify; error.value = ''; confirmOpen.value = true
}
async function save() {
  if (!form.value) return
  error.value = ''
  try {
    const edited = JSON.parse(JSON.stringify(form.value)) as DemoProject
    if (runtimeConfig.isPrototype)
      await store.runCommand(draft => saveProjectEditPreview(draft, edited, baseline.value, reason.value, verifying.value))
    else {
      const requestId = operationKey({ edited, reason: reason.value, verify: verifying.value })
      await store.runLiveCommand(() => editLiveProject(edited, reason.value, verifying.value, requestId))
    }
    initialForm.value = JSON.stringify(form.value)
    confirmOpen.value = false
    emit('update:modelValue', false)
    ElMessage.success(verifying.value ? '核实完成，项目已恢复正常管理' : '项目已保存，相关页面已同步')
  } catch (e) { error.value = e instanceof Error ? e.message : '保存失败，请重试' }
}
</script>
<style scoped>
.edit-heading { display:flex; justify-content:space-between; gap:16px; margin-bottom:18px; }
.edit-heading h3 { font-size:18px; font-weight:600; }
.edit-heading p,.hint { font-size:12px; color:var(--el-text-color-secondary); line-height:1.7; }
.edit-heading p { margin-top:8px; }
.edit-grid { display:grid; grid-template-columns:1fr 1fr; gap:0 24px; }
.edit-form { padding-top:12px; }
.edit-form :deep(.el-select), .edit-form :deep(.el-date-editor) { width:100%; min-width:0; }
.plan-row { display:grid; grid-template-columns:90px 1fr 1fr; gap:12px; align-items:center; margin-bottom:12px; }
.check-row { display:flex; justify-content:space-between; padding:20px 0; border-bottom:1px solid var(--el-border-color-lighter); }
.edit-footer { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; }
.edit-footer > div { display:flex; flex-wrap:wrap; gap:8px; }
.edit-footer :deep(.el-button + .el-button) { margin-left:0; }
.change-row { padding:8px 0; border-bottom:1px solid var(--el-border-color-lighter); overflow-wrap:anywhere; }
@media(max-width:600px) { .edit-grid { grid-template-columns:1fr; } .plan-row { grid-template-columns:1fr 1fr; } .plan-row > span { grid-column:1 / -1; } }
</style>


