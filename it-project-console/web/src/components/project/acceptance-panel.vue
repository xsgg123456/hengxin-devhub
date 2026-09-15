<template>
  <section class="mt-5" style="overflow-wrap: anywhere">
    <h4 class="font-medium mb-3">业务验收</h4>
    <ElTag>{{ acceptanceLabel(project) }}</ElTag>
    <ElDescriptions :column="1" border class="mt-3 mb-4">
      <ElDescriptionsItem label="业务验收负责人">{{
        userName(project.acceptanceOwnerId)
      }}</ElDescriptionsItem>
      <ElDescriptionsItem label="提交时间">{{
        project.acceptanceSubmittedAt ? displayTime(project.acceptanceSubmittedAt) : '尚未提交'
      }}</ElDescriptionsItem>
      <ElDescriptionsItem v-if="pending" label="等待时长"
        >{{ waiting }} 个工作日</ElDescriptionsItem
      >
      <ElDescriptionsItem label="交付说明"
        ><p class="whitespace-pre-wrap">{{
          project.acceptanceSummary || '暂无交付说明'
        }}</p></ElDescriptionsItem
      >
      <ElDescriptionsItem v-if="safeUrl" label="交付访问链接"
        ><a :href="safeUrl" target="_blank" rel="noopener noreferrer" class="text-theme">{{
          project.acceptanceUrl
        }}</a></ElDescriptionsItem
      >
    </ElDescriptions>
    <ElAlert v-if="error" :title="error" type="error" :closable="false" role="alert" class="mb-3" />
    <ElAlert
      v-if="staleDraft"
      title="项目已更新，验收草稿已保留。请核对最新信息后确认版本再提交。"
      type="warning"
      :closable="false"
      class="mb-3"
    >
      <ElButton @click="baselineVersion = project.version ?? 0">保留草稿并确认最新版本</ElButton>
    </ElAlert>
    <ElForm
      v-if="editable"
      label-position="top"
      :disabled="store.saving || staleDraft"
      @submit.prevent
    >
      <template v-if="store.currentUser.role === 'manager'">
        <ElFormItem label="业务验收负责人"
          ><ElSelect
            class="w-full"
            v-model="ownerId"
            aria-label="业务验收负责人"
            placeholder="请选择公司人员"
          >
            <ElOption
              v-for="u in candidates"
              :key="u.id"
              :label="u.name"
              :value="u.id"
            /> </ElSelect
        ></ElFormItem>
        <ElFormItem label="改派原因"
          ><ElInput
            v-model="assignReason"
            aria-label="改派原因"
            type="textarea"
            maxlength="2000"
            show-word-limit
        /></ElFormItem>
        <ElButton :loading="store.saving" @click="save('assign')">保存验收负责人</ElButton>
      </template>
      <template v-if="primary && project.stage === '验收交付' && !pending">
        <ElAlert
          v-if="needsPlan(project) || !validOwner"
          class="my-3"
          type="warning"
          :closable="false"
          :title="needsPlan(project) ? '请先制定完整计划' : '请管理人员指定有效业务验收负责人'"
        />
        <ElFormItem label="交付说明" class="mt-3"
          ><ElInput
            v-model="summary"
            aria-label="交付说明"
            type="textarea"
            :rows="4"
            maxlength="2000"
            show-word-limit
        /></ElFormItem>
        <ElFormItem label="交付访问链接（选填）"
          ><ElInput
            v-model="url"
            aria-label="交付访问链接（选填）"
            maxlength="2000"
            placeholder="域名或内网地址，如 192.168.1.10:8080"
        /><p class="text-sm text-g-600 mt-1">支持 HTTP/HTTPS，未填写协议时按 http:// 打开</p></ElFormItem>
        <ElButton
          type="primary"
          :loading="store.saving"
          :disabled="needsPlan(project) || !validOwner"
          @click="save('submit')"
          >提交验收</ElButton
        >
      </template>
      <template v-if="primary && pending">
        <ElFormItem label="撤回原因" class="mt-3"
          ><ElInput
            v-model="withdrawReason"
            aria-label="撤回原因"
            type="textarea"
            maxlength="2000"
            show-word-limit
        /></ElFormItem>
        <ElButton :loading="store.saving" @click="save('withdraw')">撤回验收</ElButton>
      </template>
      <template v-if="canDecide">
        <ElFormItem label="验收意见"
          ><ElInput
            v-model="opinion"
            aria-label="验收意见"
            type="textarea"
            :rows="4"
            maxlength="2000"
            show-word-limit
            placeholder="退回整改必填，通过选填"
        /></ElFormItem>
        <div class="flex flex-wrap gap-3"
          ><ElButton type="primary" :loading="store.saving" @click="save('accept')"
            >验收通过</ElButton
          ><ElButton type="warning" :loading="store.saving" @click="save('return')"
            >退回整改</ElButton
          ></div
        >
      </template>
    </ElForm>
  </section>
