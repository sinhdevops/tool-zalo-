import { useState } from 'react'
import { FiCornerUpLeft, FiCornerUpRight, FiMoreHorizontal, FiThumbsUp } from 'react-icons/fi'
import { CHAT_REACTIONS } from '../../../../shared/messages'
import type { ChatMessage, ChatReaction, Conversation } from '../../../../shared/messages'
import ChatAvatar from './ChatAvatar'
import MessageAttachment from './MessageAttachment'
import ChatContactCard from './ChatContactCard'

function LinkedText({ text }: { text: string }) {
  return <>{text.split(/(https?:\/\/[^\s<>]+|(?<!\d)\+?\d{9,15}(?!\d))/g).map((part, index) => /^(https?:\/\/|\+?\d{9,15}$)/.test(part) ? <a key={index} href={/^https?:/.test(part) ? part : `tel:${part}`} target={/^https?:/.test(part) ? '_blank' : undefined} rel="noreferrer">{part}</a> : part)}</>
}

export default function MessageRow({ accountId, message, conversation, localPreview, disabled, onLoad, onReply, onReaction, onForward, onContact }: {
  accountId: string; message: ChatMessage; conversation: Conversation; localPreview?: string; disabled: boolean; onLoad: () => void
  onReply: () => void; onReaction: (reaction: ChatReaction) => Promise<void>; onForward: () => void; onContact: (kind: 'open-contact' | 'add-friend', index: number) => Promise<void>
}) {
  const [panel, setPanel] = useState<'reactions' | 'more' | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const cardOnly = !message.text && message.attachments.length === 1 && message.attachments[0]?.kind === 'contact'
  const name = message.senderName || (message.self ? 'Bạn' : conversation.name)
  async function run(action: () => Promise<void>) {
    if (busy) return
    setBusy(true); setNotice('')
    try { await action(); setPanel(null) } catch (cause) { setNotice(cause instanceof Error ? cause.message : 'Thao tác chưa hoàn tất.') }
    finally { setBusy(false) }
  }
  if (message.system) return <li className="chat-system-message"><p>{message.text}</p><time dateTime={new Date(message.timestamp).toISOString()}>{new Date(message.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</time></li>
  return <li className={`chat-message${message.self ? ' chat-message--self' : ''}${cardOnly ? ' chat-message--card' : ''}`} onKeyDown={(event) => { if (event.key === 'Escape') setPanel(null) }}>
    {!message.self && <ChatAvatar key={message.senderAvatar || conversation.avatar} name={name} avatar={message.senderAvatar || (conversation.type === 'personal' ? conversation.avatar : '')} />}
    <div className="chat-message__body">
      {cardOnly && <span className="chat-sender chat-sender--pill">{name}</span>}
      <div className="chat-bubble">
        {!cardOnly && !message.self && <span className="chat-sender">{name}</span>}
        {message.quote && <blockquote className="chat-quoted-message"><strong>{message.quote.senderName}</strong><p>{message.quote.text}</p></blockquote>}
        {message.text && <p><LinkedText text={message.text} /></p>}
        {message.attachments.map((attachment, index) => <div key={index} className="chat-attachment">{attachment.kind === 'contact' ? <ChatContactCard attachment={attachment} accountId={accountId} message={message} index={index} busy={busy || disabled} onAction={(kind, attachmentIndex) => void run(() => onContact(kind, attachmentIndex))} /> : <MessageAttachment attachment={attachment} localPreview={localPreview} onLoad={onLoad} />}</div>)}
        {!cardOnly && <time dateTime={new Date(message.timestamp).toISOString()} title={new Date(message.timestamp).toLocaleString('vi-VN')}>{new Date(message.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}{message.self ? ' · Đã gửi' : ''}</time>}
      </div>
      {cardOnly && <time className="chat-card-time" dateTime={new Date(message.timestamp).toISOString()}>{new Date(message.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</time>}
      <div className="chat-message-tools" role="group" aria-label="Thao tác tin nhắn">
        <button type="button" aria-label="Trả lời" title="Trả lời" disabled={disabled || !message.canReply} onClick={onReply}><FiCornerUpLeft /></button>
        <button type="button" aria-label="Chuyển tiếp" title={message.attachments.length ? 'Chỉ hỗ trợ chuyển tiếp văn bản' : 'Chuyển tiếp'} disabled={disabled || !message.text || Boolean(message.attachments.length)} onClick={onForward}><FiCornerUpRight /></button>
        <button type="button" aria-label="Thêm thao tác" title="Thêm thao tác" aria-expanded={panel === 'more'} onClick={() => setPanel(panel === 'more' ? null : 'more')}><FiMoreHorizontal /></button>
      </div>
      <div className="chat-reaction-anchor">
        <button type="button" className="chat-reaction-trigger" aria-label="Thả cảm xúc" title="Thả cảm xúc" aria-expanded={panel === 'reactions'} disabled={disabled || busy || !message.canReact} onClick={() => setPanel(panel === 'reactions' ? null : 'reactions')}>{message.ownReaction || <FiThumbsUp />}</button>
        {panel === 'reactions' && <div className="chat-reaction-picker" role="group" aria-label="Chọn cảm xúc">{CHAT_REACTIONS.map((reaction) => <button key={reaction} type="button" aria-label={`Thả ${reaction}`} disabled={busy} onClick={() => void run(() => onReaction(reaction))}>{reaction}</button>)}</div>}
      </div>
      {panel === 'more' && <div className="chat-message-menu"><button type="button" disabled={!message.text} onClick={() => void run(async () => { await navigator.clipboard.writeText(message.text); setNotice('Đã sao chép nội dung.') })}>Sao chép nội dung</button></div>}
      {notice && <p className="chat-action-notice" role="status">{notice}</p>}
    </div>
  </li>
}
