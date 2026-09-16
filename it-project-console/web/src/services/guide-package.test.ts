import { afterEach, expect, it, vi } from 'vitest'
import { fetchGuidePackage } from './guide-package'

afterEach(() => vi.unstubAllGlobals())
function setup(response: Response) {
  vi.stubGlobal('window', { location: { origin: 'http://localhost' } })
  const fetch = vi.fn().mockResolvedValue(response)
  vi.stubGlobal('fetch', fetch)
  return fetch
}
it('取得真实压缩包内容才返回供下载的Blob', async () => {
  const fetch = setup(
    new Response('PK fixture', { headers: { 'content-type': 'application/zip' } })
  )
  expect(await (await fetchGuidePackage('/business-prd-prototype.zip')).text()).toBe('PK fixture')
  expect(fetch.mock.calls[0][0]).toBe('http://localhost/business-prd-prototype.zip')
})
it.each([404, 500])('HTTP %s 返回失败，不伪造下载成功', async (status) => {
  setup(new Response('failed', { status }))
  await expect(fetchGuidePackage('/missing.zip')).rejects.toThrow()
})
it('拦截SPA回退HTML、空文件和危险协议', async () => {
  setup(new Response('<html/>', { headers: { 'content-type': 'text/html' } }))
  await expect(fetchGuidePackage('/missing.zip')).rejects.toThrow()
  const fetch = setup(new Response(''))
  await expect(fetchGuidePackage('/empty.zip')).rejects.toThrow()
  fetch.mockClear()
  await expect(fetchGuidePackage('javascript:alert(1)')).rejects.toThrow()
  expect(fetch).not.toHaveBeenCalled()
})
