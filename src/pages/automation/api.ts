import type { AutomationLogs, AutomationSnapshot, BulkMessageImageUpload, BulkMessageSnapshot, GroupMember, Lead, LeadStage } from '../../../shared/automation'
import type { Conversation } from '../../../shared/messages'
import { apiUrl } from '../../api-url'
export interface AdvisorLibraryEntry {
  id: string; kind: 'example' | 'answer'; status: 'review' | 'test-approved' | 'archived'
  intent: string; title: string; customerText: string; context: string; draftReply: string; answer: string
  variants: string[]; source: 'history' | 'correction' | 'manual'; createdAt: number; updatedAt: number
}
export interface AdvisorLibraryStats { total: number; answers: number; examples: number; needsReview: number; testApproved: number }
async function advisorRequest<T>(path: string, method: 'GET' | 'POST' | 'DELETE' = 'GET', data?: unknown): Promise<T> {
  const response = await fetch(apiUrl(path), {
    method,
    headers: method === 'GET' ? undefined : { 'Content-Type': 'application/json', 'X-Zalo-Tool': '1' },
    body: data === undefined ? undefined : JSON.stringify(data),
    signal: AbortSignal.timeout(45000),
  })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error || 'Không xử lý được dữ liệu tư vấn.')
  return result as T
}

export const advisorLibraryApi = {
  list: (query: string, status: string, kind: string, signal?: AbortSignal) => {
    const params = new URLSearchParams({ q: query, status, kind, limit: '150' })
    return fetch(apiUrl(`/api/advisor/library?${params}`), { signal: AbortSignal.any([AbortSignal.timeout(45000), ...(signal ? [signal] : [])]) }).then(async response => {
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Không tải được thư viện tư vấn.')
      return result as { items: Array<{ item: AdvisorLibraryEntry; score: number }>; stats: AdvisorLibraryStats }
    })
  },
  correction: (data: { messages: Array<{ role: 'customer' | 'operator' | 'bot'; text: string }>; draftReply: string; correctedReply: string; intent: string[]; variants: string[] }) =>
    advisorRequest<{ item: AdvisorLibraryEntry; stats: AdvisorLibraryStats }>('/api/advisor/learning/correction', 'POST', data),
  answer: (data: { title: string; intent: string; customerText: string; context: string; answer: string; variants: string[] }) =>
    advisorRequest<{ item: AdvisorLibraryEntry; stats: AdvisorLibraryStats }>('/api/advisor/library/answer', 'POST', data),
  updateAnswer: (id: string, data: { title: string; intent: string; customerText: string; context: string; answer: string; variants: string[] }) =>
    advisorRequest<{ item: AdvisorLibraryEntry; stats: AdvisorLibraryStats }>(`/api/advisor/library/${encodeURIComponent(id)}/update`, 'POST', data),
  status: (id: string, status: AdvisorLibraryEntry['status']) =>
    advisorRequest<{ item: AdvisorLibraryEntry; stats: AdvisorLibraryStats }>(`/api/advisor/library/${encodeURIComponent(id)}/status`, 'POST', { status }),
  remove: (id: string) => advisorRequest<{ success: boolean; stats: AdvisorLibraryStats }>(`/api/advisor/library/${encodeURIComponent(id)}`, 'DELETE'),
  importHistory: () => advisorRequest<{ imported: number; skipped: number; total: number }>('/api/advisor/library/import-history', 'POST', {}),
  export: () => advisorRequest<{ filename: string; content: string; stats: AdvisorLibraryStats }>('/api/advisor/library/export'),
}

async function request<T>(path: string, signal?: AbortSignal, data?: unknown): Promise<T> {
  const response = await fetch(apiUrl(path), { method: data === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', 'X-Zalo-Tool': '1' }, body: data === undefined ? undefined : JSON.stringify(data), signal: AbortSignal.any([AbortSignal.timeout(45000), ...(signal ? [signal] : [])]) })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error || 'Không xử lý được yêu cầu.')
  return result as T
}
export const automationApi = {
  lead: (id: string, signal: AbortSignal) => request<Lead>(`/api/leads/${encodeURIComponent(id)}`, signal),
  state: (signal: AbortSignal) => request<AutomationSnapshot>('/api/automation/state', signal),
  logs: (signal: AbortSignal) => request<AutomationLogs>('/api/automation/logs', signal),
  groups: (accountId: string, signal: AbortSignal) => request<{ groups: Conversation[] }>(`/api/automation/choices?${new URLSearchParams({ accountId })}`, signal),
  members: (accountId: string, groupId: string, signal: AbortSignal) => request<{ members: GroupMember[] }>(`/api/automation/choices?${new URLSearchParams({ accountId, groupId })}`, signal),
  configure: (accountId: string, groupId: string, senderId: string, targetGroupId: string, id: string | null = null) => request<AutomationSnapshot>('/api/automation/rule', undefined, { accountId, groupId, senderId, targetGroupId, id }),
  toggle: (enabled: boolean, id: string) => request<AutomationSnapshot>('/api/automation/enabled', undefined, { enabled, id }),
  bulkState: (signal: AbortSignal) => request<BulkMessageSnapshot>('/api/automation/bulk', signal),
  bulkCreate: (data: { accountId: string; phones: string; message: string; startTime: string; endTime: string; delaySeconds: number; dailyLimit: number; image?: BulkMessageImageUpload }) => request<BulkMessageSnapshot>('/api/automation/bulk/create', undefined, data),
  bulkUpdate: (data: { id: string; accountId: string; message: string; startTime: string; endTime: string; delaySeconds: number; dailyLimit: number; image?: BulkMessageImageUpload; removeImage: boolean }) => request<BulkMessageSnapshot>('/api/automation/bulk/update', undefined, data),
  bulkStart: (id: string) => request<BulkMessageSnapshot>('/api/automation/bulk/start', undefined, { id }),
  bulkRetry: (id?: string) => request<BulkMessageSnapshot>('/api/automation/bulk/retry', undefined, id ? { id } : {}),
  bulkStop: (id?: string) => request<BulkMessageSnapshot>('/api/automation/bulk/stop', undefined, id ? { id } : {}),
  leads: (search: string, stage: string, page: number, signal: AbortSignal) => request<{ leads: Lead[]; total: number; page: number }>(`/api/leads?${new URLSearchParams({ search, stage, page: String(page) })}`, signal),
  editLead: (lead: Lead, fields: { name: string; phone: string; address: string; plan: string; stage: LeadStage }) => request<Lead>(`/api/leads/${encodeURIComponent(lead.id)}`, undefined, { ...fields, updatedAt: lead.updatedAt }),
}
