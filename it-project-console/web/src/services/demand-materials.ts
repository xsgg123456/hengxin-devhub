import type { DemoAttachment, DemoDemand } from '@/domain/prototype'

// An explicit unified list is authoritative; legacy records are read without data loss.
export function demandMaterials(demand?: Pick<DemoDemand, 'attachments' | 'prd' | 'prototype'>): DemoAttachment[] {
  if (!demand) return []
  const files = [...(demand.attachments ?? []), demand.prd, demand.prototype]
  const seen = new Set<string>()
  return files.filter((file): file is DemoAttachment => {
    if (!file) return false
    const key = file.kind === 'link' ? `link:${file.url}` : `file:${file.attachmentId ?? `${file.name}:${file.size}`}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
