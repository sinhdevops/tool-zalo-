import type { IncomingMessage, ServerResponse } from 'node:http'
import { z } from 'zod'
import type { AccountService } from '../accounts/service.ts'
import { ChatError } from '../messages/types.ts'
import { AdvisorLearningStore, redactAdvisorText } from './learning-store.ts'
import { advisorInputSchema, closingSchema } from './types.ts'
import { draftAdvice, draftId } from './engine.ts'
import { loadKnowledge } from './knowledge.ts'
import { testKnowledge } from './test-knowledge.ts'

const requestSchema = z.object({
  accountId: z.string().regex(/^\d{1,30}$/), threadId: z.string().regex(/^\d{1,30}$/),
  facts: advisorInputSchema.shape.facts, paused: z.boolean().default(false),
  closing: closingSchema.optional(),
}).strict()

const historyMessageSchema = z.object({ role: z.enum(['customer', 'operator', 'bot']), text: z.string().max(6000) }).strict()
const correctionSchema = z.object({
  messages: z.array(historyMessageSchema).min(1).max(100),
  draftReply: z.string().max(3000).default(''),
  correctedReply: z.string().trim().min(1).max(3000),
  intent: z.array(z.string().max(80)).max(12).default([]),
  variants: z.array(z.string().trim().min(1).max(500)).max(40).default([]),
}).strict()
const manualAnswerSchema = z.object({
  title: z.string().trim().min(1).max(160),
  intent: z.string().trim().max(100).default(''),
  customerText: z.string().trim().min(1).max(6000),
  context: z.string().max(3000).default(''),
  answer: z.string().trim().min(1).max(3000),
  variants: z.array(z.string().trim().min(1).max(500)).max(40).default([]),
}).strict()

async function readJson(request: IncomingMessage, maxBytes: number) {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const bytes = Buffer.from(chunk)
    size += bytes.length
    if (size > maxBytes) throw new ChatError('Yêu cầu quá lớn.', 413)
    chunks.push(bytes)
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown }
  catch { throw new ChatError('Nội dung yêu cầu không hợp lệ.') }
}

function getCorrectionContext(messages: z.infer<typeof historyMessageSchema>[]) {
  const customerIndex = messages.findLastIndex(message => message.role === 'customer')
  if (customerIndex < 0) return { customerText: '', context: '' }
  const customerText = messages[customerIndex]!.text
  const previous = messages.slice(Math.max(0, customerIndex - 6), customerIndex).filter(message => message.role !== 'customer')
  return { customerText, context: previous.map(message => message.text).join('\n').slice(-3000) }
}

function canApplySavedAnswer(draft: ReturnType<typeof draftAdvice>) {
  if (draft.action !== 'draft' || !draft.reply || draft.missing.length) return false
  if (draft.offerId || draft.priceSheet || draft.priceSheets?.length || draft.recommendation?.plan || draft.billingTerm || draft.installationFee || draft.cameraAddon || draft.tvAddon || draft.closingChecklist) return false
  return !draft.intent.some(intent => ['price', 'recommend', 'fee', 'promotion', 'schedule', 'payment', 'invoice', 'complaint', 'human', 'stop', 'signup'].includes(intent))
}

