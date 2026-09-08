import { createDecipheriv } from 'node:crypto'
import type { API, Message, TMessage } from 'zalo-api-final'
import { ThreadType } from 'zalo-api-final'
import { ChatError } from './types.ts'

type RecordValue = Record<string, unknown>
function record(value: unknown): RecordValue {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {}
}
// Cloud responses can encode UIDs as JSON numbers. Preserve their original digits.
export function parseCloudJson(value: string): unknown {
  return JSON.parse(value, (_key, item: unknown, context?: { source: string }) => typeof item === 'number' && !Number.isSafeInteger(item) && context ? context.source : item)
}
export interface DocumentsPage { messages: Message[]; cursor?: string; more: boolean; isOld: boolean }
export function normalizeDocumentsPage(value: unknown, threadId: string, ownId: string): DocumentsPage {
  const page = record(typeof value === 'string' ? parseCloudJson(value) : value)
  if (!Array.isArray(page.groupMsgs)) throw new ChatError('Zalo trả lịch sử My Documents không đúng định dạng.', 502)
  const messages = page.groupMsgs.map((value): Message => {
    const row = record(value)
    if (!/^\d+$/.test(String(row.msgId)) || typeof row.msgType !== 'string' || row.content === undefined) throw new ChatError('Không đọc được một tin trong My Documents.', 502)
    const data = { ...row, msgId: String(row.msgId), cliMsgId: String(row.cliMsgId ?? ''), uidFrom: String(row.uidFrom === '0' || row.uidFrom === 0 ? ownId : row.uidFrom ?? ownId), idTo: threadId, dName: typeof row.dName === 'string' ? row.dName : '', ts: String(row.ts), ttl: Number(row.ttl) || 0 } as TMessage
    return { data, threadId, type: ThreadType.User, isSelf: true }
  })
  const cursor = /^\d+$/.test(String(page.lastMsgId)) ? String(page.lastMsgId) : messages.map((message) => message.data.msgId).sort((a, b) => BigInt(a) < BigInt(b) ? -1 : 1)[0]
  return { messages, cursor, more: page.hasMore === 1 || page.hasMore === true, isOld: page.isOld === 1 || page.isOld === true }
}

type PageInput = { cursor?: string; isOld: boolean }
type CloudAPI = API & { toolReadDocuments: (input: PageInput) => Promise<DocumentsPage> }
const installed = new WeakSet<API>()
export async function readDocumentsHistory(api: API, input: PageInput): Promise<DocumentsPage> {
  if (!installed.has(api)) {
    api.custom<DocumentsPage, PageInput>('toolReadDocuments', async ({ ctx, utils, props }) => {
      const threadId = ctx.loginInfo.send2me_id
      const domain = ctx.loginInfo.zpw_service_map_v3.group_cloud_message?.[0]
      if (!domain || !/^\d{1,30}$/.test(threadId)) throw new ChatError('Phiên Zalo chưa cung cấp API lịch sử My Documents.', 503)
      // Same read-only cloud request as Zalo Web getCM, with isOA for send2me.
      const params = utils.encodeAES(JSON.stringify({ groupId: threadId, globalMsgId: props.cursor ?? '0', count: 50, msgIds: [], imei: ctx.imei, isOA: 1, src: -1 }))
      if (!params) throw new ChatError('Không tạo được yêu cầu lịch sử My Documents.', 502)
      const url = utils.makeURL(`${domain}/api/cm/${props.isOld ? 'getoldv2' : 'getrecentv2'}`, { params, zpw_ver: 690, zpw_type: 30 })
      const response = await utils.request(url, { method: 'GET', signal: AbortSignal.timeout(20_000) })
      if (!response.ok) throw new ChatError(`Zalo chưa trả lịch sử My Documents (HTTP ${response.status}).`, 502)
      let envelope = record(parseCloudJson(await response.text()))
      if (envelope.error_code !== 0) throw new ChatError(`Zalo từ chối tải My Documents (mã ${String(envelope.error_code)}): ${typeof envelope.error_message === 'string' ? envelope.error_message.slice(0, 160) : 'Không rõ nguyên nhân'}`, 502)
      if (typeof envelope.data === 'string') {
        const key = Buffer.from(ctx.secretKey, 'base64')
        const decipher = createDecipheriv(`aes-${key.length * 8}-cbc`, key, Buffer.alloc(16))
        const clear = Buffer.concat([decipher.update(Buffer.from(decodeURIComponent(envelope.data), 'base64')), decipher.final()]).toString('utf8')
        envelope = record(parseCloudJson(clear))
      }
      if (envelope.error_code !== 0) throw new ChatError(`Zalo chưa tải được My Documents (mã ${String(envelope.error_code)}).`, 502)
      return normalizeDocumentsPage(envelope.data, threadId, ctx.uid)
    })
    installed.add(api)
  }
  return (api as CloudAPI).toolReadDocuments(input)
}
