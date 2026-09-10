import { beforeEach, expect, it, vi } from 'vitest'
import { apiRequest } from './api-client'
import { uploadLiveMaterial } from './live-material-service'
vi.mock('./api-client', async (original) => ({
  ...(await original<typeof import('./api-client')>()),
  apiRequest: vi.fn()
}))
const api = vi.mocked(apiRequest)
beforeEach(() => {
  vi.resetAllMocks()
  vi.unstubAllGlobals()
})
it('默认新上传为FILE，任意扩展名有MIME兜底并完成确认', async () => {
  api.mockResolvedValueOnce({ attachmentId: 'a', uploadUrl: 'https://storage/upload', headers: {} })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
  const file = new File(['x'], 'x.custom')
  const result = await uploadLiveMaterial('d', file)
  expect(api).toHaveBeenCalledWith('/attachments/upload', {
    method: 'POST',
    body: {
      demandId: 'd',
      kind: 'FILE',
      name: 'x.custom',
      mime: 'application/octet-stream',
      size: 1
    }
  })
  expect(api).toHaveBeenCalledWith('/attachments/a/confirm', { method: 'POST' })
  expect(result.attachmentId).toBe('a')
})
it('进度来自真实传输事件，PUT成功后才确认', async () => {
  api.mockResolvedValueOnce({
    attachmentId: 'a',
    uploadUrl: 'https://storage/upload',
    headers: { 'Content-Type': 'image/png' }
  })
  class Request {
    status = 200
    timeout = 0
    upload = {
      onprogress: (_event: { lengthComputable: boolean; loaded: number; total: number }) => {}
    }
    onload = () => {}
    open = vi.fn()
    setRequestHeader = vi.fn()
    send() {
      this.upload.onprogress({ lengthComputable: true, loaded: 4, total: 10 })
      this.onload()
    }
  }
  vi.stubGlobal('XMLHttpRequest', Request)
  const progress = vi.fn()
  await uploadLiveMaterial('d', new File(['x'], 'x.png'), undefined, progress)
  expect(progress).toHaveBeenCalledWith(40)
  expect(api).toHaveBeenCalledWith('/attachments/a/confirm', { method: 'POST' })
})