export async function handleAdvisor(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  accounts: AccountService,
  json: (r: ServerResponse, status: number, value: unknown) => void,
  learning?: AdvisorLearningStore,
) {
  const method = request.method ?? 'GET'
  const libraryPath = url.pathname === '/api/advisor/library'
  const exportPath = url.pathname === '/api/advisor/library/export'
  const importPath = url.pathname === '/api/advisor/library/import-history'
  const correctionPath = url.pathname === '/api/advisor/learning/correction'
  const answerPath = url.pathname === '/api/advisor/library/answer'
const itemUpdateMatch = /^\/api\/advisor\/library\/([^/]+)\/update$/.exec(url.pathname)
  const itemStatusMatch = /^\/api\/advisor\/library\/([^/]+)\/status$/.exec(url.pathname)
  const itemMatch = /^\/api\/advisor\/library\/([^/]+)$/.exec(url.pathname)

  if (libraryPath && method === 'GET') {
    if (!learning) throw new ChatError('Kho tư vấn chưa được khởi tạo.', 503)
    const statusValue = url.searchParams.get('status') ?? 'all'
    const kindValue = url.searchParams.get('kind') ?? 'all'
    const status = ['all', 'review', 'test-approved', 'archived'].includes(statusValue) ? statusValue as 'all' | 'review' | 'test-approved' | 'archived' : 'all'
    const kind = ['all', 'example', 'answer'].includes(kindValue) ? kindValue as 'all' | 'example' | 'answer' : 'all'
    const limit = Math.max(1, Math.min(Number(url.searchParams.get('limit')) || 100, 250))
    json(response, 200, { items: learning.search(url.searchParams.get('q') ?? '', { status, kind, limit }), stats: learning.stats() })
    return true
  }

  if (exportPath && method === 'GET') {
    if (!learning) throw new ChatError('Kho tư vấn chưa được khởi tạo.', 503)
    json(response, 200, { filename: 'advisor-training.jsonl', content: learning.exportJsonl(), stats: learning.stats() })
    return true
  }

  if (importPath && method === 'POST') {
    if (!learning) throw new ChatError('Kho tư vấn chưa được khởi tạo.', 503)
    try { json(response, 200, learning.importAnalysis()) }
    catch (error) {
      if (error instanceof Error && error.message === 'ADVISOR_ANALYSIS_NOT_FOUND') throw new ChatError('Không tìm thấy tệp phân tích hội thoại trong thư mục dữ liệu.', 404)
      if (error instanceof Error && error.message === 'ADVISOR_ANALYSIS_INVALID') throw new ChatError('Tệp phân tích hội thoại không đúng định dạng.', 422)
      throw error
    }
    return true
  }

  if (correctionPath && method === 'POST') {
    if (!learning) throw new ChatError('Kho tư vấn chưa được khởi tạo.', 503)
    const parsed = correctionSchema.safeParse(await readJson(request, 65536))
    if (!parsed.success) throw new ChatError('Nội dung câu sửa chưa hợp lệ.')
    const { customerText, context } = getCorrectionContext(parsed.data.messages)
    if (!customerText) throw new ChatError('Không tìm thấy tin nhắn khách cần học.')
    const item = learning.save({
      kind: 'answer', status: 'test-approved', source: 'correction',
      intent: parsed.data.intent.join(','), title: `Câu bạn sửa · ${parsed.data.intent.join(', ') || 'chưa phân loại'}`,
      customerText, context, draftReply: redactAdvisorText(parsed.data.draftReply),
      answer: parsed.data.correctedReply, variants: [customerText, ...parsed.data.variants],
    })
    json(response, 201, { item, stats: learning.stats() })
    return true
  }

  if (answerPath && method === 'POST') {
    if (!learning) throw new ChatError('Kho tư vấn chưa được khởi tạo.', 503)
    const parsed = manualAnswerSchema.safeParse(await readJson(request, 16384))
    if (!parsed.success) throw new ChatError('Câu trả lời hoặc cách hỏi mẫu chưa hợp lệ.')
    const item = learning.save({ ...parsed.data, kind: 'answer', status: 'test-approved', source: 'manual' })
    json(response, 201, { item, stats: learning.stats() })
    return true
  }

  if (itemUpdateMatch && method === 'POST') {
    if (!learning) throw new ChatError('Kho tư vấn chưa được khởi tạo.', 503)
    const id = decodeURIComponent(itemUpdateMatch[1]!)
    const current = learning.item(id)
    if (!current || current.kind !== 'answer') throw new ChatError('Không tìm thấy câu trả lời.', 404)
    const parsed = manualAnswerSchema.safeParse(await readJson(request, 16384))
    if (!parsed.success) throw new ChatError('Câu trả lời hoặc cách hỏi mẫu chưa hợp lệ.')
    const item = learning.save({ ...current, ...parsed.data, id, status: 'test-approved' })
    json(response, 200, { item, stats: learning.stats() })
    return true
  }

  if (itemStatusMatch && method === 'POST') {
    if (!learning) throw new ChatError('Kho tư vấn chưa được khởi tạo.', 503)
    const parsed = z.object({ status: z.enum(['review', 'test-approved', 'archived']) }).strict().safeParse(await readJson(request, 1024))
    if (!parsed.success) throw new ChatError('Trạng thái bài học không hợp lệ.')
    const id = decodeURIComponent(itemStatusMatch[1]!)
    const current = learning.item(id)
    if (!current) throw new ChatError('Không tìm thấy bài học.', 404)
    if (current.kind !== 'answer' && parsed.data.status === 'test-approved') {
      throw new ChatError('Mẫu lịch sử cần được chuyển thành câu trả lời trước khi dùng trong phòng test.', 422)
    }
    const item = learning.setStatus(id, parsed.data.status)
    if (!item) throw new ChatError('Không tìm thấy bài học.', 404)
    json(response, 200, { item, stats: learning.stats() })
    return true
  }

  if (itemMatch && method === 'DELETE') {
    if (!learning) throw new ChatError('Kho tư vấn chưa được khởi tạo.', 503)
    const deleted = learning.remove(decodeURIComponent(itemMatch[1]!))
    if (!deleted) throw new ChatError('Không tìm thấy bài học.', 404)
    json(response, 200, { success: true, stats: learning.stats() })
    return true
  }

  if (!['/api/advisor/draft', '/api/advisor/test'].includes(url.pathname)) return false
  if (method !== 'POST') throw new ChatError('Chỉ hỗ trợ tạo bản nháp bằng POST.', 405)
  const body = await readJson(request, url.pathname === '/api/advisor/test' ? 65536 : 8192)
  if (url.pathname === '/api/advisor/test') {
    const parsed = advisorInputSchema.safeParse(body)
    if (!parsed.success) throw new ChatError('Tin nhắn hoặc thông tin test không hợp lệ.')
    const input = parsed.data
    // Test manually submitted turns immediately, without simulating the live debounce.
    const now = Math.max(Date.now(), ...input.messages.map(m => m.at + 5000))
    const draft = draftAdvice(input, testKnowledge(), now)
    const lastCustomer = [...input.messages].reverse().find(message => message.role === 'customer')
    const previousAgent = input.messages.slice(0, Math.max(0, input.messages.findLastIndex(message => message.id === lastCustomer?.id))).findLast(message => message.role !== 'customer')
    const learned = learning && lastCustomer ? learning.bestAnswer({ text: lastCustomer.text, context: previousAgent?.text ?? '', intent: draft.intent }) : undefined
    if (learned) {
      draft.learningMatch = { id: learned.item.id, title: learned.item.title, score: learned.score, applied: canApplySavedAnswer(draft) }
      if (draft.learningMatch.applied) {
        draft.reply = learned.item.answer
        draft.reasons = [...draft.reasons, 'saved-test-correction']
      }
    }
    json(response, 200, draft)
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
