import type { AutomationLogs, AutomationSnapshot, BulkMessageSnapshot, GroupMember, Lead, LeadStage } from '../../../shared/automation'
import type { Conversation } from '../../../shared/messages'
import { apiUrl } from '../../api-url'
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
  bulkCreate: (data: { accountId: string; phones: string; message: string; startTime: string; endTime: string; delaySeconds: number }) => request<BulkMessageSnapshot>('/api/automation/bulk/create', undefined, data),
  bulkStart: (id: string) => request<BulkMessageSnapshot>('/api/automation/bulk/start', undefined, { id }),
  bulkRetry: (id?: string) => request<BulkMessageSnapshot>('/api/automation/bulk/retry', undefined, id ? { id } : {}),
  bulkStop: (id?: string) => request<BulkMessageSnapshot>('/api/automation/bulk/stop', undefined, id ? { id } : {}),
  leads: (search: string, stage: string, page: number, signal: AbortSignal) => request<{ leads: Lead[]; total: number; page: number }>(`/api/leads?${new URLSearchParams({ search, stage, page: String(page) })}`, signal),
  editLead: (lead: Lead, fields: { name: string; phone: string; address: string; plan: string; stage: LeadStage }) => request<Lead>(`/api/leads/${encodeURIComponent(lead.id)}`, undefined, { ...fields, updatedAt: lead.updatedAt }),
}
