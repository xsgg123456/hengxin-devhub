// Adapted from itpd-main/services/dingtalk.ts; transport and token cache retained.
import { z } from 'zod'
import { AppError } from '../../lib/errors.js'
export interface DingIdentity {
  userId: string
  unionId: string
  name: string
  departmentIds: string[]
  active: boolean
}
export class DingTalkError extends AppError {
  constructor(public readonly retryable = false, public readonly uncertain = false) {
    super(502, 'DINGTALK_REMOTE_ERROR', '钉钉服务暂不可用，请重试或联系管理员检查应用权限')
  }
}
const recordSchema = z.record(z.string(), z.unknown())
const string = z.string().min(1)
export class DingTalkClient {
  private token: { value: string; expiresAt: number } | null = null
  private pendingToken: Promise<string> | null = null
  constructor(private readonly config: { clientId: string; clientSecret: string }, private readonly fetchImpl: typeof fetch = fetch) {}
  private async request(url: string, body?: unknown, headers: Record<string, string> = {}) {
    let response: Response
    try {
      response = await this.fetchImpl(url, { method: body === undefined ? 'GET' : 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: body === undefined ? undefined : JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(15000) })
    } catch { throw new DingTalkError(true, true) }
    let payload: Record<string, unknown>
    try { payload = recordSchema.parse(await response.json()) }
    catch { throw new DingTalkError(response.status >= 500, true) }
    const explicitError = (payload.errcode !== undefined && String(payload.errcode) !== '0') ||
      (typeof payload.code === 'string' && !['0', 'OK'].includes(payload.code))
    if (!response.ok || explicitError)
      throw new DingTalkError(response.status === 429 || response.status >= 500, response.status >= 500)
    return payload
  }
  private async appToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 60000) return this.token.value
    if (this.pendingToken) return this.pendingToken
    this.pendingToken = (async () => {
      const payload = await this.request('https://api.dingtalk.com/v1.0/oauth2/accessToken', {
        appKey: this.config.clientId, appSecret: this.config.clientSecret })
      const result = z.object({ accessToken: string, expireIn: z.number().positive() }).safeParse(payload)
      if (!result.success) throw new DingTalkError(false, true)
      this.token = { value: result.data.accessToken, expiresAt: Date.now() + result.data.expireIn * 1000 }
      return this.token.value
    })()
    try { return await this.pendingToken } finally { this.pendingToken = null }
  }
  async legacy(path: string, body: unknown): Promise<Record<string, unknown>> {
    if (!/^\/topapi\/[a-zA-Z0-9_/]+$/.test(path)) throw new Error('Invalid DingTalk API path')
    let token: string
    try { token = await this.appToken() }
    catch (error) {
      // No business request was sent if obtaining the app token failed.
      if (error instanceof DingTalkError) throw new DingTalkError(error.retryable, false)
      throw error
    }
    return this.request(`https://oapi.dingtalk.com${path}?access_token=${encodeURIComponent(token)}`, body)
  }
  async staff(userId: string): Promise<DingIdentity> {
    const payload = await this.legacy('/topapi/v2/user/get', { userid: userId, language: 'zh_CN' })
    const result = z.object({ userid: string, unionid: string, name: string,
      dept_id_list: z.array(z.union([z.string(), z.number()])).min(1), active: z.boolean().optional() }).safeParse(payload.result)
    if (!result.success || result.data.userid !== userId) throw new DingTalkError()
    return { userId, unionId: result.data.unionid, name: result.data.name,
      departmentIds: result.data.dept_id_list.map(String), active: result.data.active !== false }
  }
  async h5(code: string): Promise<DingIdentity> {
    const payload = await this.legacy('/topapi/v2/user/getuserinfo', { code })
    const result = z.object({ userid: string }).safeParse(payload.result)
    if (!result.success) throw new DingTalkError()
    return this.staff(result.data.userid)
  }
  async oauth(code: string): Promise<DingIdentity> {
    const token = await this.request('https://api.dingtalk.com/v1.0/oauth2/userAccessToken', {
      ...this.config, code, grantType: 'authorization_code' })
    if (typeof token.accessToken !== 'string') throw new DingTalkError()
    const profile = await this.request('https://api.dingtalk.com/v1.0/contact/users/me', undefined,
      { 'x-acs-dingtalk-access-token': token.accessToken })
    if (typeof profile.unionId !== 'string' || !profile.unionId) throw new DingTalkError()
    // OAuth openId is NOT a corporate staff userid. Resolve using this app's directory.
    const mapped = await this.legacy('/topapi/user/getbyunionid', { unionid: profile.unionId })
    const result = z.object({ userid: string }).safeParse(mapped.result)
    if (!result.success) throw new AppError(403, 'NOT_COMPANY_MEMBER', '仅限本公司有效成员使用')
    const identity = await this.staff(result.data.userid)
    if (identity.unionId !== profile.unionId || !identity.active)
      throw new AppError(403, 'NOT_COMPANY_MEMBER', '仅限本公司有效成员使用')
    return identity
  }
}
