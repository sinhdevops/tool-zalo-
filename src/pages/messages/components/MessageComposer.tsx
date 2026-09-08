import { useLayoutEffect, useRef, useState } from 'react'
import { FiImage, FiPaperclip, FiSend, FiSmile, FiX } from 'react-icons/fi'
import { Textarea } from '../../../components/common'
import { MAX_ATTACHMENT_BYTES, MAX_MESSAGE_LENGTH } from '../../../../shared/messages'
import type { SendChatInput } from '../../../../shared/messages'

interface ComposerProps { disabled: boolean; name: string; onSend: (input: SendChatInput) => Promise<void>; reply?: { senderName: string; text: string }; onCancelReply?: () => void }
function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.onerror = () => reject(new Error('Không đọc được tệp.'))
    reader.readAsDataURL(file)
  })
}
export default function MessageComposer({ disabled, name, onSend, reply, onCancelReply }: ComposerProps) {
  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [emojis, setEmojis] = useState(false)
  const imageInput = useRef<HTMLInputElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const busy = useRef(false)
  const textInput = useRef<HTMLTextAreaElement>(null)
  const restoreFocus = useRef(false)
  useLayoutEffect(() => {
    if (sending || !restoreFocus.current) return
    restoreFocus.current = false
    // Wait for React to enable the textarea before restoring the cursor.
    if (!disabled) textInput.current?.focus({ preventScroll: true })
  })
  function chooseFile(value?: File) {
    if (!value) return
    if (value.size === 0 || value.size > MAX_ATTACHMENT_BYTES) { setError('Chọn tệp có dung lượng từ 1 byte đến 10 MB.'); return }
    if (!value.name.includes('.') || value.name.endsWith('.')) { setError('Tên tệp cần có phần mở rộng.'); return }
    setFile(value); setError('')
  }
  async function send() {
    if (disabled || busy.current || (!text.trim() && !file)) return
    busy.current = true; setSending(true); setError(''); setEmojis(false)
    try {
      const attachment = file ? { name: file.name, base64: await readFile(file) } : undefined
      await onSend({ requestId: crypto.randomUUID(), text: text.trim(), attachment })
      setText(''); setFile(null)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không gửi được tin nhắn.') }
    finally { busy.current = false; restoreFocus.current = true; setSending(false) }
  }
  return <form className="chat-composer" onSubmit={(event) => { event.preventDefault(); void send() }}>
    {reply && <div className="chat-reply-draft"><div><strong>Trả lời {reply.senderName}</strong><p>{reply.text}</p></div><button type="button" aria-label="Hủy trả lời" disabled={sending} onClick={onCancelReply}><FiX /></button></div>}
    {error && <p className="chat-error" role="alert">{error}</p>}
    {file && <div className="chat-selected-file"><FiPaperclip /><span>{file.name} <small>({(file.size / 1024).toFixed(0)} KB)</small></span><button type="button" className="app-icon-button" aria-label="Bỏ tệp đính kèm" disabled={sending} onClick={() => setFile(null)}><FiX /></button></div>}
    <div className="chat-composer__input"><Textarea ref={textInput} aria-label="Nội dung tin nhắn" placeholder={disabled ? 'Chờ kết nối để gửi tin nhắn…' : `Nhắn tin cho ${name}…`} rows={2} maxLength={MAX_MESSAGE_LENGTH} value={text} disabled={disabled || sending}
      onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send() } }} />
      <button type="submit" className="chat-send" disabled={disabled || sending || (!text.trim() && !file)}><FiSend aria-hidden="true" /><span>{sending ? 'Đang gửi…' : 'Gửi'}</span></button></div>
    <div className="chat-composer__tools">
      <input ref={imageInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(event) => { chooseFile(event.target.files?.[0]); event.target.value = '' }} />
      <input ref={fileInput} type="file" hidden onChange={(event) => { chooseFile(event.target.files?.[0]); event.target.value = '' }} />
      <button type="button" className="app-icon-button" title="Đính kèm ảnh" aria-label="Đính kèm ảnh" disabled={disabled || sending} onClick={() => imageInput.current?.click()}><FiImage /></button>
      <button type="button" className="app-icon-button" title="Đính kèm tệp" aria-label="Đính kèm tệp" disabled={disabled || sending} onClick={() => fileInput.current?.click()}><FiPaperclip /></button>
      <div className="chat-emoji-anchor"><button type="button" className="app-icon-button" title="Biểu tượng cảm xúc" aria-label="Biểu tượng cảm xúc" aria-expanded={emojis} disabled={disabled || sending} onClick={() => setEmojis(!emojis)}><FiSmile /></button>
        {emojis && <div className="chat-emojis" role="group" aria-label="Chọn biểu tượng cảm xúc">{['😀', '😊', '❤️', '👍', '🎉', '🙏', '😂', '🔥', '✅', '👋', '🤝', '💙'].map((emoji) => <button type="button" key={emoji} aria-label={`Chèn ${emoji}`} onClick={() => { setText((value) => (value + emoji).slice(0, MAX_MESSAGE_LENGTH)); setEmojis(false) }}>{emoji}</button>)}</div>}
      </div><small>Enter để gửi · Shift + Enter xuống dòng</small><small>{text.length}/{MAX_MESSAGE_LENGTH}</small>
    </div>
  </form>
}
