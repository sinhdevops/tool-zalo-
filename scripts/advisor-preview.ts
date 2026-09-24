// Isolated local playground: no account storage, SDK sessions, or Zalo sends.
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { createApp } from '../server/app.ts'
import type { AccountService } from '../server/accounts/service.ts'
const port = 5176
const api = createApp({ getMessaging() { throw new Error('No live accounts in advisor playground') } } as unknown as AccountService, port)
const vite = await createServer({ configFile: false, server: { host: '127.0.0.1', port, strictPort: true }, plugins: [react(), { name: 'advisor-playground', configureServer(server) {
  server.middlewares.use((req, res, next) => {
    if (req.url?.split('?')[0] === '/api/advisor/test') { api.emit('request', req, res); return }
    if (req.url?.startsWith('/api/')) { res.writeHead(404); res.end(); return }
    next()
  })
} }] })
await vite.listen()
console.log(`Advisor playground: http://127.0.0.1:${port}/automation/advisor-test`)
process.on('SIGINT', () => { void vite.close().then(() => process.exit(0)) })
