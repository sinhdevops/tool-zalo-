import type { Conversation, ConversationList, ConversationType, MessageList, PhoneSyncState, SendChatInput, MessageAction } from '../../shared/messages.ts'
import type { IncomingMessage, GroupMember } from '../../shared/automation.ts'

export interface MessagingConnection {
  subscribeIncoming: (listener: (event: IncomingMessage) => void) => () => void
  status: () => string
  groupMembers: (groupId: string) => Promise<GroupMember[]>
  automationHeart: (groupId: string, messageId: string, clientId: string) => Promise<void>
  automationDeliver: (targetGroupId: string, text: string, contacts: Array<{ phone: string; contactId?: string }>) => Promise<Array<{ phone: string; card: boolean }>>
  automationFindUser: (phone: string) => Promise<{ id: string; name: string; avatar: string }>
  automationSendMessage: (contactId: string, text: string) => Promise<void>
  openPersonal: (contactId: string, name: string) => Conversation
  list: (type: ConversationType) => Promise<ConversationList>
  messages: (type: ConversationType, id: string) => MessageList
  history: (type: ConversationType, id?: string) => void
  markRead: (type: ConversationType, id: string, through: number) => { count: number; through: number }
  findUser: (phone: string) => Promise<Conversation>
  send: (type: ConversationType, id: string, input: SendChatInput) => Promise<string[]>
  action: (type: ConversationType, id: string, input: MessageAction) => Promise<{ conversation?: Conversation }>
  contactQr: (type: ConversationType, id: string, messageId: string, index: number) => Promise<{ qrUrl?: string }>
  reconnect: () => void
  phoneSync: () => PhoneSyncState
  requestPhoneSync: () => Promise<PhoneSyncState>
  dispose: () => void
}
export class ChatError extends Error {
  status: number
  constructor(message: string, status = 400) { super(message); this.status = status }
}
