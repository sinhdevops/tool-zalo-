import type { Conversation, ConversationList, ConversationType, MessageList, PhoneSyncState, SendChatInput, MessageAction } from '../../../shared/messages'
import { apiFetch } from '../../auth/apiFetch'

async function request<T>(account: string, action: string, params: Record<string, string> = {}, init: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    response = await apiFetch(`/api/chat/${encodeURIComponent(account)}/${action}?${new URLSearchParams(params)}`, {
      ...init, headers: { 'Content-Type': 'application/json', 'X-Zalo-Tool': '1' },
      signal: AbortSignal.any([AbortSignal.timeout(init.method === 'POST' && action === 'messages' ? 130_000 : 30_000), ...(init.signal ? [init.signal] : [])]),
    })
  } catch (cause) {
    if (init.signal?.aborted) throw cause
    throw new Error(init.method === 'POST' && action === 'messages' ? 'Chưa nhận được kết quả gửi. Kiểm tra Zalo trước khi gửi lại để tránh trùng tin.' : 'Không kết nối được dịch vụ tin nhắn.', { cause })
  }
  const data: unknown = await response.json().catch(() => null)
  if (!response.ok || !data) throw new Error(data && typeof data === 'object' && 'error' in data && typeof data.error === 'string' ? data.error : 'Không tải được dữ liệu tin nhắn.')
  return data as T
}
export const chatApi = {
  openThread: (account: string, threadId: string, name: string) => request<Conversation>(account, 'open-thread', { type: 'personal', threadId }, { method: 'POST', body: JSON.stringify({ name }) }),
  markRead: (account: string, type: ConversationType, threadId: string, through: number) => request<{ count: number; through: number }>(account, 'read', { type, threadId }, { method: 'POST', body: JSON.stringify({ through }) }),
  action: (account: string, type: ConversationType, threadId: string, input: MessageAction) => request<{ conversation?: Conversation }>(account, 'message-action', { type, threadId }, { method: 'POST', body: JSON.stringify(input) }),
  contactQr: (account: string, type: ConversationType, threadId: string, messageId: string, index: number, signal?: AbortSignal) => request<{ qrUrl?: string }>(account, 'contact-qr', { type, threadId, messageId, index: String(index) }, { signal }),
  phoneSync: (account: string, signal?: AbortSignal) => request<PhoneSyncState>(account, 'phone-sync', {}, { signal }),
  requestPhoneSync: (account: string) => request<PhoneSyncState>(account, 'phone-sync', {}, { method: 'POST', body: '{}' }),
  conversations: (account: string, type: ConversationType, signal?: AbortSignal, page?: { query: string; offset: number; limit: number }) => request<ConversationList>(account, 'conversations', { type, ...(page ? { query: page.query, offset: String(page.offset), limit: String(page.limit) } : {}) }, { signal }),
  messages: (account: string, type: ConversationType, threadId: string, signal?: AbortSignal) => request<MessageList>(account, 'messages', { type, threadId }, { signal }),
  send: (account: string, type: ConversationType, threadId: string, input: SendChatInput) => request<{ success: boolean; attachmentIds: string[] }>(account, 'messages', { type, threadId }, { method: 'POST', body: JSON.stringify(input) }),
  history: (account: string, type: ConversationType, threadId?: string) => request(account, 'history', { type, ...(threadId ? { threadId } : {}) }, { method: 'POST', body: '{}' }),
  reconnect: (account: string) => request(account, 'reconnect', {}, { method: 'POST', body: '{}' }),
  findUser: (account: string, phone: string, signal?: AbortSignal) => request<Conversation>(account, 'find-user', { phone }, { signal }),
}
