import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useDingTalkLogin } from './use-dingtalk-login'
import { fetchDingTalkConfig, loginDingTalkH5 } from '@/services/dingtalk-auth'
import { requestDingTalkCode } from '@/utils/dingtalk/runtime'
vi.mock('@/services/dingtalk-auth', () => ({
  fetchDingTalkConfig: vi.fn(),
  loginDingTalkH5: vi.fn()
}))
vi.mock('@/utils/dingtalk/runtime', async (original) => ({
  ...(await original<object>()),
  requestDingTalkCode: vi.fn()
}))
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('window', { innerWidth: 1440, navigator: { userAgent: 'Windows DingTalk/7.6' } })
  vi.mocked(fetchDingTalkConfig).mockResolvedValue({
    enabled: true,
    clientId: 'app',
    corpId: 'corp'
  })
  vi.mocked(requestDingTalkCode).mockResolvedValue('code')
  vi.mocked(loginDingTalkH5).mockResolvedValue({ id: 'verified-user' })
})
afterEach(() => vi.unstubAllGlobals())
it('未配置时展示错误，不生成假身份', async () => {
  vi.mocked(fetchDingTalkConfig).mockResolvedValue({ enabled: false, clientId: '', corpId: '' })
  const done = vi.fn()
  const state = useDingTalkLogin(done)
  await state.start()
  expect(state.error.value).toContain('尚未配置')
  expect(requestDingTalkCode).not.toHaveBeenCalled()
  expect(done).not.toHaveBeenCalled()
  expect(state.busy.value).toBe(false)
})
it('自动免登失败不循环，显式重试成功才刷新身份', async () => {
  vi.mocked(loginDingTalkH5).mockRejectedValueOnce(new Error('仅限本公司成员使用'))
  const done = vi.fn()
  const state = useDingTalkLogin(done)
  await state.start()
  expect(state.error.value).toContain('本公司')
  expect(loginDingTalkH5).toHaveBeenCalledTimes(1)
  expect(done).not.toHaveBeenCalled()
  await state.start()
  expect(done).toHaveBeenCalledOnce()
})
it('加载时禁重复请求，取消后迟到的授权码不能兑换会话', async () => {
  let resolveCode!: (code: string) => void
  vi.mocked(requestDingTalkCode).mockImplementation(
    () =>
      new Promise((resolve) => {
        resolveCode = resolve
      })
  )
  const done = vi.fn()
  const state = useDingTalkLogin(done)
  const pending = state.start()
  await Promise.resolve()
  expect(state.busy.value).toBe(true)
  await state.start()
  expect(fetchDingTalkConfig).toHaveBeenCalledOnce()
  state.cancel()
  resolveCode('late-code')
  await pending
  expect(loginDingTalkH5).not.toHaveBeenCalled()
  expect(done).not.toHaveBeenCalled()
  expect(state.error.value).toBe('')
  expect(state.busy.value).toBe(false)
})
it('手机拒绝全部登录请求，浏览器只读配置等待扫码', async () => {
  Object.defineProperty(window.navigator, 'userAgent', {
    value: 'Android DingTalk',
    configurable: true
  })
  const state = useDingTalkLogin(vi.fn())
  await state.start()
  expect(fetchDingTalkConfig).not.toHaveBeenCalled()
  Object.defineProperty(window.navigator, 'userAgent', {
    value: 'Windows Chrome',
    configurable: true
  })
  await state.start()
  expect(fetchDingTalkConfig).toHaveBeenCalledOnce()
  expect(requestDingTalkCode).not.toHaveBeenCalled()
})
