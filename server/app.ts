import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AccountService } from './accounts/service.ts'
import { handleChatRequest } from './messages/http.ts'
import { ChatError } from './messages/types.ts'
import type { AutomationService } from './automation/service.ts'
import { handleAutomation } from './automation/http.ts'
import { clearSessionCookie, createSession, passwordIsValid, requestIsAuthenticated, setSessionCookie } from './auth.ts'
import type { AuthConfig } from './auth.ts'

function json(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
  response.end(JSON.stringify(body))
}

interface AppOptions {
  allowedHosts?: string[]
  allowedOrigins?: string[]
  auth?: AuthConfig
}

async function body(request: IncomingMessage) {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += value.length
    if (size > 4096) throw new Error('AUTH_BODY_TOO_LARGE')
    chunks.push(value)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
}

export function createApp(service: AccountService, port: number, automation?: AutomationService, options: AppOptions = {}) {
  const allowedOrigins = new Set([
    `http://127.0.0.1:${port}`, `http://localhost:${port}`,
    'http://127.0.0.1:5173', 'http://localhost:5173',
    'http://127.0.0.1:4173', 'http://localhost:4173',
    ...(options.allowedOrigins ?? []),
  ])
  return createServer(async (request, response) => {
    try {
      const method = request.method ?? 'GET'
      const url = new URL(request.url ?? '/', `http://127.0.0.1:${port}`)
      if (method === 'GET' && url.pathname === '/api/health') { json(response, 200, { status: 'ok' }); return }
      const listeningPort = request.socket.localPort ?? port
      const allowedHosts = new Set([
        `127.0.0.1:${listeningPort}`, `localhost:${listeningPort}`,
        `127.0.0.1:${port}`, `localhost:${port}`,
        ...(options.allowedHosts ?? []),
      ])
      if (!allowedHosts.has(request.headers.host ?? '') || (request.headers.origin && !allowedOrigins.has(request.headers.origin))) {
        json(response, 403, { error: 'Nguồn yêu cầu không được phép.' }); return
      }
      if (method !== 'GET' && (request.headers['x-zalo-tool'] !== '1' || !request.headers['content-type']?.startsWith('application/json'))) {
        json(response, 403, { error: 'Yêu cầu không hợp lệ.' }); return
      }
      if (method === 'GET' && url.pathname === '/api/auth/session') {
        json(response, 200, { authenticated: requestIsAuthenticated(request, options.auth), required: Boolean(options.auth) }); return
      }
      if (method === 'POST' && url.pathname === '/api/auth/login') {
        if (!options.auth) { json(response, 200, { authenticated: true, required: false }); return }
        const input = await body(request)
        const password = input && typeof input === 'object' && 'password' in input ? input.password : undefined
        if (!passwordIsValid(password, options.auth)) { json(response, 401, { error: 'Mật khẩu không đúng.' }); return }
        setSessionCookie(response, createSession(options.auth), options.auth)
        json(response, 200, { authenticated: true, required: true }); return
      }
      if (method === 'POST' && url.pathname === '/api/auth/logout') {
        clearSessionCookie(response, options.auth?.secure ?? false)
        json(response, 200, { authenticated: false, required: Boolean(options.auth) }); return
      }
      if (!requestIsAuthenticated(request, options.auth)) { json(response, 401, { error: 'Bạn cần đăng nhập để sử dụng công cụ.' }); return }
      if (method === 'GET' && url.pathname === '/api/accounts') { json(response, 200, { accounts: service.listAccounts() }); return }
      if (automation && await handleAutomation(request, response, url, automation, json)) return
      if (await handleChatRequest(request, response, url, service, json)) return
      const loginMatch = /^\/api\/account-logins\/([a-f0-9-]{36})$/i.exec(url.pathname)
      if (loginMatch?.[1]) {
        const id = loginMatch[1]
        if (method === 'POST') { json(response, 202, service.startLogin(id)); return }
        if (method === 'DELETE') { json(response, 200, await service.cancelLogin(id)); return }
        if (method === 'GET') {
          const session = service.getLogin(id)
          json(response, session ? 200 : 404, session ?? { error: 'Phiên QR không còn tồn tại. Hãy tạo mã mới.' }); return
        }
      }
      const accountMatch = /^\/api\/accounts\/([^/]+)$/.exec(url.pathname)
      if (method === 'DELETE' && accountMatch?.[1]) {
        await service.removeAccount(decodeURIComponent(accountMatch[1]))
        json(response, 200, { success: true }); return
      }
      json(response, 404, { error: 'Không tìm thấy API.' })
    } catch (error) {
      if (error instanceof SyntaxError || (error instanceof Error && error.message === 'AUTH_BODY_TOO_LARGE')) {
        json(response, 400, { error: 'Dữ liệu đăng nhập không hợp lệ.' }); return
      }
      if (error instanceof ChatError) { json(response, error.status, { error: error.message }); return }
      const busy = error instanceof Error && error.message === 'TOO_MANY_LOGINS'
      json(response, busy ? 429 : 500, { error: busy ? 'Có quá nhiều phiên QR. Hãy đóng phiên đang mở và thử lại.' : 'Không thể xử lý yêu cầu. Vui lòng thử lại.' })
    }
  })
}
