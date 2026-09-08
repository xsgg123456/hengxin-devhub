import { describe, expect, it } from 'vitest'
import { downloadDisposition, S3Storage } from './s3-storage.js'

describe('S3签名边界', () => {
  it('使用公开endpoint且PUT绑定大小和MIME，下载强制附件', async () => {
    const storage = new S3Storage({
      endpoint: 'http://internal:9000',
      publicEndpoint: 'http://localhost:19000',
      bucket: 'test-private',
      region: 'us-east-1',
      accessKeyId: 'test-key',
      secretAccessKey: 'test-secret'
    })
    try {
      const upload = new URL(await storage.presignUpload('staging/id', 'text/html', 12))
      expect(upload.host).toBe('localhost:19000')
      expect(upload.pathname).toBe('/test-private/staging/id')
      expect(upload.searchParams.get('X-Amz-Expires')).toBe('300')
      expect(upload.searchParams.get('X-Amz-SignedHeaders')).toContain('content-length')
      expect(upload.searchParams.get('X-Amz-SignedHeaders')).toContain('content-type')
      const download = new URL(await storage.presignDownload('attachments/id', '原型.html'))
      expect(download.searchParams.get('response-content-disposition')).toMatch(/^attachment;/)
      expect(download.searchParams.get('response-content-type')).toBe('application/octet-stream')
    } finally {
      storage.close()
    }
  })

  it('下载文件名消除头注入并保留中文RFC5987编码', () => {
    const header = downloadDisposition('../原型\r\n".html')
    expect(header).not.toMatch(/[\r\n]/)
    expect(header).toContain("filename*=UTF-8''")
    expect(header).toContain('%E5%8E%9F')
  })
})
