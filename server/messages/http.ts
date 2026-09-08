import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AccountService } from '../accounts/service.ts'
import type { ConversationList, ConversationType, SendChatInput, MessageAction } from '../../shared/messages.ts'
import { MAX_ATTACHMENT_BYTES } from '../../shared/messages.ts'
import { ChatError } from './types.ts'

async function readJson(request: IncomingMessage, limit: number): Promise<unknown> {
  if (Number(request.headers['content-length']) > limit) throw new ChatError('Tệp đính kèm tối đa 10 MB.', 413)
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string)
    size += buffer.length
    if (size > limit) throw new ChatError('Tệp đính kèm tối đa 10 MB.', 413)
    chunks.push(buffer)
  }
  let value: unknown
  try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')) }
  catch { throw new ChatError('Nội dung yêu cầu không hợp lệ.') }
  return value
}
async function readBody(request: IncomingMessage): Promise<SendChatInput> {
  const value = await readJson(request, Math.ceil(MAX_ATTACHMENT_BYTES * 4 / 3) + 20_000)
  if (!value || typeof value !== 'object' || !('requestId' in value) || typeof value.requestId !== 'string' || !('text' in value) || typeof value.text !== 'string') throw new ChatError('Nội dung yêu cầu không hợp lệ.')
  if ('replyTo' in value && typeof value.replyTo !== 'string') throw new ChatError('Tin nhắn trả lời không hợp lệ.')
  if ('attachment' in value && value.attachment !== undefined && (!value.attachment || typeof value.attachment !== 'object' || !('name' in value.attachment) || typeof value.attachment.name !== 'string' || !('base64' in value.attachment) || typeof value.attachment.base64 !== 'string')) throw new ChatError('Tệp không hợp lệ.')
  return value as SendChatInput
}

const searchable = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase()

export function paginateConversations(source: ConversationList, query: string, offset: number, limit: number): ConversationList {
  const needle = searchable(query.trim())
  const matches = needle ? source.conversations.filter((item) => searchable(`${item.name} ${item.id}`).includes(needle)) : source.conversations
  return { ...source, conversations: matches.slice(offset, offset + limit), total: matches.length, hasMore: offset + limit < matches.length }
}

export async function handleChatRequest(request: IncomingMessage, response: ServerResponse, url: URL, service: AccountService, json: (response: ServerResponse, status: number, body: unknown) => void): Promise<boolean> {
  const match = /^\/api\/chat\/([^/]+)\/(conversations|messages|history|find-user|reconnect|phone-sync|message-action|contact-qr|read|open-thread)$/.exec(url.pathname)
  if (!match?.[1]) return false
  const messaging = service.getMessaging(decodeURIComponent(match[1]))
  const value = url.searchParams.get('type') ?? 'personal'
  if (value !== 'personal' && value !== 'group') throw new ChatError('Loại hội thoại không hợp lệ.')
  const type: ConversationType = value
  const id = url.searchParams.get('threadId') ?? ''
  const action = match[2]
  if (action === 'open-thread') {
    if (request.method !== 'POST' || type !== 'personal' || !/^\d{1,30}$/.test(id)) throw new ChatError('Hội thoại không hợp lệ.')
    const value = await readJson(request, 1024)
    if (!value || typeof value !== 'object' || !('name' in value) || typeof value.name !== 'string') throw new ChatError('Tên hội thoại không hợp lệ.')
    json(response, 200, messaging.openPersonal(id, value.name)); return true
  }
  if (action === 'read') {
    if (request.method !== 'POST') throw new ChatError('Phương thức không được hỗ trợ.', 405)
    if (!/^\d{1,30}$/.test(id)) throw new ChatError('Hội thoại không hợp lệ.')
    const body = await readJson(request, 1024)
    if (!body || typeof body !== 'object' || !('through' in body) || typeof body.through !== 'number') throw new ChatError('Mốc đọc không hợp lệ.')
    json(response, 200, messaging.markRead(type, id, body.through))
    return true
  }
  if (action === 'message-action' || action === 'contact-qr') {
    if (!/^\d{1,30}$/.test(id)) throw new ChatError('Hội thoại không hợp lệ.')
    if (action === 'message-action' && request.method === 'POST') json(response, 200, await messaging.action(type, id, await readJson(request, 4096) as MessageAction))
    else if (action === 'contact-qr' && request.method === 'GET') json(response, 200, await messaging.contactQr(type, id, url.searchParams.get('messageId') ?? '', Number(url.searchParams.get('index'))))
    else throw new ChatError('Phương thức không được hỗ trợ.', 405)
    return true
  }
  if (action === 'phone-sync') {
    if (request.method === 'GET') json(response, 200, messaging.phoneSync())
    else if (request.method === 'POST') json(response, 202, await messaging.requestPhoneSync())
    else throw new ChatError('Phương thức không được hỗ trợ.', 405)
    return true
  }
  if (action === 'conversations' && request.method === 'GET') {
    const query = url.searchParams.get('query')
    const offsetText = url.searchParams.get('offset'), limitText = url.searchParams.get('limit')
    if (query === null && offsetText === null && limitText === null) json(response, 200, await messaging.list(type))
    else {
      const offset = Number(offsetText ?? 0), limit = Number(limitText ?? 20)
      if ((query?.length ?? 0) > 200 || !Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 1000) throw new ChatError('Phân trang hội thoại không hợp lệ.')
      json(response, 200, paginateConversations(await messaging.list(type), query ?? '', offset, limit))
    }
  }
  else if (action === 'find-user' && request.method === 'GET') json(response, 200, await messaging.findUser(url.searchParams.get('phone')?.replace(/[\s.-]/g, '') ?? ''))
  else if (action === 'reconnect' && request.method === 'POST') { messaging.reconnect(); json(response, 200, { success: true }) }
  else if (action === 'history' && request.method === 'POST') { messaging.history(type, id || undefined); json(response, 202, { success: true }) }
  else if (action === 'messages' && /^\d{1,30}$/.test(id)) {
    if (request.method === 'GET') json(response, 200, messaging.messages(type, id))
    else if (request.method === 'POST') {
      const attachmentIds = await messaging.send(type, id, await readBody(request))
      json(response, 200, { success: true, attachmentIds })
    } else throw new ChatError('Phương thức không được hỗ trợ.', 405)
  } else throw new ChatError('Yêu cầu hội thoại không hợp lệ.')
  return true
}
