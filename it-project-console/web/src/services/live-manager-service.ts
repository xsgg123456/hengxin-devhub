import { apiRequest } from './api-client'
export interface LiveManager {
  id: string
  name: string
  department: string
  dingUserId: string | null
  active: boolean
  authorName: string
  createdAt: string
}
export const listManagers = () => apiRequest<LiveManager[]>('/manager-grants')
export const listManagerCandidates = () =>
  apiRequest<Array<{ id: string; name: string; department: string }>>('/manager-grants/candidates')
export const setLiveManager = (userId: string, enabled: boolean, requestId: string) =>
  apiRequest<{ userId: string; enabled: boolean; role: 'MANAGER' | 'ENGINEER' | 'BUSINESS' }>(
    '/manager-grants',
    {
      method: 'POST',
      body: { userId, enabled, requestId }
    }
  )
