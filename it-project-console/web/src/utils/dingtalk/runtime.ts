import { isMobileUserAgent } from '@/utils/device'

type AuthOptions = {
  clientId: string
  corpId: string
  success: (result: { code?: string }) => void
  fail: () => void
}
export type DingTalkJsApi = { requestAuthCode: (options: AuthOptions) => void }
declare global {
  interface Window {
    dd?: DingTalkJsApi
  }
}

export function isDesktopDingTalk(userAgent: string): boolean {
  return /DingTalk/i.test(userAgent) && !isMobileUserAgent(userAgent)
}

let scriptLoading: Promise<DingTalkJsApi> | undefined
export function loadDingTalkJsApi(): Promise<DingTalkJsApi> {
  if (window.dd?.requestAuthCode) return Promise.resolve(window.dd)
  if (scriptLoading) return scriptLoading
  scriptLoading = new Promise<DingTalkJsApi>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://g.alicdn.com/dingding/dingtalk-jsapi/3.1.1/dingtalk.open.js'
    script.async = true
    const timer = setTimeout(() => fail(), 15000)
    function fail() {
      clearTimeout(timer)
      script.remove()
      reject(new Error('钉钉组件加载失败，请检查网络后重试'))
    }
    script.onerror = fail
    script.onload = () => {
      clearTimeout(timer)
      if (window.dd?.requestAuthCode) resolve(window.dd)
      else fail()
    }
    document.head.appendChild(script)
  }).catch((error: unknown) => {
    scriptLoading = undefined
    throw error
  })
  return scriptLoading
}

export async function requestDingTalkCode(
  config: { clientId: string; corpId: string },
  signal: AbortSignal,
  load = loadDingTalkJsApi
): Promise<string> {
  if (!isDesktopDingTalk(window.navigator.userAgent)) throw new Error('请使用电脑钉钉客户端打开')
  if (!config.clientId || !config.corpId) throw new Error('企业登录尚未配置，请联系管理员')
  signal.throwIfAborted()
  const dd = await load()
  signal.throwIfAborted()
  return new Promise<string>((resolve, reject) => {
    const finish = (code?: string, error?: Error) => {
      clearTimeout(timer)
      signal.removeEventListener('abort', cancel)
      if (error) reject(error)
      else if (code) resolve(code)
      else reject(new Error('钉钉未返回授权码，请重新登录'))
    }
    const cancel = () => finish(undefined, new Error('已取消登录'))
    const timer = setTimeout(() => finish(undefined, new Error('钉钉授权超时，请重新登录')), 30000)
    signal.addEventListener('abort', cancel, { once: true })
    try {
      dd.requestAuthCode({
        ...config,
        success: ({ code }) => finish(code),
        fail: () => finish(undefined, new Error('钉钉授权失败，请重新登录'))
      })
    } catch {
      finish(undefined, new Error('当前钉钉版本不支持免登，请升级客户端或使用扫码登录'))
    }
  })
}
