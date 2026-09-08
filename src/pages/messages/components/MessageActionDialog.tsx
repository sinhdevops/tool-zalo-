import { useEffect, useState } from 'react'
import type { ChatMessage, Conversation } from '../../../../shared/messages'
import { Modal } from '../../../components/common'
import { chatApi } from '../api'
import ChatAvatar from './ChatAvatar'

export type PendingMessageAction = { kind: 'forward'; message: ChatMessage } | { kind: 'add-friend'; message: ChatMessage; index: number }
export default function MessageActionDialog({ accountId, action, onClose, onDone }: { accountId: string; action: PendingMessageAction; onClose: () => void; onDone: () => void }) {
  const [targets, setTargets] = useState<Conversation[]>([])
  const [selected, setSelected] = useState<Conversation>()
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [requestId] = useState(() => crypto.randomUUID())
  const [attempted, setAttempted] = useState(false)
  useEffect(() => {
    if (action.kind !== 'forward') return
    const controller = new AbortController()
    void Promise.all([chatApi.conversations(accountId, 'personal', controller.signal), chatApi.conversations(accountId, 'group', controller.signal)]).then((results) => {
      if (!controller.signal.aborted) { setTargets(results.flatMap((result) => result.conversations)); setLoaded(true) }
    }).catch((cause: unknown) => { if (!controller.signal.aborted) { setError(cause instanceof Error ? cause.message : 'Không tải được hội thoại.'); setLoaded(true) } })
    return () => controller.abort()
  }, [accountId, action.kind])
  async function submit() {
    if (busy || attempted || (action.kind === 'forward' && !selected)) return
    setBusy(true); setAttempted(true); setError('')
    try {
      await chatApi.action(accountId, action.message.type, action.message.threadId, action.kind === 'forward' && selected ? { requestId, messageId: action.message.id, kind: 'forward', targetId: selected.id, targetType: selected.type } : { requestId, messageId: action.message.id, kind: 'add-friend', attachmentIndex: action.kind === 'add-friend' ? action.index : 0 })
      onDone(); onClose()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Chưa xác nhận được thao tác. Kiểm tra Zalo trước khi thử lại.') }
    finally { setBusy(false) }
  }
  return <Modal title={action.kind === 'forward' ? 'Chuyển tiếp tin nhắn' : 'Gửi lời mời kết bạn'} onClose={onClose} closeDisabled={busy}>
    <div className="chat-action-dialog">
      {action.kind === 'forward' ? <><blockquote>{action.message.text}</blockquote><input aria-label="Tìm nơi chuyển tiếp" placeholder="Tìm người hoặc nhóm…" value={query} disabled={busy} onChange={(event) => setQuery(event.target.value)} /><div className="chat-forward-targets">{!loaded && <p>Đang tải hội thoại…</p>}{targets.filter((target) => target.name.toLocaleLowerCase('vi').includes(query.toLocaleLowerCase('vi'))).map((target) => <button type="button" key={`${target.type}:${target.id}`} aria-pressed={selected?.id === target.id && selected.type === target.type} disabled={busy || attempted} onClick={() => setSelected(target)}><ChatAvatar name={target.name} avatar={target.avatar} group={target.type === 'group'} documents={target.isMyDocuments} /><span>{target.name}<small>{target.type === 'group' ? 'Nhóm' : 'Cá nhân'}</small></span></button>)}{loaded && !targets.length && <p>Chưa có hội thoại để chuyển tiếp.</p>}</div></> : <><p>Gửi lời mời kết bạn đến <strong>{action.message.attachments[action.index]?.name}</strong>?</p><blockquote>Xin chào, mình muốn kết bạn với bạn.</blockquote></>}
      {error && <p role="alert" className="chat-error">{error}</p>}
      <div className="chat-action-dialog__footer"><button type="button" className="phone-sync__close" disabled={busy} onClick={onClose}>Đóng</button><button type="button" className="chat-send" disabled={busy || attempted || (action.kind === 'forward' && !selected)} onClick={() => void submit()}>{busy ? 'Đang gửi…' : action.kind === 'forward' ? 'Chuyển tiếp' : 'Gửi lời mời'}</button></div>
    </div>
  </Modal>
}
