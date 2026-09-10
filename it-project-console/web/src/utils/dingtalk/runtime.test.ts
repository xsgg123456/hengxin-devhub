import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { isDesktopDingTalk, requestDingTalkCode, type DingTalkJsApi } from './runtime'
import { isSupportedDevice } from '@/utils/device'
import { safeReturnTo } from '@/services/dingtalk-auth'

beforeEach(() => {
  vi.stubGlobal('window', { innerWidth: 1440, navigator: { userAgent: 'Windows DingTalk/7.6' } })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
it('桌面钉钉与手机、平板及普通浏览器分开判定', () => {
  expect(isDesktopDingTalk('Windows DingTalk/7.6')).toBe(true)
  expect(isDesktopDingTalk('Macintosh DingTalk/7.6')).toBe(true)
  for (const userAgent of [
    'Android DingTalk',
    'iPhone DingTalk',
    'iPad DingTalk',
    'Windows Chrome'
  ]) {
    expect(isDesktopDingTalk(userAgent)).toBe(false)
  }
  Object.defineProperty(window.navigator, 'userAgent', {
    value: 'Android DingTalk',
    configurable: true
  })
  expect(isSupportedDevice()).toBe(false)
})
it('手机即使宽屏也不加载SDK、不请求授权码', async () => {
  Object.defineProperty(window.navigator, 'userAgent', {
    value: 'iPhone DingTalk',
    configurable: true
  })
  const load = vi.fn()
  await expect(
    requestDingTalkCode({ clientId: 'app', corpId: 'corp' }, new AbortController().signal, load)
  ).rejects.toThrow('电脑')
  expect(load).not.toHaveBeenCalled()
})
it('使用当前官方requestAuthCode回调并带公开配置', async () => {
  const requestAuthCode: DingTalkJsApi['requestAuthCode'] = vi.fn((options) =>
    options.success({ code: 'once-code' })
  )
  await expect(
    requestDingTalkCode(
      { clientId: 'app', corpId: 'corp' },
      new AbortController().signal,
      async () => ({ requestAuthCode })
    )
  ).resolves.toBe('once-code')
  expect(requestAuthCode).toHaveBeenCalledWith(
    expect.objectContaining({ clientId: 'app', corpId: 'corp' })
  )
})
it('SDK加载失败和授权失败都明确拒绝', async () => {
  const config = { clientId: 'app', corpId: 'corp' }
  await expect(
    requestDingTalkCode(config, new AbortController().signal, async () => {
      throw new Error('加载失败')
    })
  ).rejects.toThrow('加载失败')
  await expect(
    requestDingTalkCode(config, new AbortController().signal, async () => ({
      requestAuthCode: (options) => options.fail()
    }))
  ).rejects.toThrow('授权失败')
})
it('取消加载后不会继续调用授权API', async () => {
  const controller = new AbortController()
  const requestAuthCode = vi.fn()
  const pending = requestDingTalkCode(
    { clientId: 'app', corpId: 'corp' },
    controller.signal,
    async () => {
      controller.abort()
      return { requestAuthCode }
    }
  )
  await expect(pending).rejects.toThrow()
  expect(requestAuthCode).not.toHaveBeenCalled()
})
it('授权没有回调时超时退出，可再次重试', async () => {
  vi.useFakeTimers()
  const pending = requestDingTalkCode(
    { clientId: 'app', corpId: 'corp' },
    new AbortController().signal,
    async () => ({ requestAuthCode: () => {} })
  )
  const assertion = expect(pending).rejects.toThrow('超时')
  await vi.advanceTimersByTimeAsync(30001)
  await assertion
})
it('返回路径仅接受站内hash', () => {
  expect(safeReturnTo('#/projects/123?tab=progress')).toBe('/#/projects/123?tab=progress')
  for (const path of ['https://evil.test', '//evil.test', '/\\evil.test'])
    expect(safeReturnTo(path)).toBe('/#/')
})

it('登录页扫码重试返回首页，不携带旧授权失败提示', () => {
  for (const path of ['#/auth/login', '#/auth/login?dingError=authorization_failed', '#/auth/login/'])
    expect(safeReturnTo(path)).toBe('/#/')
  expect(safeReturnTo('#/project-overview?projectId=fixture')).toBe('/#/project-overview?projectId=fixture')
})
