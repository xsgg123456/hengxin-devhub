import { ref, toRaw } from 'vue'
import type { DemoAttachment } from '@/domain/prototype'
import { createMaterialCleanup, uploadLiveMaterial } from '@/services/live-material-service'

interface MaterialRow {
  key: number
  material: DemoAttachment
  file?: File
  ticket?: string
  progress: number
  error: string
}
interface Options {
  prototype: boolean
  ensureDemand?: () => Promise<string>
  change: (materials: DemoAttachment[]) => void
  busy: (value: boolean) => void
}
const MB = 1024 * 1024

export function useMaterialQueue(options: Options) {
  const rows = ref<MaterialRow[]>([])
  const busy = ref(false)
  const error = ref('')
  const cleanup = createMaterialCleanup()
  const queue: number[] = []
  let nextKey = 0
  let mounted = true
  function sync(materials: DemoAttachment[]) {
    rows.value = materials.map(
      (material) =>
        rows.value.find(
          (row) =>
            toRaw(row.material) === toRaw(material) ||
            (material.attachmentId && material.attachmentId === row.material.attachmentId)
        ) ?? { key: ++nextKey, material, progress: 0, error: '' }
    )
  }
  function publish() {
    if (mounted) options.change(rows.value.map((row) => row.material))
  }
  function setBusy(value: boolean) {
    if (busy.value === value) return
    busy.value = value
    options.busy(value)
  }
  function select(file: File) {
    if (!mounted) return
    error.value = ''
    const total = rows.value.reduce((sum, row) => sum + (row.material.size || 0), 0)
    if (!file.size || file.size > 100 * MB || total + file.size > 500 * MB) {
      error.value = `${file.name}：${!file.size ? '不能上传空文件' : file.size > 100 * MB ? '单文件不能超过 100 MB' : '单需求附件合计不能超过 500 MB'}`
      return
    }
    const key = ++nextKey
    rows.value.push({
      key,
      file,
      progress: 0,
      error: '',
      material: {
        kind: 'file',
        name: file.name,
        size: file.size,
        mime: file.type || 'application/octet-stream',
        status: options.prototype ? 'ready' : 'uploading'
      }
    })
    publish()
    if (!options.prototype) {
      queue.push(key)
      void drain()
    }
  }
  async function drain() {
    if (busy.value || !mounted) return
    setBusy(true)
    try {
      while (queue.length && mounted) {
        const key = queue.shift()
        const row = rows.value.find((item) => item.key === key)
        if (!row?.file) continue
        try {
          if (row.ticket) {
            await cleanup.discard(row.ticket)
            row.ticket = undefined
          }
          if (!options.ensureDemand) throw new Error('无法确定需求，请关闭后重试')
          const id = await options.ensureDemand()
          if (!mounted) break
          row.material = await uploadLiveMaterial(
            id,
            row.file,
            (ticket) => {
              row.ticket = ticket
              cleanup.track(ticket)
            },
            (percent) => {
              row.progress = percent
            }
          )
        } catch (cause) {
          row.material = { ...row.material, status: 'failed' }
          row.error = cause instanceof Error ? cause.message : '上传失败，请重试'
        }
        publish()
      }
    } finally {
      if (!mounted) await cleanup.discardAll().catch(() => {})
      setBusy(false)
    }
  }
  function retry(key: number) {
    const row = rows.value.find((item) => item.key === key)
    if (!row?.file || row.material.status !== 'failed') return
    row.error = ''
    row.progress = 0
    row.material = { ...row.material, status: 'uploading' }
    queue.push(key)
    publish()
    void drain()
  }
  async function remove(key: number) {
    if (busy.value) return
    const row = rows.value.find((item) => item.key === key)
    if (!row) return
    setBusy(true)
    try {
      if (row.ticket) await cleanup.discard(row.ticket)
      rows.value = rows.value.filter((item) => item.key !== key)
      publish()
    } catch {
      row.error = '未能清理刚上传的文件，请重试移除'
    } finally {
      if (!mounted) await cleanup.discardAll().catch(() => {})
      setBusy(false)
      if (queue.length) void drain()
    }
  }
  function dispose() {
    mounted = false
    queue.length = 0
    if (!busy.value) void cleanup.discardAll().catch(() => {})
  }
  return {
    rows,
    busy,
    error,
    sync,
    select,
    retry,
    remove,
    dispose,
    releaseCleanup: cleanup.release
  }
}
