import type { Message } from 'zalo-api-final'
import { ThreadType } from 'zalo-api-final'
import type { ChatAttachment, ChatMessage } from '../../shared/messages.ts'

export function safeMediaUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : undefined } catch { return undefined }
}
function record(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    try { return record(JSON.parse(value)) } catch { return {} }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
function firstUrl(...values: unknown[]) { return values.map(safeMediaUrl).find(Boolean) }

export function normalizeMessage(message: Message): ChatMessage {
  const { data } = message
  const content = data.content
  const attachment = typeof content === 'object' && content !== null ? record(content) : {}
  const params = record(attachment.params)
  // Zalo ecard types 2/3 are friendship acceptance notices, not user text.
  const system = data.msgType === 'chat.ecard' && ['2', '3'].includes(String(attachment.type))
  const image = ['chat.photo', 'chat.sticker', 'chat.gif', 'chat.doodle'].includes(data.msgType)
  const contact = data.msgType === 'chat.recommended' && ['recommened.user', 'recommened.vip'].includes(String(attachment.action))
  const link = safeMediaUrl(attachment.href)
  const thumbnail = firstUrl(attachment.thumb, params.thumbUrl)
  const title = typeof attachment.title === 'string' ? attachment.title : ''
  let media: ChatAttachment | undefined
  if (contact) {
    const description = record(attachment.description)
    const contactId = [attachment.params, params.contactUid, params.userId].find((value) => typeof value === 'string' && /^\d{1,30}$/.test(value)) as string | undefined
    const phone = [description.phone, params.phone].find((value) => typeof value === 'string' && /^\+?[\d .-]{8,20}$/.test(value)) as string | undefined
    media = { name: title || 'Liên hệ Zalo', kind: 'contact', thumbnailUrl: thumbnail, contactId, phone, qrUrl: firstUrl(description.qrCodeUrl, params.qrCodeUrl) }
  } else if (image) {
    media = { name: title || 'Hình ảnh', kind: 'image', url: firstUrl(attachment.href, params.oriUrl, params.hdUrl, params.normalUrl, thumbnail), thumbnailUrl: thumbnail }
  } else if (link) {
    media = { name: title || 'Tệp đính kèm', kind: thumbnail && data.msgType === 'chat.recommended' ? 'link' : 'file', url: link, thumbnailUrl: thumbnail }
  }
  const sourceTimestamp = Number(data.ts)
  const timestamp = Number.isFinite(sourceTimestamp) && sourceTimestamp > 0 ? (sourceTimestamp < 10_000_000_000 ? sourceTimestamp * 1000 : sourceTimestamp) : Date.now()
  return {
    id: String(data.msgId), threadId: message.threadId,
    type: message.type === ThreadType.Group ? 'group' : 'personal',
    senderId: String(data.uidFrom), senderName: data.dName || '', self: message.isSelf,
    ...(system ? { system: true } : {}),
    canReply: !system && Boolean(data.cliMsgId), canReact: !system && Boolean(data.cliMsgId),
    ...(data.quote ? { quote: { senderName: data.quote.fromD || data.quote.ownerId, text: data.quote.msg || 'Tệp đính kèm' } } : {}),
    timestamp,
    text: typeof content === 'string' ? content : media ? '' : title || '[Nội dung chưa hỗ trợ hiển thị]',
    attachments: media ? [media] : [],
  }
}
