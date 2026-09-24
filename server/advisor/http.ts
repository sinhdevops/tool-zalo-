import type { IncomingMessage, ServerResponse } from 'node:http'
import { z } from 'zod'
import type { AccountService } from '../accounts/service.ts'
import { ChatError } from '../messages/types.ts'
import { advisorInputSchema, closingSchema } from './types.ts'
import { draftAdvice, draftId } from './engine.ts'
import { loadKnowledge } from './knowledge.ts'
import { testKnowledge } from './test-knowledge.ts'
const requestSchema = z.object({
  accountId: z.string().regex(/^\d{1,30}$/), threadId: z.string().regex(/^\d{1,30}$/),
  facts: advisorInputSchema.shape.facts, paused: z.boolean().default(false),
  closing: closingSchema.optional(),
}).strict()
export async function handleAdvisor(request: IncomingMessage, response: ServerResponse, url: URL, accounts: AccountService, json: (r: ServerResponse, status: number, value: unknown) => void) {
  if (!['/api/advisor/draft', '/api/advisor/test'].includes(url.pathname)) return false
  if (request.method !== 'POST') throw new ChatError('Chỉ hỗ trợ tạo bản nháp bằng POST.', 405)
  const chunks: Buffer[] = []; let size = 0
  for await (const chunk of request) { const bytes = Buffer.from(chunk); size += bytes.length; if (size > (url.pathname === '/api/advisor/test' ? 65536 : 8192)) throw new ChatError('Yêu cầu quá lớn.', 413); chunks.push(bytes) }
  let body: unknown
  try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { throw new ChatError('Nội dung yêu cầu không hợp lệ.') }
  if (url.pathname === '/api/advisor/test') {
    const parsed = advisorInputSchema.safeParse(body)
    if (!parsed.success) throw new ChatError('Tin nhắn hoặc thông tin test không hợp lệ.')
    const input = parsed.data
    // Test manually submitted turns immediately, without simulating the live debounce.
    const now = Math.max(Date.now(), ...input.messages.map(m => m.at + 5000))
    json(response, 200, draftAdvice(input, testKnowledge(), now))
    return true
  }
  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) throw new ChatError('Chọn tài khoản, khách và thông tin tư vấn hợp lệ.')
  const { accountId, threadId, facts, paused, closing } = parsed.data
  const chat = accounts.getMessaging(accountId)
  const history = chat.messages('personal', threadId).messages.filter(m => !m.system).slice(-100)
  if (!history.length) throw new ChatError('Chưa có lịch sử khách này. Mở hội thoại để tải tin nhắn trước.', 409)
  const input = advisorInputSchema.parse({ facts, paused, closing, messages: history.map(m => ({ id: m.id, role: m.self ? 'operator' : 'customer', text: m.text || '[Nội dung cần nhân viên xem]', at: m.timestamp })) })
  const knowledge = loadKnowledge()
  json(response, 200, { ...draftAdvice(input, knowledge), id: draftId(input, knowledge), connection: chat.status() })
  return true
}
