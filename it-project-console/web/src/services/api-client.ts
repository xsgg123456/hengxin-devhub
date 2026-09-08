import { runtimeConfig } from '@/config/runtime'
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string
  ) {
    super(message)
  }
}
export async function apiRequest<T>(
  path: string,
  options: Omit<RequestInit, 'body'> & { body?: unknown } = {}
): Promise<T> {
  let response: Response
  try {
    const base = runtimeConfig.apiBaseUrl.replace(/\/$/, '')
    const endpoint = path.startsWith('/api/') ? path.slice(4) : path
    response = await fetch(`${base}${endpoint}`, {
      ...options,
      body:
        options.body === undefined
          ? undefined
          : typeof options.body === 'string'
            ? options.body
            : JSON.stringify(options.body),
      credentials: 'include',
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers
      },
      signal: options.signal ?? AbortSignal.timeout(30000)
    })
  } catch {
    throw new ApiError('网络请求失败，请检查连接后重试', 0)
  }
  const payload: { data?: T; error?: { message?: string; code?: string } } = await response
    .json()
    .catch(() => ({}))
  if (!response.ok) {
    if (response.status === 401) window.dispatchEvent(new Event('itpc-session-expired'))
    throw new ApiError(
      payload.error?.message || '请求失败，请稍后重试',
      response.status,
      payload.error?.code
    )
  }
  return payload.data as T
}
