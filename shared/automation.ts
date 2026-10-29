import type { ChatMessage } from './messages.ts'

export interface AutomationRule {
  id: string; accountId: string; groupId: string; groupName: string; senderId: string; senderName: string
  senderIds?: string[]
  targetGroupId: string; targetGroupName: string
  enabled: boolean; enabledAt: number; revision: string
}
// Rules saved before multiple sender selection contain only senderId.
export function automationSenderIds(rule: AutomationRule): string[] { return rule.senderIds ?? [rule.senderId] }
export type LeadStatus = 'waiting' | 'queued' | 'friend' | 'sending' | 'sent' | 'review'
export const LEAD_STAGES = ['new', 'consulting', 'not-closed', 'waiting-install', 'unpaid', 'paid', 'transfer-fpt', 'transfer-vnpt', 'no-demand', 'cancelled'] as const
export type LeadStage = typeof LEAD_STAGES[number]
export const leadStageLabels: Record<LeadStage, string> = { new: 'Khách mới', consulting: 'Đang tư vấn', 'not-closed': 'Chưa chốt', 'waiting-install': 'Đợi lắp đặt', unpaid: 'Chưa thu tiền', paid: 'Đã thu tiền', 'transfer-fpt': 'Chuyển FPT', 'transfer-vnpt': 'Chuyển VNPT', 'no-demand': 'KH không có nhu cầu', cancelled: 'Hủy' }
export interface Lead {
  id: string; scope: string; phone: string; name: string; address: string; plan: string
  createdAt: number; updatedAt: number; sourceAt: number; sourceId: string; occurrences: number
  accountId: string; groupId: string; groupName: string; senderId: string
  revision: string; hasOrder: boolean; contactId?: string; status: LeadStatus; stage?: LeadStage; detail: string; sentAt?: number; delivery?: 'private' | 'forward'
}
export interface AutomationLog { id: number; at: number; text: string; leadId?: string }
export interface AutomationLogs { logs: AutomationLog[]; limit: number }
export interface IncomingMessage { message: ChatMessage; clientId: string }
export interface GroupMember { id: string; name: string }
export interface AutomationSnapshot { rules?: (AutomationRule & { connection: string })[]; rule: AutomationRule | null; connection: string; error: string; total: number; sent: number; waiting: number }
export const leadStatusLabels: Record<LeadStatus, string> = { waiting: 'Chờ xử lý', queued: 'Chờ chuyển tiếp', friend: 'Dữ liệu cũ', sending: 'Đang chuyển tiếp', sent: 'Đã chuyển tiếp', review: 'Cần kiểm tra' }

export type BulkMessageItemStatus = 'pending' | 'searching' | 'sending' | 'sent' | 'error'
export const BULK_MESSAGE_DELAY_SECONDS = 60
export const BULK_MESSAGE_PAUSE_EVERY = 2
export const BULK_MESSAGE_PAUSE_SECONDS = 120
export const BULK_MESSAGE_MAX_LOOKUP_RETRIES = 1
export const BULK_MESSAGE_LOOKUPS_PER_HOUR = 60
export const BULK_MESSAGE_LOOKUP_WINDOW_MS = 60 * 60 * 1000
export const BULK_MESSAGE_LOOKUP_RETRY_DELAY_MS = 60_000
export interface BulkMessageItem {
  id: string
  phone: string
  status: BulkMessageItemStatus
  detail: string
  retryAt?: number
  retryCount?: number
  failureStage?: 'lookup' | 'send'
  name?: string
  sentAt?: number
  step?: 'lookup' | 'text' | 'image' | 'friend' | 'done'
  startedAt?: number
  updatedAt?: number
  textSentAt?: number
  imageSentAt?: number
  finishedAt?: number
}
export interface BulkSendProgress { stage: 'text' | 'image'; state: 'sending' | 'sent' }
// Older campaigns have no failureStage; only recognizable lookup errors are safe to resend.
export function canRetryBulkItem(item: BulkMessageItem) {
  if (item.status !== 'error' || /người lạ|stranger/i.test(item.detail)) return false
  if (item.failureStage) return item.failureStage === 'lookup'
  return !/đã tìm thấy|đang gửi|khi đang gửi|gửi tin thất bại/i.test(item.detail)
    && /tra cứu|không tìm thấy|mã\s*(212|216|312|313)/i.test(item.detail)
}
export interface BulkMessageSettings {
  accountId: string
  message: string
  image?: { name: string; mimeType: string }
  startTime: string
  endTime: string
  delaySeconds: number
  dailyLimit?: number
  pauseEvery: number
  pauseSeconds: number
}
export interface BulkMessageImageUpload { name: string; mimeType: string; base64: string }
export type BulkMessageCampaignState = 'ready' | 'running' | 'stopped' | 'completed'
export interface BulkMessageCampaign {
  id: string
  createdAt: number
  updatedAt: number
  state: BulkMessageCampaignState
  settings: BulkMessageSettings
  dailyResumeAt?: number
  items: BulkMessageItem[]
  pausedReason?: string
  nextActionAt?: number
}
export interface BulkMessageSnapshot {
  snapshotAt?: number
  activeCampaignId?: string
  running: boolean
  pausedReason: string
  settings: BulkMessageSettings | null
  items: BulkMessageItem[]
  campaigns: BulkMessageCampaign[]
  total: number
  pending: number
  sent: number
  failed: number
  nextActionAt?: number
}
