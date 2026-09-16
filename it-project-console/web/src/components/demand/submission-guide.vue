<template>
  <section
    class="submission-guide"
    data-testid="submission-guide"
    aria-labelledby="submission-guide-title"
  >
    <div class="guide-heading">
      <div>
        <h4 id="submission-guide-title" class="guide-title">提需求前，可以先看这里</h4>
        <p class="guide-description">视频教程与 Skill 成品包，按需使用</p>
      </div>
      <span class="guide-label">教程与工具包</span>
    </div>

    <div class="resource-grid">
      <article class="resource-card video-card">
        <button
          class="video-cover"
          :class="{ 'has-poster': posterUrl }"
          type="button"
          :aria-label="hasVideo ? '观看视频教程' : '查看视频教程占位'"
          @click="openVideo"
        >
          <img
            v-if="posterUrl"
            class="video-cover-poster"
            :src="posterUrl"
            alt=""
            aria-hidden="true"
          />
          <span v-if="posterUrl" class="video-cover-shade" aria-hidden="true" />
          <span class="video-cover-icon" aria-hidden="true">
            <ArtSvgIcon icon="ri:play-circle-line" />
          </span>
          <span class="video-cover-title">视频教程</span>
          <span class="video-cover-caption">
            {{ hasVideo ? '点击播放' : '视频素材待上传' }}
          </span>
          <span v-if="!hasVideo" class="preview-badge">预览占位</span>
        </button>

        <div class="resource-body">
          <div class="resource-copy">
            <h5>如何正确提 0→1 项目需求</h5>
            <p>安装与使用 Skill 的视频说明</p>
          </div>
          <ElButton link type="primary" @click="openVideo">观看教程</ElButton>
        </div>
      </article>

      <article class="resource-card package-card">
        <div class="package-main">
          <span class="package-icon" aria-hidden="true">
            <ArtSvgIcon icon="ri:file-zip-line" />
          </span>
          <div class="resource-copy">
            <h5>0→1 项目需求 Skill</h5>
            <p>{{ packageName }}</p>
            <span class="package-meta">{{ packageSize }}</span>
          </div>
        </div>
        <ElButton
          class="package-action"
          type="primary"
          plain
          :disabled="!hasPackage"
          :loading="packageLoading"
          @click="downloadPackage"
        >
          下载 Skill 成品包
        </ElButton>
        <p v-if="packageError" class="resource-note resource-error">{{ packageError }}</p>
        <p v-else-if="!hasPackage" class="resource-note">成品包放入后即可下载</p>
      </article>
    </div>
  </section>

  <ElDialog
    v-model="videoOpen"
    class="submission-video-dialog"
    title="视频教程 · 如何正确提 0→1 项目需求"
    width="min(720px, 92vw)"
    append-to-body
    :close-on-click-modal="false"
    destroy-on-close
  >
    <div class="video-dialog-content">
      <ArtVideoPlayer
        v-if="hasVideo && videoOpen && !videoError"
        player-id="demand-submission-guide-video"
        :video-url="videoUrl"
        :poster-url="posterUrl"
        :autoplay="false"
        :muted="false"
        @error="handleVideoError"
      />
      <div v-else-if="videoError" class="video-placeholder video-error">
        <ArtSvgIcon icon="ri:error-warning-line" aria-hidden="true" />
        <p>视频暂时无法加载</p>
        <span>请稍后重试或联系管理员。</span>
        <ElButton link type="primary" @click="retryVideo">重新加载</ElButton>
      </div>
      <div v-else class="video-placeholder">
        <ArtSvgIcon icon="ri:video-line" aria-hidden="true" />
        <p>视频素材待放入</p>
        <span>接入实际视频地址后，这里会直接播放教程。</span>
      </div>
    </div>
    <p class="video-dialog-note">视频包含 Skill 的安装与使用说明，是否观看由你自行决定。</p>
    <template #footer>
      <ElButton @click="videoOpen = false">关闭</ElButton>
    </template>
  </ElDialog>
</template>

<script setup lang="ts">
  import { computed, ref, toRefs } from 'vue'
  import ArtVideoPlayer from '@/components/core/media/art-video-player/index.vue'
  import { fetchGuidePackage } from '@/services/guide-package'

  interface Props {
    /** 实际视频地址；未配置时展示可交互的预览占位 */
    videoUrl?: string
    /** 可选的视频封面地址 */
    posterUrl?: string
    /** 实际 Skill 压缩包地址；未配置时下载按钮保持禁用 */
    packageUrl?: string
    /** Skill 压缩包文件名 */
    packageName?: string
    /** Skill 压缩包展示信息 */
    packageSize?: string
  }

  const props = withDefaults(defineProps<Props>(), {
    videoUrl: '',
    posterUrl: '',
    packageUrl: '',
    packageName: 'business-prd-prototype.zip',
    packageSize: 'ZIP 压缩包'
  })

  const videoOpen = ref(false)
  const videoError = ref(false)
  const packageError = ref('')
  const packageLoading = ref(false)
  const hasVideo = computed(() => Boolean(props.videoUrl))
  const hasPackage = computed(() => Boolean(props.packageUrl))

  const { videoUrl, posterUrl, packageName, packageSize } = toRefs(props)

  function openVideo() {
    videoError.value = false
    videoOpen.value = true
  }

  function handleVideoError() {
    videoError.value = true
  }

  function retryVideo() {
    videoOpen.value = false
    window.setTimeout(openVideo, 0)
  }

  async function downloadPackage() {
    if (!props.packageUrl || packageLoading.value) return
    packageError.value = ''
    packageLoading.value = true
    try {
      const blob = await fetchGuidePackage(props.packageUrl)
      const objectUrl = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = objectUrl
      anchor.download = props.packageName
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
    } catch {
      packageError.value = 'Skill 成品包暂时无法获取，请稍后重试或联系管理员。'
    } finally {
      packageLoading.value = false
    }
  }
</script>

<style scoped src="./submission-guide.css"></style>
