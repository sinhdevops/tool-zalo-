import type { IncomingMessage } from '../../shared/automation.ts'
import type { MessagingConnection } from '../../server/messages/types.ts'
import { AutomationService } from '../../server/automation/service.ts'
import { AutomationStore } from '../../server/automation/store.ts'

export function automationFixture(store = new AutomationStore(), settleMs = 0, bulkClock?: () => Date) {
  const listeners = new Set<(event: IncomingMessage) => void>()
  const calls: Array<{ kind: string; id: string; text?: string }> = []
  let failForward = false
  let onHeart: (() => Promise<void>) | undefined
  let connectionState = 'connected'
  const chat = {
    status: () => connectionState,
    reconnect: () => { calls.push({ kind: 'reconnect', id: '99' }); connectionState = 'connected' },
    subscribeIncoming: (fn: (event: IncomingMessage) => void) => { listeners.add(fn); return () => { listeners.delete(fn) } },
    list: async () => ({ connection: 'connected', conversations: [{ id: '22', type: 'group', name: 'Trà Xinh Tv Viettel 🍀💰💸❤️', avatar: '', lastMessage: '', updatedAt: 0 }, { id: '33', type: 'group', name: 'Nhận Số VT', avatar: '', lastMessage: '', updatedAt: 0 }] }),
    groupMembers: async () => [{ id: '11', name: 'Wifi Truyền Hình Camera V I E T T E L' }, { id: '12', name: 'Người khác' }],
    messages: () => ({ connection: 'connected', conversation: undefined, messages: [], hasMore: false, historyLoading: false, unread: { count: 0, through: 0 } }),
    automationHeart: async (_group: string, id: string) => { calls.push({ kind: 'heart', id }); await onHeart?.() },
    automationDeliver: async (target: string, text: string, contacts: Array<{ phone: string; contactId?: string }>) => {
      calls.push({ kind: 'send-message', id: target, text })
      if (failForward) throw new Error('uncertain send')
      for (const item of contacts) if (item.contactId) calls.push({ kind: 'send-card', id: item.phone, text: `${target}:${item.contactId}` })
      return contacts.map((item) => ({ phone: item.phone, card: Boolean(item.contactId) }))
    },
    automationFindUser: async (phone: string) => { calls.push({ kind: 'find-user', id: phone }); return { id: '123', name: 'Khách thử', avatar: '' } },
    automationSendMessage: async (id: string, text: string) => { calls.push({ kind: 'bulk-send', id, text }) },
  } as unknown as MessagingConnection
  const accounts = { getMessaging: (id: string) => { if (id !== '99') throw new Error('No account'); return chat } }
  const service = new AutomationService(accounts, store, settleMs, bulkClock)
  const emit = (event: IncomingMessage) => { for (const fn of listeners) fn(event) }
  return { service, store, calls, accounts, emit, setConnection: (status: string) => { connectionState = status }, failForward: () => { failForward = true }, holdHeart: (fn: () => Promise<void>) => { onHeart = fn }, async enable() { await service.configure('99', '22', '11', '33'); await service.toggle(true) }, async drain() { for (let i = 0; i < 10; i++) { await service.tick(); await new Promise<void>((resolve) => setImmediate(resolve)) } } }
}
export function incoming(id: string, text = 'Tên khách hàng: Khách mẫu\nĐịa chỉ lắp đặt: Địa chỉ kiểm thử\nGói cước tư vấn: NETVT2\nSố liên hệ: 0900000000'): IncomingMessage {
  return { clientId: `client-${id}`, message: { id, type: 'group', threadId: '22', senderId: '11', senderName: 'Tên có thể thay đổi', self: false, text, timestamp: Date.now() + 1000, attachments: [] } }
}
export function contact(id: string, phone = '0900000000', contactId = '123'): IncomingMessage {
  const event = incoming(id, '')
  event.message.attachments = [{ kind: 'contact', name: 'Khách mẫu', phone, contactId }]
  return event
}
