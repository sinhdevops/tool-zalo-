import { useEffect, useState } from 'react'
import type { ChatAttachment, ChatMessage } from '../../../../shared/messages'
import { chatApi } from '../api'
import ChatAvatar from './ChatAvatar'

export default function ChatContactCard({ attachment, accountId, message, index, busy, onAction }: {
  attachment: ChatAttachment; accountId: string; message: ChatMessage; index: number; busy: boolean
  onAction: (kind: 'open-contact' | 'add-friend', index: number) => void
}) {
  const [qr, setQr] = useState(attachment.qrUrl)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (attachment.qrUrl || !attachment.contactId) return
    const controller = new AbortController()
    void chatApi.contactQr(accountId, message.type, message.threadId, message.id, index, controller.signal).then((result) => {
      if (!controller.signal.aborted) setQr(result.qrUrl)
    }).catch(() => undefined)
    return () => controller.abort()
  }, [accountId, attachment.qrUrl, attachment.contactId, message.type, message.threadId, message.id, index])
  return <div className="chat-contact-card">
    <div className="chat-contact-card__cover">
      <div className="chat-contact-card__person"><ChatAvatar key={attachment.thumbnailUrl} name={attachment.name} avatar={attachment.thumbnailUrl ?? ''} /><div><strong>{attachment.name}</strong>{attachment.phone && <small>{attachment.phone}</small>}</div></div>
      {qr?.startsWith('https://') && !failed ? <img className="chat-contact-card__qr" src={qr} alt={`Mã QR của ${attachment.name}`} referrerPolicy="no-referrer" onError={() => setFailed(true)} /> : <small className="chat-contact-card__qr-note">Chưa có mã QR</small>}
    </div>
    <div className="chat-contact-card__actions"><button type="button" disabled={busy || !attachment.contactId} title={!attachment.contactId ? 'Danh thiếp thiếu UID Zalo' : undefined} onClick={() => onAction('add-friend', index)}>Kết Bạn</button><button type="button" disabled={busy || !attachment.contactId} title={!attachment.contactId ? 'Danh thiếp thiếu UID Zalo' : undefined} onClick={() => onAction('open-contact', index)}>Nhắn Tin</button></div>
  </div>
}
