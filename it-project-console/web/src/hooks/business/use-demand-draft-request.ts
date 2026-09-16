import { ref } from 'vue'
import { ApiError } from '@/services/api-client'
import type { LiveDemandInput, LiveWriteResult } from '@/services/live-demand-service'

// A lost response must replay the same payload/key; a confirmed validation rejection may be edited.
export function useDemandDraftRequest(
  create: (input: LiveDemandInput, requestId: string) => Promise<LiveWriteResult>,
  initialKey: string
) {
  const draftLocked = ref(false)
  let requestId = initialKey
  let frozen: LiveDemandInput | undefined
  let pending: Promise<LiveWriteResult> | undefined
  let saved: LiveWriteResult | undefined
  function requestDraft(input: LiveDemandInput): Promise<LiveWriteResult> {
    if (saved) return Promise.resolve(saved)
    if (pending) return pending
    frozen ??= { ...input, attachments: [], prd: null, prototype: null }
    draftLocked.value = true
    pending = Promise.resolve()
      .then(() => create(frozen!, requestId))
      .then((result) => {
        saved = result
        return result
      })
      .catch((error) => {
        if (error instanceof ApiError && [400, 403, 404, 422].includes(error.status)) {
          frozen = undefined
          requestId = crypto.randomUUID()
          draftLocked.value = false
        }
        throw error
      })
      .finally(() => {
        pending = undefined
      })
    return pending
  }
  return { requestDraft, draftLocked }
}
