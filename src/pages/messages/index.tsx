import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { FiMessageCircle, FiPlus, FiRefreshCw, FiSearch, FiUsers, FiWifi, FiWifiOff } from 'react-icons/fi'
import { useForm } from 'react-hook-form'
import { Dropdown, Input, Modal } from '../../components/common'
import { InputValidation } from '../../components/validation'
import { useAccounts } from '../accounts/hooks/useAccounts'
import type { Conversation, ConversationList as ConversationListResult, ConversationType } from '../../../shared/messages'
import { routePaths } from '../../routes/paths'
import { chatApi } from './api'
import ChatAvatar from './components/ChatAvatar'
import ConversationView from './components/ConversationView'
import PhoneSyncButton from './components/PhoneSyncButton'
import './messages.css'

function FindUserModal({ accountId, onClose, onChoose }: { accountId: string; onClose: () => void; onChoose: (conversation: Conversation) => void }) {
  const { control, handleSubmit, formState: { isSubmitting } } = useForm<{ phone: string }>({ defaultValues: { phone: '' } })
  const [error, setError] = useState('')
  return <Modal title="Tìm người dùng Zalo" onClose={onClose} closeDisabled={isSubmitting}><form className="chat-find-form" onSubmit={handleSubmit(async ({ phone }) => {
    setError('')
    try { onChoose(await chatApi.findUser(accountId, phone.trim())); onClose() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Không tìm thấy người dùng.') }
  })}>
    <InputValidation control={control} name="phone" label="Số điện thoại Zalo" placeholder="Nhập số điện thoại" inputMode="tel" autoComplete="off" rules={{ required: 'Vui lòng nhập số điện thoại.', validate: (value) => /^\+?\d{8,15}$/.test(value.replace(/[\s.-]/g, '')) || 'Số điện thoại không hợp lệ.' }} />
    {error && <p role="alert" className="chat-error">{error}</p>}
    <button type="submit" className="chat-send" disabled={isSubmitting}>{isSubmitting ? 'Đang tìm…' : 'Tìm và mở hội thoại'}</button>
  </form></Modal>
}

function ChatWorkspace({ accountId, accountName, accountPicker, initialTargetId = '', initialTargetName = '' }: { accountId: string; accountName: string; accountPicker: ReactNode; initialTargetId?: string; initialTargetName?: string }) {
  const [type, setType] = useState<ConversationType>('personal')
  const [selected, setSelected] = useState<Conversation | null>(null)
  const [query, setQuery] = useState('')
  const [findOpen, setFindOpen] = useState(false)
  const [openError, setOpenError] = useState('')
  useEffect(() => {
    if (!initialTargetId) return
    let active = true
    void chatApi.openThread(accountId, initialTargetId, initialTargetName).then((conversation) => { if (active) setSelected(conversation) }).catch((cause) => { if (active) setOpenError(cause instanceof Error ? cause.message : 'Không mở được hội thoại.') })
    return () => { active = false }
  }, [accountId, initialTargetId, initialTargetName])
  return <div className="messages-workspace" data-conversation-open={Boolean(selected)}>
    <aside className="conversation-sidebar" aria-label="Danh sách hội thoại">
      <div className="conversation-sidebar__heading"><div><span className="page-eyebrow">Không gian làm việc</span><h1>Tin nhắn</h1></div><button type="button" className="app-icon-button" aria-label="Tìm người dùng Zalo" title="Tìm người dùng Zalo" onClick={() => setFindOpen(true)}><FiPlus /></button></div>
      <div className="chat-account-picker">{accountPicker}<PhoneSyncButton accountId={accountId} accountName={accountName} /></div>
      <div className="chat-search"><FiSearch aria-hidden="true" /><Input aria-label="Tìm cuộc trò chuyện" type="search" placeholder="Tìm cuộc trò chuyện…" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
      <div className="chat-tabs" role="tablist" aria-label="Loại cuộc trò chuyện">{(['personal', 'group'] as const).map((value) => <button type="button" role="tab" id={`chat-tab-${value}`} aria-controls="chat-conversations" aria-selected={type === value} key={value} onClick={() => { setType(value); setSelected(null); setQuery('') }} onKeyDown={(event) => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); const next = type === 'personal' ? 'group' : 'personal'; setType(next); setSelected(null); setQuery(''); document.getElementById(`chat-tab-${next}`)?.focus() } }} tabIndex={type === value ? 0 : -1}>{value === 'personal' ? <FiMessageCircle /> : <FiUsers />}{value === 'personal' ? 'Cá nhân' : 'Nhóm'}</button>)}</div>
      <ConversationList key={type} {...{ accountId, type, query, selected }} onChoose={setSelected} />
    </aside>
    {selected ? <ConversationView key={`${selected.type}:${selected.id}`} accountId={accountId} conversation={selected} onBack={() => setSelected(null)} onChoose={(conversation) => { setType(conversation.type); setQuery(''); setSelected(conversation) }} /> : <ChatWelcome>{openError || undefined}</ChatWelcome>}
    {findOpen && <FindUserModal accountId={accountId} onClose={() => setFindOpen(false)} onChoose={(conversation) => { setType('personal'); setQuery(''); setSelected(conversation) }} />}
  </div>
}

