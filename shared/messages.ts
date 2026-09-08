export type ConversationType = 'personal' | 'group'
export type ChatConnectionStatus = 'idle' | 'connecting' | 'connected' | 'disconnected'
export interface PhoneSyncState {
  status: 'idle' | 'requesting' | 'awaiting_confirmation' | 'downloading' | 'decrypting' | 'importing' | 'completed' | 'error'
  reason: string
  progress?: number
  importedMessages?: number
  importedConversations?: number
  backupMessages?: number
  updatedAt: number
}
export interface Conversation {
  id: string
  type: ConversationType
  name: string
  avatar: string
  lastMessage: string
  updatedAt: number
  members?: number
  isMyDocuments?: boolean
  unreadCount?: number
  unreadThrough?: number
}
export interface ChatAttachment { name: string; kind: 'image' | 'file' | 'contact' | 'link'; url?: string; thumbnailUrl?: string; contactId?: string; phone?: string; qrUrl?: string }
export const CHAT_REACTIONS = ['👍', '❤️', '😆', '😮', '😭', '😡'] as const
export type ChatReaction = typeof CHAT_REACTIONS[number]
export type MessageAction = { requestId: string; messageId: string } & (
  { kind: 'react'; reaction: ChatReaction } |
  { kind: 'open-contact' | 'add-friend'; attachmentIndex: number } |
  { kind: 'forward'; targetId: string; targetType: ConversationType }
)
export interface ChatMessage {
  id: string
  threadId: string
  type: ConversationType
  senderId: string
  senderName: string
  senderAvatar?: string
  system?: boolean
  canReply?: boolean
  canReact?: boolean
  ownReaction?: ChatReaction
  quote?: { senderName: string; text: string }
  self: boolean
  text: string
  timestamp: number
  attachments: ChatAttachment[]
}
export interface ConversationList { conversations: Conversation[]; connection: ChatConnectionStatus; unreadError?: string; storageError?: string; directoryError?: string; total?: number; hasMore?: boolean }
export interface MessageList {
  messages: ChatMessage[]
  conversation?: Conversation
  connection: ChatConnectionStatus
  historyLoading: boolean
  hasMore: boolean
  historyError?: string
  unread?: { count: number; through: number }
  unreadError?: string
  storageError?: string
}
export interface SendChatInput {
  requestId: string
  text: string
  attachment?: { name: string; base64: string }
  replyTo?: string
}
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
export const MAX_MESSAGE_LENGTH = 2000
