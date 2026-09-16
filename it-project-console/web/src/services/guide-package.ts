export async function fetchGuidePackage(address: string): Promise<Blob> {
  const url = new URL(address, window.location.origin)
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('下载地址无效')
  const response = await fetch(url.toString(), { signal: AbortSignal.timeout(30000) })
  if (!response.ok || response.headers.get('content-type')?.includes('text/html'))
    throw new Error('Skill 文件暂时无法获取')
  const blob = await response.blob()
  if (!blob.size) throw new Error('Skill 文件为空')
  return blob
}
