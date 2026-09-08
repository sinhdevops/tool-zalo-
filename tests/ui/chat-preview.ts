// Isolated UI fixture. All /api requests are handled here; no Zalo SDK or account store is loaded.
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import type { ChatMessage, Conversation, SendChatInput } from '../../shared/messages.ts'

const accounts = ['9001', '9002'].map((id, index) => ({ id, displayName: `Tài khoản kiểm thử ${index + 1}`, avatar: '', phoneNumber: '', createdAt: '2026-09-02T00:00:00Z', lastLoginAt: '2026-09-02T00:00:00Z', status: 'connected' }))
const personal: Conversation = { id: '101', type: 'personal', name: 'Liên hệ kiểm thử', avatar: '', lastMessage: 'Xin chào từ dữ liệu kiểm thử', updatedAt: Date.now() }
const group: Conversation = { id: '202', type: 'group', name: 'Nhóm kiểm thử', avatar: '', lastMessage: 'Trao đổi công việc', updatedAt: Date.now(), members: 5 }
const sent = new Map<string, ChatMessage[]>()
const reactions = new Map<string, string>()
const unread = new Map<string, number>()
const server = await createServer({
  configFile: false, root: fileURLToPath(new URL('../../', import.meta.url)), cacheDir: 'node_modules/.tmp/chat-ui-vite',
  server: { host: '127.0.0.1', port: 5175, strictPort: true },
  plugins: [react(), { name: 'chat-ui-fixture', configureServer(vite) {
    vite.middlewares.use(async (request, response, next) => {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1:5175')
      if (!url.pathname.startsWith('/api/')) { next(); return }
      response.setHeader('Content-Type', 'application/json'); response.setHeader('Cache-Control', 'no-store')
      if (url.pathname === '/api/accounts') { response.end(JSON.stringify({ accounts })); return }
      const accountId = url.pathname.split('/')[3]
      if (!accounts.some((account) => account.id === accountId)) { response.statusCode = 404; response.end('{"error":"Fixture only"}'); return }
      if (url.pathname.endsWith('/phone-sync')) {
        if (request.method === 'POST') { response.statusCode = 501; response.end(JSON.stringify({ error: 'Chưa hỗ trợ đồng bộ từ điện thoại.' })); return }
        response.end(JSON.stringify({ status: 'unavailable', reason: 'Công cụ chưa hỗ trợ luồng đồng bộ từ điện thoại của Zalo hiện tại.' })); return
      }
      const conversation = url.searchParams.get('type') === 'group' ? group : personal
      const key = `${accountId}:${conversation.type}:${conversation.id}`
      const unreadCount = unread.get(key) ?? 3
      if (url.pathname.endsWith('/read') && request.method === 'POST') { unread.set(key, 0); response.end('{"count":0,"through":0}'); return }
      if (url.pathname.endsWith('/contact-qr')) { response.end('{}'); return }
      if (url.pathname.endsWith('/message-action')) {
        const chunks: Buffer[] = []
        for await (const chunk of request) chunks.push(Buffer.from(chunk as Uint8Array))
        const action = JSON.parse(Buffer.concat(chunks).toString())
        if (action.kind === 'react') reactions.set(`${key}:${action.messageId}`, action.reaction)
        response.end(JSON.stringify(action.kind === 'open-contact' ? { conversation: personal } : {})); return
      }
      if (url.pathname.endsWith('/conversations')) { response.end(JSON.stringify({ connection: 'connected', conversations: [{ ...conversation, unreadCount, name: accountId === '9001' ? conversation.name : 'Hội thoại tài khoản 2' }] })); return }
      if (url.pathname.endsWith('/messages')) {
        if (request.method === 'POST') {
          const buffers: Buffer[] = []
          for await (const chunk of request) buffers.push(Buffer.from(chunk as Uint8Array))
          const input = JSON.parse(Buffer.concat(buffers).toString()) as SendChatInput
          sent.set(key, [...sent.get(key) ?? [], { id: input.requestId, threadId: conversation.id, type: conversation.type, senderId: accountId ?? '', senderName: 'Bạn', self: true, text: input.text, timestamp: Date.now(), attachments: input.attachment ? [{ name: input.attachment.name, kind: 'file' }] : [] }])
          response.end(JSON.stringify({ success: true, attachmentIds: input.attachment ? [input.requestId] : [] })); return
        }
        const messages = [{ id: '1', threadId: conversation.id, type: conversation.type, senderId: '101', senderName: 'Liên hệ kiểm thử', self: false, text: `🚀 Có order mới qua api:\nTên khách hàng: Khách hàng mẫu\nGói cước tư vấn: NETVT1\nĐịa chỉ lắp đặt: Địa chỉ mẫu để kiểm tra xuống dòng\nSố liên hệ: 0900000000`, timestamp: Date.now() - 120_000, attachments: [] }, { id: 'sample-contact', threadId: conversation.id, type: conversation.type, senderId: '101', senderName: 'Liên hệ kiểm thử', self: false, text: '', timestamp: Date.now() - 90000, attachments: [{ kind: 'contact', name: 'Danh thiếp mẫu', contactId: '101', phone: '0900000000', thumbnailUrl: 'https://placehold.co/96x96/png' }] }, { id: 'sample-image', threadId: conversation.id, type: conversation.type, senderId: '101', senderName: 'Liên hệ kiểm thử', self: false, text: '', timestamp: Date.now() - 60000, attachments: [{ kind: 'image', name: 'Ảnh kiểm thử', url: 'https://example.invalid/missing.jpg', thumbnailUrl: 'https://placehold.co/480x320/png' }] }, ...sent.get(key) ?? []].map((message) => ({ ...message, canReply: true, canReact: true, ownReaction: reactions.get(`${key}:${message.id}`) }))
        response.end(JSON.stringify({ connection: 'connected', historyLoading: false, hasMore: false, messages, unread: { count: unreadCount, through: unreadCount ? 3 : 0 } })); return
      }
      if (url.pathname.endsWith('/find-user')) { response.end(JSON.stringify(personal)); return }
      response.statusCode = 404; response.end('{"error":"Fixture endpoint not implemented"}')
    })
  } }],
})
await server.listen()
console.log('Chat UI fixture only: http://127.0.0.1:5175/messages')
process.on('SIGINT', () => { void server.close().then(() => process.exit(0)) })
