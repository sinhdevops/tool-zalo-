import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdirSync } from 'node:fs'
import { createApp } from './app.ts'
import { AccountService } from './accounts/service.ts'
import { EncryptedAccountStore } from './accounts/store.ts'
import { createZaloGateway } from './accounts/gateway.ts'
import { UnreadStore } from './messages/unread-store.ts'
import { AutomationStore } from './automation/store.ts'
import { AutomationService } from './automation/service.ts'
import { EncryptedChatStore } from './messages/chat-store.ts'

const root = fileURLToPath(new URL('../', import.meta.url))
const port = Number(process.env.PORT ?? process.env.ACCOUNT_API_PORT ?? 3001)
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid port')
const production = process.env.NODE_ENV === 'production' || Boolean(process.env.RAILWAY_ENVIRONMENT)
const host = process.env.HOST ?? (production ? '0.0.0.0' : '127.0.0.1')
const directory = process.env.ACCOUNT_DATA_DIR ?? path.join(root, '.data')
const allowedOrigins = (process.env.APP_ALLOWED_ORIGINS ?? '').split(',').map((value) => value.trim()).filter(Boolean)
const allowedHosts = (process.env.APP_ALLOWED_HOSTS ?? '').split(',').map((value) => value.trim()).filter(Boolean)
if (process.env.RAILWAY_PUBLIC_DOMAIN) allowedHosts.push(process.env.RAILWAY_PUBLIC_DOMAIN)
const password = process.env.APP_ADMIN_PASSWORD
const secret = process.env.APP_SESSION_SECRET
if (production && (!password || password.length < 12)) throw new Error('APP_ADMIN_PASSWORD must contain at least 12 characters')
if (production && (!secret || secret.length < 32)) throw new Error('APP_SESSION_SECRET must contain at least 32 characters')
mkdirSync(directory, { recursive: true })
const unreadStore = new UnreadStore(path.join(directory, 'unread.sqlite'))
const chatStore = new EncryptedChatStore(directory)
const service = new AccountService(new EncryptedAccountStore(directory), createZaloGateway(unreadStore, chatStore))
try { await service.initialize() }
catch {
  console.error('Không thể đọc kho phiên tài khoản. Kiểm tra thư mục dữ liệu và session.key; không xóa khóa nếu cần giữ phiên cũ.')
  process.exit(1)
}
const automation = new AutomationService(service, new AutomationStore(path.join(directory, 'automation.sqlite')))
automation.start()
const server = createApp(service, port, automation, {
  allowedOrigins,
  allowedHosts,
  auth: password && secret ? { password, secret, secure: production } : undefined,
})
server.listen(port, host, () => console.log(`Account API ready on ${host}:${port}`))
server.on('error', () => { console.error('Không thể mở Account API. Kiểm tra cổng đang sử dụng.'); service.shutdown(); process.exit(1) })
let stopping = false
function shutdown() {
  if (stopping) return
  stopping = true
  void automation.close()
  service.shutdown()
  unreadStore.close()
  chatStore.close()
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 3000).unref()
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
