import type { ChatMessage } from './messages.ts'

export interface AutomationRule {
  id: string; accountId: string; groupId: string; groupName: string; senderId: string; senderName: string
  targetGroupId: string; targetGroupName: string
  enabled: boolean; enabledAt: number; revision: string
}
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
export interface AutomationSnapshot { rule: AutomationRule | null; connection: string; error: string; total: number; sent: number; waiting: number }
export const leadStatusLabels: Record<LeadStatus, string> = { waiting: 'Chờ xử lý', queued: 'Chờ chuyển tiếp', friend: 'Dữ liệu cũ', sending: 'Đang chuyển tiếp', sent: 'Đã chuyển tiếp', review: 'Cần kiểm tra' }