function ConversationList({ accountId, type, query, selected, onChoose }: { accountId: string; type: ConversationType; query: string; selected: Conversation | null; onChoose: (conversation: Conversation) => void }) {
  const [debouncedQuery, setDebouncedQuery] = useState(query)
  const [data, setData] = useState<ConversationListResult | null>(null)
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  const generation = useRef(0)
  const loadedCount = data?.conversations.length ?? 0

  useEffect(() => {
    const timer = setTimeout(() => {
      const next = query.trim()
      if (next === debouncedQuery) return
      generation.current += 1
      setData(null); setError(''); setLoadingMore(false); setDebouncedQuery(next)
    }, 250)
    return () => clearTimeout(timer)
  }, [query, debouncedQuery])

  useEffect(() => {
    const controller = new AbortController(), current = ++generation.current
    void chatApi.conversations(accountId, type, controller.signal, { query: debouncedQuery, offset: 0, limit: 20 }).then((result) => {
      if (!controller.signal.aborted && generation.current === current) { setData(result); setError(''); setLoadingMore(false) }
    }).catch((cause) => {
      if (!controller.signal.aborted && generation.current === current) setError(cause instanceof Error ? cause.message : 'Không tải được danh sách.')
    })
    return () => controller.abort()
  }, [accountId, type, debouncedQuery, version])

  useEffect(() => {
    if (!loadedCount) return
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    const current = generation.current
    async function poll() {
      try {
        const result = await chatApi.conversations(accountId, type, controller.signal, { query: debouncedQuery, offset: 0, limit: Math.max(20, loadedCount) })
        if (!controller.signal.aborted && generation.current === current) setData(result)
      } catch { /* the main request surfaces connection errors */ }
      finally { if (!controller.signal.aborted && generation.current === current) timer = setTimeout(() => void poll(), 2_000) }
    }
    timer = setTimeout(() => void poll(), 2_000)
    return () => { controller.abort(); clearTimeout(timer) }
  }, [accountId, type, debouncedQuery, loadedCount, version])

  const refresh = useCallback(() => setVersion((value) => value + 1), [])
  async function loadMore() {
    if (!data?.hasMore || loadingMore) return
    const current = generation.current
    setLoadingMore(true)
    try {
      const next = await chatApi.conversations(accountId, type, undefined, { query: debouncedQuery, offset: data.conversations.length, limit: 20 })
      if (generation.current !== current) return
      setData((previous) => previous ? { ...next, conversations: [...previous.conversations, ...next.conversations.filter((item) => !previous.conversations.some((existing) => existing.id === item.id))] } : next)
    } catch (cause) {
      if (generation.current === current) setError(cause instanceof Error ? cause.message : 'Không tải thêm được danh sách.')
    } finally { if (generation.current === current) setLoadingMore(false) }
  }

  function choose(item: Conversation) {
    const through = item.unreadThrough ?? 0
    setData((previous) => previous ? { ...previous, conversations: previous.conversations.map((conversation) => conversation.id === item.id ? { ...conversation, unreadCount: 0 } : conversation) } : previous)
    onChoose({ ...item, unreadCount: 0 })
    if (!item.unreadCount || !through) return
    void chatApi.markRead(accountId, item.type, item.id, through).then((unread) => {
      setData((previous) => previous ? { ...previous, conversations: previous.conversations.map((conversation) => conversation.id === item.id ? { ...conversation, unreadCount: unread.count, unreadThrough: unread.through } : conversation) } : previous)
    }).catch((cause) => {
      setError(cause instanceof Error ? cause.message : 'Chưa cập nhật được trạng thái đã đọc.')
      refresh()
    })
  }

  useEffect(() => {
    window.addEventListener('chat-unread-updated', refresh)
    return () => window.removeEventListener('chat-unread-updated', refresh)
  }, [refresh])
  const [reconnectError, setReconnectError] = useState('')
  const [reconnecting, setReconnecting] = useState(false)
  const visible = data?.conversations ?? []
  return <div className="conversation-list-panel" role="tabpanel" id="chat-conversations" aria-labelledby={`chat-tab-${type}`}>
    <div className="chat-connection" data-connected={data?.connection === 'connected'}>{data?.connection === 'connected' ? <FiWifi /> : <FiWifiOff />}<span>{data?.connection === 'connected' ? 'Đang nhận tin nhắn' : data?.connection === 'disconnected' ? 'Mất kết nối Zalo' : 'Đang kết nối…'}</span>
      <button type="button" className="app-icon-button" aria-label="Làm mới kết nối và danh sách" title="Làm mới" disabled={reconnecting} onClick={async () => { setReconnecting(true); setReconnectError(''); try { await chatApi.reconnect(accountId); refresh() } catch (cause) { setReconnectError(cause instanceof Error ? cause.message : 'Không kết nối được.') } finally { setReconnecting(false) } }}><FiRefreshCw /></button></div>
    {(error || reconnectError) && <p className="chat-error" role="alert">{error || reconnectError}</p>}
    {data?.unreadError && <p className="chat-error" role="status">{data.unreadError}</p>}
    {data?.storageError && <p className="chat-error" role="status">{data.storageError}</p>}
    {data?.directoryError && <p className="chat-error" role="status">{data.directoryError}</p>}
    <div className="conversation-list" onScroll={(event) => { const node = event.currentTarget; if (node.scrollHeight - node.scrollTop - node.clientHeight < 120) void loadMore() }}>
      {visible.map((item) => <button type="button" className={`conversation-item${selected?.id === item.id && selected.type === item.type ? ' conversation-item--selected' : ''}${item.unreadCount ? ' conversation-item--unread' : ''}`} key={item.id} aria-pressed={selected?.id === item.id && selected.type === item.type} onClick={() => choose(item)}>
        <ChatAvatar key={item.avatar} name={item.name} avatar={item.avatar} group={item.type === 'group'} documents={item.isMyDocuments} /><span className="conversation-item__body"><span><strong>{item.name}</strong>{item.updatedAt > 0 && <time>{new Date(item.updatedAt).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}</time>}</span><small>{item.lastMessage || (item.isMyDocuments ? 'Lưu tin nhắn và tệp của bạn' : item.type === 'group' ? `${item.members ?? '—'} thành viên` : 'Bắt đầu trò chuyện')}</small></span>
        {Boolean(item.unreadCount) && <span className="chat-unread-badge" aria-label={`${item.unreadCount} tin chưa đọc`} title={`${item.unreadCount} tin chưa đọc trong tool`}>{item.unreadCount! > 99 ? '99+' : item.unreadCount}</span>}
      </button>)}
      {loadingMore && <p className="chat-list-loading">Đang tải thêm…</p>}
      {!visible.length && <div className="chat-list-empty"><FiMessageCircle /><p>{!data && !error ? 'Đang tải cuộc trò chuyện…' : error ? 'Chưa tải được danh sách.' : query ? 'Không tìm thấy cuộc trò chuyện.' : type === 'group' ? 'Chưa có nhóm nào.' : 'Chưa có hội thoại hoặc bạn bè.'}</p></div>}
    </div><footer className="chat-list-footer">{visible.length}{data?.total !== undefined ? ` / ${data.total}` : ''} {type === 'group' ? 'nhóm' : 'liên hệ / hội thoại'}</footer>
  </div>
}

