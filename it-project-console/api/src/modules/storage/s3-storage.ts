// Narrowed from itpd-main/lib/s3.ts: dual endpoints and SDK presigning are retained.
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

export interface StorageMetadata {
  size: number | undefined
  mime: string | undefined
  etag: string | undefined
}
export interface ObjectStorage {
  presignUpload(key: string, mime: string, size: number): Promise<string>
  head(key: string): Promise<StorageMetadata>
  promote(source: string, target: string, etag: string): Promise<void>
  presignDownload(key: string, name: string): Promise<string>
  delete(key: string): Promise<void>
}
export interface S3StorageConfig {
  endpoint: string
  publicEndpoint: string
  region: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
}

export function downloadDisposition(name: string): string {
  const safe = name.replace(/[\x00-\x1f\x7f/\\]/g, '_').slice(0, 180) || 'download'
  const fallback = safe.replace(/[^a-zA-Z0-9._-]/g, '_')
  const encoded = encodeURIComponent(safe).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  )
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`
}

export class S3Storage implements ObjectStorage {
  private readonly internal: S3Client
  private readonly signing: S3Client
  constructor(private readonly config: S3StorageConfig) {
    const options = {
      region: config.region,
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey
      },
      requestChecksumCalculation: 'WHEN_REQUIRED' as const,
      maxAttempts: 2,
      requestHandler: { connectionTimeout: 3_000, requestTimeout: 10_000 }
    }
    this.internal = new S3Client({ ...options, endpoint: config.endpoint })
    this.signing = new S3Client({
      ...options,
      endpoint: config.publicEndpoint
    })
  }

  async presignUpload(key: string, mime: string, size: number): Promise<string> {
    return getSignedUrl(
      this.signing,
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        ContentType: mime,
        ContentLength: size
      }),
      {
        expiresIn: 300,
        signableHeaders: new Set(['content-length', 'content-type'])
      }
    )
  }

  async head(key: string): Promise<StorageMetadata> {
    const result = await this.internal.send(
      new HeadObjectCommand({ Bucket: this.config.bucket, Key: key })
    )
    return {
      size: result.ContentLength,
      mime: result.ContentType,
      etag: result.ETag
    }
  }

  async promote(source: string, target: string, etag: string): Promise<void> {
    await this.internal.send(
      new CopyObjectCommand({
        Bucket: this.config.bucket,
        Key: target,
        CopySource: `${this.config.bucket}/${source.split('/').map(encodeURIComponent).join('/')}`,
        CopySourceIfMatch: etag
      })
    )
  }

  async presignDownload(key: string, name: string): Promise<string> {
    return getSignedUrl(
      this.signing,
      new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        ResponseContentDisposition: downloadDisposition(name),
        ResponseContentType: 'application/octet-stream'
      }),
      { expiresIn: 300 }
    )
  }

  async delete(key: string): Promise<void> {
    await this.internal.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }))
  }

  async health(): Promise<void> {
    await this.internal.send(new HeadBucketCommand({ Bucket: this.config.bucket }))
  }

  close(): void {
    this.internal.destroy()
    this.signing.destroy()
  }
}
