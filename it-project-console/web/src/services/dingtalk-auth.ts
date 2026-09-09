import { apiRequest } from '@/services/api-client'
import { runtimeConfig } from '@/config/runtime'

export interface DingTalkConfig {
  enabled: boolean
  clientId: string
  corpId: string
}
export const fetchDingTalkConfig = (signal?: AbortSignal) =>
  apiRequest<DingTalkConfig>('/auth/dingtalk/config', {
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : undefined
  })
export const loginDingTalkH5 = (code: string, signal: AbortSignal) =>
  apiRequest('/auth/dingtalk/h5', {
    method: 'POST',
    body: { code },
    signal: AbortSignal.any([signal, AbortSignal.timeout(30000)])
  })

export function safeReturnTo(hash: string): string {
  const path = hash.replace(/^#/, '')
  return /^\/(?!\/)/.test(path) && !/[\\\r\n]/.test(path) ? `/#${path}` : '/#/'
}
export function dingTalkStartUrl(hash: string): string {
  return `${runtimeConfig.apiBaseUrl.replace(/\/$/, '')}/auth/dingtalk/start?returnTo=${encodeURIComponent(safeReturnTo(hash))}`
}
