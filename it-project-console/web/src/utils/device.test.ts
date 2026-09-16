import { afterEach, expect, it, vi } from 'vitest'
import { isSupportedDevice } from './device'

afterEach(() => vi.unstubAllGlobals())

it('电脑小窗口、缩放和触屏电脑不被误判为手机', () => {
  for (const innerWidth of [1440, 930, 600, 400]) {
    vi.stubGlobal('window', {
      innerWidth,
      navigator: { userAgent: 'Windows Chrome', maxTouchPoints: 10 },
      matchMedia: () => ({ matches: true })
    })
    expect(isSupportedDevice()).toBe(true)
  }
})

it('真实手机和平板包括桌面UA的iPad仍被限制', () => {
  for (const userAgent of ['Android', 'iPhone', 'iPad', 'Macintosh']) {
    vi.stubGlobal('window', { innerWidth: 1440, navigator: { userAgent, maxTouchPoints: 5 } })
    expect(isSupportedDevice()).toBe(false)
  }
  vi.stubGlobal('window', { navigator: { userAgent: 'Macintosh', maxTouchPoints: 0 } })
  expect(isSupportedDevice()).toBe(true)
})
