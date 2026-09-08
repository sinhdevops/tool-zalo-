// Isolated UI fixture: no SDK, credentials, or real recipients are loaded.
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { automationFixture, incoming, contact } from '../fixtures/automation.ts'
import { handleAutomation } from '../../server/automation/http.ts'
import { ChatError } from '../../server/messages/types.ts'
import type { ServerResponse } from 'node:http'
const f = automationFixture()
const json = (response: ServerResponse, status: number, value: unknown) => { response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(value)) }
const server = await createServer({ configFile: false, root: fileURLToPath(new URL('../../', import.meta.url)), cacheDir: 'node_modules/.tmp/automation-ui-vite', server: { host: '127.0.0.1', port: 5175, strictPort: true }, plugins: [react(), { name: 'automation-fixture', configureServer(vite) {
  vite.middlewares.use(async (req, res, next) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1:5175')
    if (!url.pathname.startsWith('/api/')) { next(); return }
    try {
      if (url.pathname === '/api/accounts') { json(res, 200, { accounts: [{ id: '99', displayName: 'Tài khoản kiểm thử', avatar: '', phoneNumber: '', createdAt: new Date().toISOString(), lastLoginAt: new Date().toISOString(), status: 'connected' }] }); return }
      if (url.pathname === '/api/test/incoming' && req.method === 'POST') {
        f.emit(incoming('sample-order')); f.emit(contact('sample-card')); f.emit(incoming('waiting-order', 'Tên khách hàng: Khách chờ danh thiếp\nĐịa chỉ lắp đặt: Địa chỉ kiểm thử thứ hai\nSố liên hệ: 0380000000')); await f.drain(); json(res, 200, f.store.stats()); return
      }
      if (url.pathname === '/api/chat/99/open-thread' && req.method === 'POST') { json(res, 200, { id: url.searchParams.get('threadId'), type: 'personal', name: 'Khách đã sửa', avatar: '', lastMessage: '0900000000', updatedAt: Date.now() }); return }
      if (url.pathname === '/api/chat/99/conversations') { json(res, 200, { connection: 'connected', conversations: [] }); return }
      if (url.pathname === '/api/chat/99/messages') { json(res, 200, { connection: 'connected', historyLoading: false, hasMore: false, messages: [], conversation: { id: url.searchParams.get('threadId'), type: 'personal', name: 'Khách đã sửa', avatar: '', lastMessage: '', updatedAt: 0 } }); return }
      if (await handleAutomation(req, res, url, f.service, json)) return
      json(res, 404, { error: 'Fixture endpoint not implemented' })
    } catch (cause) { json(res, cause instanceof ChatError ? cause.status : 500, { error: cause instanceof Error ? cause.message : 'Fixture error' }) }
  })
} }] })
await server.listen()
console.log('Automation fixture only: http://127.0.0.1:5175/automation')
process.on('SIGINT', () => { void server.close().then(() => f.service.close()).then(() => process.exit(0)) })
