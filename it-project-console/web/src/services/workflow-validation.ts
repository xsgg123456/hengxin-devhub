import type { DemoAttachment, PrototypeSnapshot } from '@/domain/prototype'
export class WorkflowError extends Error {}
export function assertWrite(snapshot: PrototypeSnapshot) {
  if (snapshot.scenario === 'save-error')
    throw new WorkflowError('模拟保存失败，请重试；已保存数据不变')
  if (snapshot.scenario === 'forbidden') throw new WorkflowError('当前场景无操作权限')
  if (snapshot.scenario === 'network-error')
    throw new WorkflowError('模拟网络错误，请恢复正常后重试')
  if (snapshot.scenario === 'empty' || snapshot.scenario === 'loading')
    throw new WorkflowError('当前场景仅供查看，请恢复正常后再保存')
  const actor = snapshot.database.users.find((user) => user.id === snapshot.activeUserId)
  if (!actor) throw new WorkflowError('当前身份无效')
  return actor
}
export function textValue(value: string, label: string, max = 300) {
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > max) throw new WorkflowError(`${label}须为 1～${max} 字`)
  return trimmed
}
export function dateValue(value: string, label: string) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 10) !== value
  ) {
    throw new WorkflowError(`${label}不是有效日期`)
  }
  return value
}
export function shanghaiDay(now: string) {
  return new Date(new Date(now).getTime() + 8 * 3600000).toISOString().slice(0, 10)
}
export function validateAttachment(
  material: DemoAttachment | null,
  type: 'prd' | 'prototype',
  required = true
) {
  const label = type === 'prd' ? 'PRD 文档' : 'HTML 原型'
  if (!material) {
    if (required) throw new WorkflowError(`请提供${label}`)
    return
  }
  if (material.status !== 'ready') throw new WorkflowError(`${label}模拟上传未完成，请重试`)
  if (material.kind === 'link') {
    try {
      const url = new URL(material.url ?? '')
      if (url.protocol !== 'https:' || !url.hostname || url.username || url.password)
        throw new Error()
    } catch {
      throw new WorkflowError(`${label}必须使用有效 HTTPS 链接`)
    }
  } else if (material.kind === 'file') {
    const extensions = type === 'prd' ? /\.(pdf|doc|docx)$/i : /\.(html|zip)$/i
    if (!extensions.test(material.name)) throw new WorkflowError(`${label}文件格式不支持`)
    if (!material.size || material.size < 0 || material.size > 20 * 1024 * 1024)
      throw new WorkflowError('单文件须大于 0 且不超过 20 MB')
  } else throw new WorkflowError('材料类型无效')
}
export function nextId(prefix: string, records: { id: string }[], reservedIds: string[] = []) {
  let number = records.length + 1
  const used = new Set([...records.map((row) => row.id), ...reservedIds])
  while (used.has(`${prefix}-${String(number).padStart(6, '0')}`)) number++
  return `${prefix}-${String(number).padStart(6, '0')}`
}