</template>
<script setup lang="ts">
  import { deliveryHref } from '@/utils/delivery-url'
  import { computed } from 'vue'
  import { useAcceptanceDraft } from '@/hooks/business/use-acceptance-draft'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import type { AcceptanceAction, DemoProject } from '@/domain/prototype'
  import { usePrototypeStore } from '@/store/modules/prototype'
  import {
    acceptanceLabel,
    actionAcceptance,
    actionLiveAcceptance
  } from '@/services/acceptance-service'
  import { runtimeConfig } from '@/config/runtime'
  import { ApiError } from '@/services/api-client'
  import { liveOperationKey } from '@/services/live-demand-service'
  import { displayTime } from '@/utils/project-display'
  import { needsPlan } from '@/services/stage-plan-service'
  import { isEngineerEligible } from '@/utils/engineer-eligibility'
  import { workdaysBetween } from '@/services/risk-service'
  import { shanghaiDay } from '@/services/workflow-validation'
  import { useUnsavedForm } from '@/hooks/business/use-unsaved-form'
  const props = defineProps<{ project: DemoProject }>()
  const store = usePrototypeStore()
  let operationKey = liveOperationKey()
  const {
    baselineVersion,
    staleDraft,
    ownerId,
    assignReason,
    summary,
    url,
    opinion,
    withdrawReason,
    error,
    dirty,
    resetForm
  } = useAcceptanceDraft(
    () => props.project,
    () => store.currentUser.id
  )
  const { beforeClose } = useUnsavedForm(
    'business-acceptance',
    dirty,
    computed(() => store.saving)
  )
  defineExpose({ beforeClose })
  const candidates = computed(
    () => store.database?.users ?? []
  )
  const userName = (id?: string | null) =>
    store.database?.users.find((u) => u.id === id)?.name ?? '待指定'
  const validOwner = computed(() =>
    candidates.value.some((u) => u.id === props.project.acceptanceOwnerId)
  )
  const primary = computed(
    () =>
      store.currentUser.role === 'engineer' &&
      isEngineerEligible(store.currentUser) &&
      store.currentUser.id === props.project.primaryOwnerId
  )
  const editable = computed(() => props.project.status === 'active' && !props.project.archived)
  const pending = computed(() => props.project.acceptanceStatus === 'pending')
  const canDecide = computed(
    () =>
      pending.value &&
      store.currentUser.id === props.project.acceptanceOwnerId
  )
  const waiting = computed(() =>
    props.project.acceptanceSubmittedAt
      ? workdaysBetween(
          shanghaiDay(props.project.acceptanceSubmittedAt),
          shanghaiDay(new Date().toISOString())
        )
      : 0
  )
  const safeUrl = computed(() => deliveryHref(props.project.acceptanceUrl ?? ''))
  async function save(action: AcceptanceAction) {
    if (staleDraft.value) return
    error.value = ''
    const text = (
      action === 'assign'
        ? assignReason.value
        : action === 'submit'
          ? summary.value
          : action === 'withdraw'
            ? withdrawReason.value
            : opinion.value
    ).trim()
    if (action !== 'accept' && !text) {
      error.value = '请填写说明或原因'
      return
    }
    if (action === 'assign' && !ownerId.value) {
      error.value = '请选择业务验收负责人'
      return
    }
    if (action === 'submit' && deliveryHref(url.value) === null) {
      error.value = '请输入有效网页地址，支持HTTP/HTTPS和内网地址，请勿包含账号密码'
      return
    }
    const input = {
      projectId: props.project.id,
      version: baselineVersion.value,
      action,
      summary: text,
      ...(action === 'assign' ? { ownerId: ownerId.value } : {}),
      ...(action === 'submit' ? { url: url.value.trim() } : {})
    }
    const command = { ...input, requestId: operationKey(input) }
    if (action === 'withdraw') {
      try {
        await ElMessageBox.confirm(
          `撤回「${props.project.name}」后，当前业务验收待办将失效。`,
          '撤回验收？',
          {
            confirmButtonText: '确认撤回验收',
            cancelButtonText: '继续验收',
            type: 'warning'
          }
        )
      } catch {
        return
      }
    }
    try {
      if (runtimeConfig.isPrototype)
        await store.runCommand((draft) => {
          actionAcceptance(draft, command)
        })
      else await store.runLiveCommand(() => actionLiveAcceptance(command))
      operationKey = liveOperationKey()
      resetForm()
      ElMessage.success('验收操作已保存')
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '保存失败，请重试'
      if (cause instanceof ApiError && cause.status === 409) {
        await store.refreshLive().catch(() => undefined)
        error.value += '；已尝试刷新项目，草稿已保留，请核对后重试'
      }
    }
  }
</script>