function ChatWelcome({ children }: { children?: ReactNode }) {
  return <section className="chat-welcome"><div className="chat-welcome__icon"><FiMessageCircle /></div><span className="page-eyebrow">ZALO WORKSPACE</span><h2>Mọi cuộc trò chuyện,<br />trong một không gian.</h2><p>{children || 'Chọn một cuộc trò chuyện bên trái để xem tin nhắn và bắt đầu kết nối.'}</p><div className="chat-welcome__features"><span><FiMessageCircle /> Tin nhắn cá nhân</span><span><FiUsers /> Hội thoại nhóm</span></div></section>
}

export default function MessagesPage() {
  const { accounts, loading, error } = useAccounts()
  const [params] = useSearchParams()
  const [selectedId, setSelectedId] = useState('')
  const connected = accounts.filter((account) => account.status === 'connected')
  const targetAccount = params.get('account') ?? ''
  const targetThread = params.get('thread') ?? ''
  const account = connected.find((item) => item.id === selectedId) ?? connected.find((item) => item.id === targetAccount) ?? connected[0]
  const picker = <Dropdown<string> label="Tài khoản hiển thị hội thoại" aria-label="Chọn tài khoản Zalo" value={account?.id ?? ''} onChange={setSelectedId} placeholder={loading ? 'Đang tải tài khoản…' : 'Chọn tài khoản Zalo'} disabled={!connected.length || Boolean(error)} options={accounts.map((item) => ({ value: item.id, label: `${item.displayName} · ${item.id}`, disabled: item.status !== 'connected' }))} />
  const initialTargetId = account?.id === targetAccount && /^\d{1,30}$/.test(targetThread) ? targetThread : ''
  const initialTargetName = initialTargetId ? params.get('name')?.slice(0, 120) || `Zalo ${targetThread}` : ''
  if (account && !error) return <ChatWorkspace key={`${account.id}:${account.lastLoginAt}`} accountId={account.id} accountName={account.displayName} accountPicker={picker} {...{ initialTargetId, initialTargetName }} />
  return <div className="messages-workspace"><aside className="conversation-sidebar"><div className="conversation-sidebar__heading"><div><span className="page-eyebrow">Không gian làm việc</span><h1>Tin nhắn</h1></div></div><div className="chat-account-picker">{picker}</div><div className="chat-search"><FiSearch /><Input type="search" aria-label="Tìm cuộc trò chuyện" placeholder="Tìm cuộc trò chuyện…" disabled /></div><div className="chat-tabs"><button type="button" disabled>Cá nhân</button><button type="button" disabled>Nhóm</button></div><div className="chat-list-empty"><FiUsers /><p>{error || (loading ? 'Đang tải tài khoản…' : 'Kết nối tài khoản Zalo để xem cuộc trò chuyện.')}</p>{!loading && <Link to={routePaths.accounts} className="app-primary-link">Quản lý tài khoản</Link>}</div></aside><ChatWelcome>{loading ? 'Đang tải tài khoản của bạn…' : <>Thêm hoặc đăng nhập lại tài khoản Zalo để nhắn tin.<br /><Link to={routePaths.accounts}>Đi tới trang Tài khoản →</Link></>}</ChatWelcome></div>
}
