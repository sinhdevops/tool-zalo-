import { useState } from 'react'
import { FiImage, FiPaperclip } from 'react-icons/fi'
import type { ChatAttachment } from '../../../../shared/messages'
import ChatAvatar from './ChatAvatar'

function safeUrl(value?: string) { return value?.startsWith('https://') ? value : undefined }

export default function MessageAttachment({ attachment, localPreview, onLoad }: { attachment: ChatAttachment; localPreview?: string; onLoad: () => void }) {
  const [failed, setFailed] = useState<string[]>([])
  const [attempt, setAttempt] = useState(0)
  const url = safeUrl(attachment.url)
  const thumbnail = safeUrl(attachment.thumbnailUrl)
  const local = localPreview?.startsWith('blob:') ? localPreview : undefined
  const isImage = attachment.kind === 'image' || Boolean(local)
  const source = (isImage ? [local, url, thumbnail] : [thumbnail]).find((value) => value && !failed.includes(value))
  if (attachment.kind === 'contact') return <div className="chat-contact-card">
    <ChatAvatar key={thumbnail} name={attachment.name} avatar={thumbnail ?? ''} />
    <div><strong>{attachment.name}</strong><small>Danh thiếp Zalo</small></div>
  </div>
  const preview = source ? <img key={`${attempt}:${source}`} src={source} alt={attachment.name} loading="lazy" referrerPolicy="no-referrer" onLoad={onLoad} onError={() => setFailed((values) => [...values, source])} /> : null
  if (isImage) return <div className="chat-image-attachment">
    {preview ? <a href={source} target="_blank" rel="noreferrer">{preview}</a> : <span className="chat-image-unavailable"><FiImage />Chưa tải được ảnh. Bạn có thể thử lại.</span>}
    {!preview && <div className="chat-image-actions"><button type="button" onClick={() => { setFailed([]); setAttempt((value) => value + 1) }}>Tải lại ảnh</button>{url && <a href={url} target="_blank" rel="noreferrer">Mở ảnh gốc</a>}</div>}
  </div>
  if (attachment.kind === 'link' && url) return <a className="chat-link-preview" href={url} target="_blank" rel="noreferrer">{preview}<span>{attachment.name}</span></a>
  return url ? <a href={url} target="_blank" rel="noreferrer"><FiPaperclip />{attachment.name}</a> : <span><FiPaperclip />{attachment.name}</span>
}
