import { useCallback, useEffect, useRef, useState } from 'react'
import { FiArrowLeft, FiMessageSquare } from 'react-icons/fi'
import type { ChatMessage, Conversation } from '../../../../shared/messages'
import { chatApi } from '../api'
import { useChatPolling } from '../hooks/useChatPolling'
import ChatAvatar from './ChatAvatar'
import MessageComposer from './MessageComposer'
import MessageRow from './MessageRow'
import MessageActionDialog from './MessageActionDialog'
import type { PendingMessageAction } from './MessageActionDialog'
import { useSentImagePreviews } from '../hooks/useSentImagePreviews'
import { useReadConversation } from '../hooks/useReadConversation'

export default function ConversationView({ accountId, conversation: selectedConversation, onBack, onChoose }: { accountId: string; conversation: Conversation; onBack: () => void; onChoose: (conversation: Conversation) => void }) {
  const loader = useCallback((signal: AbortSignal) => chatApi.messages(accountId, selectedConversation.type, selectedConversation.id, signal), [accountId, selectedConversation.type, selectedConversation.id])
  const { data, error, refresh } = useChatPolling(loader, 2000)
  const conversation = data?.conversation ?? selectedConversation
  const sentImages = useSentImagePreviews()
  const [historyError, setHistoryError] = useState('')
  const [requestingHistory, setRequestingHistory] = useState(false)
  const [reply, setReply] = useState<ChatMessage>()
  const [action, setAction] = useState<PendingMessageAction>()
  const [notice, setNotice] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const atBottom = useRef(true)
  const lastMessage = data?.messages.at(-1)?.id
  useEffect(() => { if (atBottom.current && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight }, [lastMessage])
  const readError = useReadConversation(accountId, conversation.type, conversation.id, data, scrollRef, refresh)
  async function older() {
    setRequestingHistory(true); setHistoryError('')
    try { await chatApi.history(accountId, conversation.type, conversation.id); refresh() }
    catch (cause) { setHistoryError(cause instanceof Error ? cause.message : 'Không tải được lịch sử.') }
    finally { setRequestingHistory(false) }
  }
  return <section className="conversation-view" aria-label={`Hội thoại với ${conversation.name}`}>
    <header className="conversation-header"><button type="button" className="app-icon-button chat-mobile-back" aria-label="Quay lại danh sách hội thoại" onClick={onBack}><FiArrowLeft /></button><ChatAvatar key={conversation.avatar} name={conversation.name} avatar={conversation.avatar} group={conversation.type === 'group'} documents={conversation.isMyDocuments} /><div><h2>{conversation.name}</h2><p>{conversation.isMyDocuments ? 'Lưu tin nhắn và tệp cho chính bạn' : conversation.type === 'group' ? `${conversation.members ?? '—'} thành viên` : 'Hội thoại cá nhân'}</p></div></header>
    {error && <p role="alert" className="chat-error">{error}</p>}
    {(readError || data?.unreadError || data?.storageError) && <p role="status" className="chat-error">{readError || data?.unreadError || data?.storageError}</p>}
    {notice && <p className="chat-workspace-notice" role="status">{notice}<button type="button" onClick={() => setNotice('')} aria-label="Đóng thông báo">×</button></p>}
    <div className="conversation-messages" ref={scrollRef} onScroll={() => { const node = scrollRef.current; if (node) atBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 80 }}>
      <div className="chat-history-info"><span>Lịch sử được đồng bộ theo dữ liệu Zalo cung cấp.</span>{data?.hasMore && <button type="button" disabled={requestingHistory || data.historyLoading || data.connection !== 'connected'} onClick={() => void older()}>{data.historyLoading || requestingHistory ? 'Đang tải tin cũ…' : data.historyError ? 'Thử tải lại lịch sử' : 'Tải thêm tin cũ'}</button>}</div>
      {(historyError || data?.historyError) && <p role="status" className="chat-error">{historyError || data?.historyError}</p>}
      {!data ? <div className="chat-empty"><p>{error ? 'Chưa tải được tin nhắn.' : 'Đang tải tin nhắn…'}</p></div> : data.messages.length === 0 ? <div className="chat-empty"><FiMessageSquare /><h3>{data.historyLoading ? 'Đang tải lịch sử tin nhắn' : data.historyError ? 'Chưa tải được tin đã lưu' : 'Chưa có tin nhắn được tải'}</h3><p>{conversation.isMyDocuments ? data.historyError ? 'Tool chưa đọc được lịch sử My Documents. Bạn có thể kiểm tra nội dung đã lưu trong ứng dụng Zalo.' : 'Tin nhắn và tệp đã lưu được tải từ My Documents trên Zalo.' : 'Bạn có thể bắt đầu trò chuyện hoặc tải thêm tin cũ.'}</p></div> :
        <ol className="chat-message-list" aria-label="Tin nhắn">{data.messages.map((message) => <MessageRow key={message.id} accountId={accountId} message={message} conversation={conversation} localPreview={sentImages.previews[message.id]} disabled={data.connection !== 'connected' || Boolean(error)}
          onLoad={() => { if (atBottom.current && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight }}
          onReply={() => { setReply(message); scrollRef.current?.parentElement?.querySelector('textarea')?.focus() }}
          onForward={() => setAction({ kind: 'forward', message })}
          onReaction={async (reaction) => { await chatApi.action(accountId, conversation.type, conversation.id, { requestId: crypto.randomUUID(), messageId: message.id, kind: 'react', reaction }); refresh() }}
          onContact={async (kind, index) => { if (kind === 'add-friend') { setAction({ kind, message, index }); return } const result = await chatApi.action(accountId, conversation.type, conversation.id, { requestId: crypto.randomUUID(), messageId: message.id, kind, attachmentIndex: index }); if (result.conversation) onChoose(result.conversation) }}
        />)}</ol>}
    </div>
    <MessageComposer disabled={!data || data.connection !== 'connected' || Boolean(error)} name={conversation.name} reply={reply ? { senderName: reply.senderName || 'Bạn', text: reply.text || reply.attachments[0]?.name || 'Tin nhắn' } : undefined} onCancelReply={() => setReply(undefined)} onSend={async (input) => { const result = await chatApi.send(accountId, conversation.type, conversation.id, { ...input, replyTo: reply?.id }); sentImages.remember(result.attachmentIds ?? [], input.attachment); setReply(undefined); atBottom.current = true; refresh() }} />
    {action && <MessageActionDialog accountId={accountId} action={action} onClose={() => setAction(undefined)} onDone={() => { setNotice(action.kind === 'forward' ? 'Đã chuyển tiếp tin nhắn.' : 'Đã gửi lời mời kết bạn.'); refresh() }} />}
  </section>
}
