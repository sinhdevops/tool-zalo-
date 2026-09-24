import { createHash } from 'node:crypto'
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Reactions, ThreadType } from 'zalo-api-final'
import type { API, Message, SendMessageQuote } from 'zalo-api-final'
import type { ChatConnectionStatus, ChatMessage, Conversation, ConversationType, PhoneSyncState, SendChatInput, MessageAction } from '../../shared/messages.ts'
import { CHAT_REACTIONS, MAX_ATTACHMENT_BYTES, MAX_MESSAGE_LENGTH } from '../../shared/messages.ts'
import { ChatError } from './types.ts'
import type { MessagingConnection } from './types.ts'
import { normalizeMessage, safeMediaUrl } from './normalize.ts'
import { readDocumentsHistory } from './documents-history.ts'
import { UnreadStore } from './unread-store.ts'
import type { IncomingMessage, GroupMember } from '../../shared/automation.ts'
import type { EncryptedChatStore } from './chat-store.ts'
import { DatabaseSync } from 'node:sqlite'
import { PhoneSyncController } from './phone-sync.ts'
import { phones } from '../automation/parse.ts'

interface HistoryState { cursor?: string; loading: boolean; more: boolean; error?: string; timer?: ReturnType<typeof setTimeout> }
const threadType = (type: ConversationType) => type === 'group' ? ThreadType.Group : ThreadType.User
const keyOf = (type: ConversationType, id: string) => `${type}:${id}`

export class ZaloMessagingConnection implements MessagingConnection {
  private api: API
  private ownId: string
  private ownName: string
  private myDocumentsId?: string
  private documentsHistory = { cursor: undefined as string | undefined, loading: false, more: true, isOld: false, started: false, error: undefined as string | undefined }
  private state: ChatConnectionStatus = 'idle'
  private disposed = false
  private threads = new Map<string, Conversation>()
  private items = new Map<string, ChatMessage[]>()
  private originals = new Map<string, SendMessageQuote>()
  private actions = new Map<string, { fingerprint: string; result: Promise<{ conversation?: Conversation }> }>()
  private qrRequests = new Map<string, Promise<{ qrUrl?: string }>>()
  private avatars = new Map<string, string>()
  private profileRequests = new Set<string>()
  private loadedAt: Partial<Record<ConversationType, number>> = {}
  private directoryRequests = new Map<ConversationType, Promise<void>>()
  private histories: Record<ConversationType, HistoryState> = { personal: { loading: false, more: true }, group: { loading: false, more: true } }
  private sends = new Map<string, { fingerprint: string; result: Promise<string[]> }>()
  private sendBusy = false
  private readyTimer: ReturnType<typeof setTimeout> | undefined
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined
  private reconnectAttempts = 0
  private unreadStore: UnreadStore
  private ownsUnreadStore: boolean
  private unreadError?: string
  private storageError?: string
  private directoryError?: string
  private chatStore?: EncryptedChatStore
  private hydrated = new Set<string>()
  private incomingListeners = new Set<(event: IncomingMessage) => void>()
  private phoneSyncController: PhoneSyncController

  status() { return this.disposed ? 'disconnected' : this.state }
  subscribeIncoming(listener: (event: IncomingMessage) => void) {
    this.incomingListeners.add(listener)
    return () => { this.incomingListeners.delete(listener) }
  }
  async groupMembers(groupId: string): Promise<GroupMember[]> {
    const groups = await this.list('group')
    if (!groups.conversations.some((g) => g.id === groupId)) throw new ChatError('Nhóm không thuộc tài khoản đã chọn.')
    const group = (await this.api.getGroupInfo(groupId)).gridInfoMap[groupId]
    if (!group) throw new ChatError('Không đọc được thành viên nhóm.', 502)
    const ids = [...new Set([...(group.memVerList ?? []).map((item) => item.split('_')[0]!), ...(group.memberIds ?? []).filter((item): item is string => typeof item === 'string')])].filter((id) => /^\d{1,30}$/.test(id))
    const members = new Map<string, GroupMember>()
    for (let index = 0; index < ids.length; index += 50) {
      const profiles = await this.api.getUserInfo(ids.slice(index, index + 50))
      for (const profile of Object.values(profiles.changed_profiles)) members.set(profile.userId, { id: profile.userId, name: profile.displayName || profile.zaloName || profile.userId })
    }
    // Only use sender names for IDs actually in the current group membership.
    for (const id of ids) if (!members.has(id)) members.set(id, { id, name: this.items.get(keyOf('group', groupId))?.find((m) => m.senderId === id)?.senderName || `Zalo ${id}` })
    return [...members.values()]
  }
  private requireAutomationConnection(contactId?: string) {
    if (this.disposed || this.state !== 'connected') throw new ChatError('Kết nối Zalo chưa sẵn sàng.', 409)
    if (contactId && (!/^\d{1,30}$/.test(contactId) || contactId === this.ownId || contactId === this.myDocumentsId)) throw new ChatError('UID khách hàng không hợp lệ.')
  }
  async automationHeart(groupId: string, messageId: string, clientId: string) {
    this.requireAutomationConnection()
    if (!clientId) throw new ChatError('Tin nhắn thiếu mã để thả tim.')
    await this.api.addReaction(Reactions.HEART, { data: { msgId: messageId, cliMsgId: clientId }, threadId: groupId, type: ThreadType.Group })
    const message = this.items.get(keyOf('group', groupId))?.find((m) => m.id === messageId)
    if (message && !this.disposed) this.remember({ ...message, ownReaction: '❤️' })
  }
  async automationDeliver(targetGroupId: string, text: string, contacts: Array<{ phone: string; contactId?: string }>) {
    this.requireAutomationConnection()
    if (!/^\d{1,30}$/.test(targetGroupId) || !text.trim() || !contacts.length) throw new ChatError('Nhóm nhận hoặc dữ liệu gửi không hợp lệ.')
    await this.api.sendMessage(text, targetGroupId, ThreadType.Group)
    const results: Array<{ phone: string; card: boolean }> = []
    for (const delivery of contacts) {
      if (!/^0\d{9}$/.test(delivery.phone)) throw new ChatError('Số điện thoại gửi không hợp lệ.')
      let contactId = delivery.contactId
      if (!contactId) {
        try { contactId = (await this.api.findUser(delivery.phone)).uid } catch { contactId = undefined }
      }
      let card = false
      if (typeof contactId === 'string' && /^\d{1,30}$/.test(contactId) && contactId !== this.ownId && contactId !== this.myDocumentsId) {
        await this.api.sendCard({ userId: contactId, phoneNumber: delivery.phone }, targetGroupId, ThreadType.Group)
        card = true
      }
      results.push({ phone: delivery.phone, card })
    }
    return results
  }
  async automationFindUser(phone: string) {
    this.requireAutomationConnection()
    if (!/^0\d{9}$/.test(phone)) throw new ChatError('Số điện thoại không hợp lệ.')
    try {
      const user = await this.api.findUser(phone)
      if (!user.uid || !/^\d{1,30}$/.test(user.uid) || user.uid === this.ownId || user.uid === this.myDocumentsId) throw new Error('Not found')
      const name = user.display_name || user.zalo_name || `Zalo ${user.uid}`
      const avatar = user.avatar || ''
      const key = keyOf('personal', user.uid)
      if (!this.disposed) this.setThread(key, { id: user.uid, type: 'personal', name, avatar, lastMessage: this.threads.get(key)?.lastMessage || '', updatedAt: this.threads.get(key)?.updatedAt || 0 })
      return { id: user.uid, name, avatar }
    } catch (cause) {
      if (cause instanceof ChatError) throw cause
      throw new ChatError('Không tìm thấy người dùng hoặc Zalo không cho phép tìm bằng số này.', 404)
    }
  }
  async automationSendMessage(contactId: string, text: string) {
    this.requireAutomationConnection(contactId)
    if (typeof text !== 'string' || !text.trim() || text.length > MAX_MESSAGE_LENGTH) throw new ChatError('Nội dung tin nhắn không hợp lệ.')
    try {
      const response = await this.api.sendMessage({ msg: text }, contactId, ThreadType.User)
      if (!response.message && response.attachment.length === 0) throw new Error('No acknowledgement')
      if (!this.disposed && response.message) {
        const conversation = this.threads.get(keyOf('personal', contactId))
        this.remember({
          id: String(response.message.msgId), threadId: contactId, type: 'personal', senderId: this.ownId,
          senderName: this.ownName, self: true, text, timestamp: Date.now(), attachments: [],
        })
        if (conversation) this.setThread(keyOf('personal', contactId), { ...conversation, lastMessage: text, updatedAt: Date.now() })
      }
    } catch (cause) {
      if (cause instanceof ChatError) throw cause
      throw new ChatError('Zalo chưa xác nhận gửi tin nhắn cho số này.', 502)
    }
  }
  openPersonal(contactId: string, name: string) {
    this.requireAutomationConnection(contactId)
    const key = keyOf('personal', contactId)
    const current = this.threads.get(key)
    const conversation: Conversation = { id: contactId, type: 'personal', name: name.trim().slice(0, 120) || current?.name || `Zalo ${contactId}`, avatar: current?.avatar || '', lastMessage: current?.lastMessage || '', updatedAt: current?.updatedAt || 0 }
    this.setThread(key, { ...current, ...conversation })
    return conversation
  }

  constructor(api: API, ownId: string, ownName: string, ownAvatar = '', unreadStore?: UnreadStore, chatStore?: EncryptedChatStore) {
    this.api = api; this.ownId = ownId; this.ownName = ownName
    this.chatStore = chatStore
    this.unreadStore = unreadStore ?? new UnreadStore()
    this.ownsUnreadStore = !unreadStore
    this.phoneSyncController = new PhoneSyncController(api, ownId, (files) => this.importPhoneBackup(files))
    this.avatars.set(ownId, ownAvatar)
    try { for (const conversation of chatStore?.conversations(ownId) ?? []) this.threads.set(keyOf(conversation.type, conversation.id), conversation) }
    catch { this.storageError = 'Không đọc được dữ liệu trò chuyện đã lưu.' }
    const documentsId: unknown = api.getContext().loginInfo?.send2me_id
    if (typeof documentsId === 'string' && /^\d{1,30}$/.test(documentsId)) {
      this.myDocumentsId = documentsId
      this.setThread(keyOf('personal', documentsId), { id: documentsId, type: 'personal', name: 'My Documents', avatar: '', lastMessage: '', updatedAt: 0, isMyDocuments: true })
    }
    api.listener.on('cipher_key', () => {
      if (this.disposed) return
      clearTimeout(this.readyTimer)
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = undefined
      this.reconnectAttempts = 0
      this.state = 'connected'
      this.history('personal'); this.history('group')
    })
    api.listener.on('message', (message) => { if (!this.disposed) this.acceptMessage(message, true) })
    api.listener.on('old_messages', (messages, type) => this.acceptHistory(messages, type === ThreadType.Group ? 'group' : 'personal'))
    api.listener.on('disconnected', () => this.onDisconnected())
    // Listener emits error for malformed packets too; only a socket close changes connectivity.
    api.listener.on('error', () => undefined)
    api.listener.on('reaction', (event) => {
      if (this.disposed || !event.isSelf) return
      const type = event.isGroup ? 'group' : 'personal'
      const icons = [Reactions.LIKE, Reactions.HEART, Reactions.HAHA, Reactions.WOW, Reactions.CRY, Reactions.ANGRY]
      for (const target of event.data.content.rMsg) {
        const message = this.items.get(keyOf(type, event.threadId))?.find((item) => item.id === String(target.gMsgID))
        if (message) this.remember({ ...message, ownReaction: CHAT_REACTIONS[icons.indexOf(event.data.content.rIcon)] })
      }
    })
    api.listener.on('undo', (event) => {
      const type = event.isGroup ? 'group' : 'personal'
      const existing = this.items.get(keyOf(type, event.threadId))?.find((message) => message.id === String(event.data.content.globalMsgId))
      if (!this.disposed) {
        try { this.unreadStore.remove(this.ownId, type, event.threadId, String(event.data.content.globalMsgId)) }
        catch { this.unreadError = 'Không lưu được trạng thái chưa đọc. Kiểm tra quyền ghi thư mục dữ liệu.' }
      }
      if (existing && !this.disposed) {
        this.originals.delete(`${keyOf(type, event.threadId)}:${existing.id}`)
        this.remember({ ...existing, text: 'Tin nhắn đã được thu hồi', attachments: [], canReply: false, canReact: false, quote: undefined, ownReaction: undefined })
      }
    })
  }

  private setThread(key: string, conversation: Conversation) {
    this.threads.set(key, conversation)
    try { this.chatStore?.saveConversation(this.ownId, conversation); this.storageError = undefined }
    catch { this.storageError = 'Không lưu được danh sách trò chuyện. Kiểm tra thư mục .data.' }
  }

  private hydrate(type: ConversationType, id: string) {
    const key = keyOf(type, id)
    if (this.hydrated.has(key)) return
    this.hydrated.add(key)
    try {
      const stored = this.chatStore?.messages(this.ownId, type, id) ?? []
      if (stored.length) this.items.set(key, stored)
      this.storageError = undefined
    } catch { this.storageError = 'Không đọc được tin nhắn đã lưu.' }
  }

  private acceptMessage(message: Message, live = false) {
    const normalized = normalizeMessage(message)
    if (!normalized.self && !normalized.system && !(normalized.type === 'personal' && normalized.threadId === this.myDocumentsId)) {
      try { this.unreadStore.observe(this.ownId, normalized.type, normalized.threadId, normalized.id, live) }
      catch { this.unreadError = 'Không lưu được trạng thái chưa đọc. Kiểm tra quyền ghi thư mục dữ liệu.' }
    }
    const { content, msgType, propertyExt, uidFrom, msgId, cliMsgId, ts, ttl } = message.data
    if (!normalized.system) this.originals.set(`${keyOf(normalized.type, normalized.threadId)}:${normalized.id}`, { content, msgType, propertyExt, uidFrom, msgId, cliMsgId, ts, ttl })
    this.remember(normalized)
    if (live) for (const listener of this.incomingListeners) listener({ message: normalized, clientId: String(message.data.cliMsgId ?? '') })
  }

  private onDisconnected() {
    clearTimeout(this.readyTimer)
    this.state = 'disconnected'
    for (const history of Object.values(this.histories)) {
      clearTimeout(history.timer)
      if (history.loading) history.error = 'Kết nối bị ngắt khi tải lịch sử. Hãy kết nối lại.'
      history.loading = false
    }
    this.scheduleReconnect()
  }
  private scheduleReconnect() {
    if (this.disposed || this.reconnectTimer) return
    const delay = Math.min(30_000, 2000 * 2 ** Math.min(this.reconnectAttempts++, 4))
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined
      try { this.reconnect() } catch { this.scheduleReconnect() }
    }, delay)
    this.reconnectTimer.unref()
  }
  reconnect() {
    if (this.disposed) throw new ChatError('Phiên tài khoản đã đóng.', 409)
    if (this.state === 'connecting' || this.state === 'connected') return
    clearTimeout(this.reconnectTimer)
    this.reconnectTimer = undefined
    this.state = 'connecting'
    // SDK retries can outlive account removal; use an explicit reconnect instead.
    try {
      this.api.listener.start({ retryOnClose: false })
      this.readyTimer = setTimeout(() => {
        if (this.state !== 'connecting' || this.disposed) return
        try { this.api.listener.stop() } finally { this.onDisconnected() }
      }, 20_000)
      this.readyTimer.unref()
    }
    catch { this.onDisconnected(); throw new ChatError('Không mở được kết nối Zalo.', 503) }
  }
  phoneSync(): PhoneSyncState { return this.phoneSyncController.status() }
  requestPhoneSync(): Promise<PhoneSyncState> {
    if (this.disposed || this.state !== 'connected') throw new ChatError('Kết nối Zalo chưa sẵn sàng. Hãy làm mới kết nối rồi thử lại.', 409)
    if (this.phoneSync().status === 'error' && this.phoneSync().reason.includes('không có cổng')) throw new ChatError(this.phoneSync().reason, 501)
    return this.phoneSyncController.request()
  }

  private async importPhoneBackup(files: string[]) {
    if (!this.chatStore) throw new Error('Kho trò chuyện mã hóa chưa sẵn sàng.')
    const aliases = {
      id: ['msgid', 'msg_id', 'globalmsgid', 'global_msg_id', 'id'],
      thread: ['threadid', 'thread_id', 'conversationid', 'conversation_id', 'convid', 'conv_id'],
      sender: ['senderid', 'sender_id', 'uidfrom', 'uid_from', 'uid'],
      content: ['content', 'message', 'msg', 'text'],
      time: ['ts', 'timestamp', 'createdat', 'created_at', 'sendtime', 'send_time'],
      mine: ['ismine', 'is_mine', 'isself', 'is_self'],
      group: ['isgroup', 'is_group'],
      name: ['dname', 'sendername', 'sender_name', 'displayname', 'display_name'],
    }
    const pick = (columns: string[], values: string[]) => columns.find((column) => values.includes(column.toLowerCase()))
    const quote = (value: string) => `"${value.replaceAll('"', '""')}"`
    let messages = 0
    const conversations = new Set<string>()
    for (const file of files.filter((item) => item.toLowerCase().endsWith('.db'))) {
      let db: DatabaseSync | undefined
      try {
        db = new DatabaseSync(file, { readOnly: true })
        const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map((row) => String(row.name))
        for (const table of tables) {
          const columns = db.prepare(`PRAGMA table_info(${quote(table)})`).all().map((row) => String(row.name))
          const id = pick(columns, aliases.id), sender = pick(columns, aliases.sender), content = pick(columns, aliases.content), time = pick(columns, aliases.time)
          if (!id || !sender || !content || !time) continue
          const threadColumn = pick(columns, aliases.thread), mineColumn = pick(columns, aliases.mine), groupColumn = pick(columns, aliases.group), nameColumn = pick(columns, aliases.name)
          const pathId = path.basename(file, '.db').match(/^\d{1,30}$/)?.[0]
          if (!threadColumn && !pathId) continue
          const selected = [id, sender, content, time, threadColumn, mineColumn, groupColumn, nameColumn].filter((value): value is string => Boolean(value))
          const rows = db.prepare(`SELECT ${selected.map(quote).join(',')} FROM ${quote(table)} ORDER BY ${quote(time)} DESC LIMIT 50000`).all()
          for (const row of rows.reverse()) {
            const threadId = String(threadColumn ? row[threadColumn] ?? '' : pathId)
            const messageId = String(row[id] ?? '')
            const senderId = String(row[sender] ?? '')
            const rawTime = Number(row[time])
            if (!/^\d{1,30}$/.test(threadId) || !messageId || !senderId || !Number.isFinite(rawTime)) continue
            let body = row[content]
            if (body instanceof Uint8Array) continue
            if (typeof body !== 'string') body = String(body ?? '')
            let messageText = body as string
            try { const parsed = JSON.parse(messageText) as Record<string, unknown>; messageText = typeof parsed.content === 'string' ? parsed.content : typeof parsed.text === 'string' ? parsed.text : messageText } catch { /* plain text */ }
            const type: ConversationType = groupColumn && Number(row[groupColumn]) ? 'group' : this.threads.has(keyOf('group', threadId)) ? 'group' : 'personal'
            const self = mineColumn ? Boolean(Number(row[mineColumn])) : senderId === this.ownId
            const timestamp = rawTime < 10_000_000_000 ? rawTime * 1000 : rawTime
            const message: ChatMessage = { id: messageId, threadId, type, senderId, senderName: nameColumn ? String(row[nameColumn] ?? '') : '', self, text: messageText, timestamp, attachments: [], canReply: false, canReact: false }
            this.chatStore.saveMessage(this.ownId, message)
            this.remember(message)
            messages++; conversations.add(`${type}:${threadId}`)
          }
        }
      } catch { /* unrelated or unsupported database */ }
      finally { db?.close() }
    }
    if (!messages) throw new Error('Đã giải mã backup nhưng chưa nhận diện được bảng tin nhắn. Công cụ đã giữ bản mã hóa để có thể bổ sung bộ đọc mà không cần đồng bộ lại.')
    return { messages, conversations: conversations.size }
  }
  private remember(message: ChatMessage) {
    const key = keyOf(message.type, message.threadId)
    this.hydrate(message.type, message.threadId)
    const messages = this.items.get(key) ?? []
    const index = messages.findIndex((item) => item.id === message.id)
    if (index >= 0) messages[index] = { ...messages[index], ...message }
    else messages.push(message)
    messages.sort((a, b) => {
      const time = a.timestamp - b.timestamp
      if (time) return time
      if (/^\d+$/.test(a.id) && /^\d+$/.test(b.id)) return BigInt(a.id) < BigInt(b.id) ? -1 : BigInt(a.id) > BigInt(b.id) ? 1 : 0
      return a.id.localeCompare(b.id)
    })
    for (const removed of messages.slice(0, Math.max(0, messages.length - 1000))) this.originals.delete(`${key}:${removed.id}`)
    this.items.set(key, messages.slice(-1000))
    try { this.chatStore?.saveMessage(this.ownId, message); this.storageError = undefined }
    catch { this.storageError = 'Không lưu được tin nhắn. Kiểm tra thư mục .data.' }
    const current = this.threads.get(key)
    const last = messages.at(-1)
    const fallbackName = `${message.type === 'group' ? 'Nhóm' : 'Zalo'} ${message.threadId}`
    const knownName = current?.name && current.name !== fallbackName ? current.name : ''
    const senderName = !message.self && message.type === 'personal' && message.senderId === message.threadId ? message.senderName : ''
    this.setThread(key, {
      id: message.threadId, type: message.type,
      ...(current?.isMyDocuments ? { isMyDocuments: true } : {}),
      name: knownName || senderName || fallbackName,
      avatar: current?.avatar || (message.type === 'personal' ? this.avatars.get(message.threadId) : '') || '', members: current?.members,
      lastMessage: last ? `${last.self ? 'Bạn: ' : ''}${last.text || last.attachments[0]?.name || 'Tin nhắn'}` : '',
      updatedAt: last?.timestamp ?? 0,
    })
  }
  private directory(type: ConversationType): Promise<void> {
    if (Date.now() - (this.loadedAt[type] ?? 0) < 60_000) return Promise.resolve()
    const pending = this.directoryRequests.get(type)
    if (pending) return pending
    const load = async () => {
      let entries: Array<Pick<Conversation, 'id' | 'name' | 'avatar' | 'members'>>
      if (type === 'personal') entries = (await this.api.getAllFriends()).map((user) => ({ id: user.userId, name: user.displayName || user.zaloName, avatar: user.avatar }))
      else {
        const ids = Object.keys((await this.api.getAllGroups()).gridVerMap)
        entries = []
        for (let index = 0; index < ids.length; index += 50) {
          const response = await this.api.getGroupInfo(ids.slice(index, index + 50))
          entries.push(...Object.values(response.gridInfoMap).map((group) => ({ id: group.groupId, name: group.name, avatar: group.fullAvt || group.avt, members: group.totalMember })))
        }
      }
      if (this.disposed) return
      for (const entry of entries) {
        if (type === 'personal' && entry.id === this.myDocumentsId) continue
        if (type === 'personal') this.avatars.set(entry.id, entry.avatar)
        const key = keyOf(type, entry.id)
        this.setThread(key, { type, lastMessage: '', updatedAt: 0, ...this.threads.get(key), ...entry })
      }
      this.loadedAt[type] = Date.now()
    }
    const request = load().finally(() => this.directoryRequests.delete(type))
    this.directoryRequests.set(type, request)
    return request
  }
  async list(type: ConversationType) {
    if (this.state === 'idle') this.reconnect()
    try { await this.directory(type); this.directoryError = undefined }
    catch {
      if (![...this.threads.values()].some((item) => item.type === type)) throw new ChatError('Không tải được danh sách từ Zalo. Hãy thử lại.', 502)
      this.directoryError = 'Zalo tạm thời chưa trả danh sách mới. Đang hiển thị dữ liệu đã lưu.'
    }
    const counts = this.unreadStore.list(this.ownId, type)
    for (const id of counts.keys()) {
      const key = keyOf(type, id)
      if (!this.threads.has(key)) this.setThread(key, { id, type, name: `${type === 'group' ? 'Nhóm' : 'Zalo'} ${id}`, avatar: '', lastMessage: '', updatedAt: 0 })
    }
    return { connection: this.state, unreadError: this.unreadError, storageError: this.storageError, directoryError: this.directoryError, conversations: [...this.threads.values()].filter((item) => item.type === type).map((item) => {
      const unread = counts.get(item.id)
      return { ...item, unreadCount: unread?.count ?? 0, ...(unread ? { unreadThrough: unread.through } : {}) }
    }).sort((a, b) => Number(Boolean(b.isMyDocuments)) - Number(Boolean(a.isMyDocuments)) || b.updatedAt - a.updatedAt || a.name.localeCompare(b.name, 'vi')) }
  }
  messages(type: ConversationType, id: string) {
    this.hydrate(type, id)
    const documents = type === 'personal' && id === this.myDocumentsId
    if (documents && !this.documentsHistory.started && this.state === 'connected') this.loadDocuments()
    const history = documents ? this.documentsHistory : this.histories[type]
    const messages = this.items.get(keyOf(type, id)) ?? []
    const missing = [...new Set([...(type === 'personal' ? [id] : []), ...messages.slice(-100).map((message) => message.senderId)])].filter((sender) => sender !== this.myDocumentsId && /^\d{1,30}$/.test(sender) && !this.avatars.has(sender) && !this.profileRequests.has(sender)).slice(0, 50)
    if (!this.disposed && missing.length && this.profileRequests.size < 2000 && this.api.getUserInfo) {
      missing.forEach((sender) => this.profileRequests.add(sender))
      void this.api.getUserInfo(missing).then((result) => {
        if (!this.disposed) for (const profile of Object.values(result.changed_profiles)) {
          const avatar = safeMediaUrl(profile.avatar) || ''
          this.avatars.set(profile.userId, avatar)
          const key = keyOf('personal', profile.userId)
          const current = this.threads.get(key)
          if (current && !current.isMyDocuments) this.setThread(key, { ...current, name: profile.displayName || profile.zaloName || current.name, avatar: avatar || current.avatar })
        }
      }).catch(() => undefined)
    }
    const conversation = this.threads.get(keyOf(type, id))
    return { messages: messages.map((message) => ({ ...message, senderAvatar: this.avatars.get(message.senderId) })), conversation: conversation ? { ...conversation, avatar: conversation.avatar || (type === 'personal' ? this.avatars.get(id) : '') || '' } : undefined, unread: this.disposed ? { count: 0, through: 0 } : { ...this.unreadStore.state(this.ownId, type, id), through: this.unreadStore.readableThrough(this.ownId, type, id, messages.map((message) => message.id)) }, unreadError: this.unreadError, storageError: this.storageError, connection: this.state, historyLoading: history.loading, hasMore: history.more, historyError: history.error }
  }
  markRead(type: ConversationType, id: string, through: number) {
    if (this.disposed) throw new ChatError('Phiên tài khoản đã đóng.', 409)
    if (!Number.isSafeInteger(through) || through < 0 || !this.threads.has(keyOf(type, id))) throw new ChatError('Mốc đọc tin nhắn không hợp lệ.')
    return this.unreadStore.markRead(this.ownId, type, id, through)
  }
  private loadDocuments() {
    const history = this.documentsHistory
    if (this.disposed || history.loading || !history.more || this.state !== 'connected') return
    history.started = true; history.loading = true; history.error = undefined
    void readDocumentsHistory(this.api, { cursor: history.cursor, isOld: history.isOld }).then((page) => {
      if (this.disposed) return
      if (page.more && (!page.cursor || page.cursor === history.cursor)) throw new ChatError('Lịch sử My Documents chưa tiến tới trang tiếp theo. Hãy thử lại.', 502)
      for (const message of page.messages) this.acceptMessage(message)
      history.cursor = page.cursor; history.isOld = page.isOld; history.more = page.more
    }).catch((cause: unknown) => {
      if (!this.disposed) history.error = cause instanceof ChatError ? cause.message : 'Không tải được lịch sử My Documents từ Zalo. Hãy thử tải lại.'
    }).finally(() => { history.loading = false })
  }
  history(type: ConversationType, id?: string) {
    if (type === 'personal' && id === this.myDocumentsId && this.myDocumentsId) { this.loadDocuments(); return }
    const history = this.histories[type]
    if (this.state !== 'connected' || history.loading || !history.more) return
    history.loading = true; history.error = undefined
    history.timer = setTimeout(() => { history.loading = false; history.error = 'Zalo chưa trả lịch sử. Bạn có thể thử tải lại.' }, 15_000)
    history.timer.unref()
    try { this.api.listener.requestOldMessages(threadType(type), history.cursor ?? null) }
    catch { clearTimeout(history.timer); history.loading = false; history.error = 'Không yêu cầu được lịch sử từ Zalo.' }
  }
  private acceptHistory(messages: Message[], type: ConversationType) {
    if (this.disposed) return
    const history = this.histories[type]
    clearTimeout(history.timer); history.loading = false; history.error = undefined
    for (const message of messages) this.acceptMessage(message)
    const ids = messages.map((message) => String(message.data.msgId)).filter((id) => /^\d+$/.test(id))
    ids.sort((a, b) => BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0)
    const cursor = ids[0]
    history.more = Boolean(cursor && cursor !== history.cursor)
    if (cursor) history.cursor = cursor
  }
  async findUser(phone: string): Promise<Conversation> {
    if (!/^\+?\d{8,15}$/.test(phone)) throw new ChatError('Nhập số điện thoại hợp lệ.')
    try {
      const user = await this.api.findUser(phone)
      if (!user.uid) throw new Error('Not found')
      const key = keyOf('personal', user.uid)
      const conversation: Conversation = { type: 'personal', id: user.uid, lastMessage: '', updatedAt: 0, ...this.threads.get(key), name: user.display_name || user.zalo_name, avatar: user.avatar }
      if (!this.disposed) this.setThread(key, conversation)
      return conversation
    } catch { throw new ChatError('Không tìm thấy người dùng hoặc Zalo không cho phép tìm bằng số này.', 404) }
  }
  send(type: ConversationType, id: string, input: SendChatInput): Promise<string[]> {
    if (this.disposed || this.state !== 'connected') throw new ChatError('Kết nối Zalo chưa sẵn sàng. Hãy kết nối lại trước khi gửi.', 409)
    if (!this.threads.has(keyOf(type, id))) throw new ChatError('Hãy chọn một cuộc trò chuyện hợp lệ.', 404)
    if (!/^[a-f0-9-]{36}$/i.test(input.requestId) || typeof input.text !== 'string' || input.text.length > MAX_MESSAGE_LENGTH || (!input.text.trim() && !input.attachment)) throw new ChatError('Nội dung tin nhắn không hợp lệ.')
    const fingerprint = createHash('sha256').update(JSON.stringify({ type, id, input })).digest('hex')
    const previous = this.sends.get(input.requestId)
    if (previous) {
      if (previous.fingerprint !== fingerprint) throw new ChatError('Mã gửi đã được sử dụng cho nội dung khác.', 409)
      return previous.result
    }
    const quote = input.replyTo ? this.originals.get(`${keyOf(type, id)}:${input.replyTo}`) : undefined
    if (input.replyTo !== undefined && (typeof input.replyTo !== 'string' || !quote)) throw new ChatError('Tin nhắn được trả lời không còn trong hội thoại.', 404)
    if (this.sendBusy) throw new ChatError('Đang gửi tin trước. Vui lòng đợi.', 409)
    if (this.sends.size >= 2000) throw new ChatError('Đã đạt giới hạn lượt gửi trong phiên. Hãy kết nối lại tài khoản.', 429)
    const attachment = input.attachment
    let source: { data: Buffer; name: string } | undefined
    if (attachment) {
      if (typeof attachment.name !== 'string' || typeof attachment.base64 !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(attachment.base64)) throw new ChatError('Tệp đính kèm không hợp lệ.')
      const data = Buffer.from(attachment.base64, 'base64')
      if (!data.length || data.length > MAX_ATTACHMENT_BYTES) throw new ChatError('Tệp phải có dung lượng từ 1 byte đến 10 MB.', 413)
      const name = [...attachment.name].map((character) => character.charCodeAt(0) < 32 || /[\\/:*?"<>|]/.test(character) ? '_' : character).join('').slice(-180)
      if (!name.includes('.') || name.endsWith('.')) throw new ChatError('Tên tệp phải có phần mở rộng.')
      source = { data, name }
    }
    this.sendBusy = true
    const result = (async () => {
      let directory: string | undefined
      let file: string | undefined
      try {
        if (source) {
          directory = await mkdtemp(path.join(tmpdir(), 'zalo-upload-'))
          file = path.join(directory, source.name)
          await writeFile(file, source.data, { mode: 0o600 })
        }
        // A local temporary file lets the SDK calculate correct image dimensions.
        const response = await this.api.sendMessage({ msg: input.text, attachments: file, quote }, id, threadType(type))
        if (!response.message && response.attachment.length === 0) throw new Error('No acknowledgement')
        if (this.disposed) return []
        let sentCard: { msgId: number; contactId: string; name: string; avatar: string; phone: string } | undefined
        const matchedPhones = phones(input.text)
        const compactText = input.text.trim().replace(/[ .-]/g, '').replace(/^\+?84/, '0')
        if (!source && !quote && matchedPhones.length === 1 && compactText === matchedPhones[0]) {
          try {
            const user = await this.api.findUser(matchedPhones[0]!)
            if (user.uid && /^\d{1,30}$/.test(user.uid) && user.uid !== this.ownId && user.uid !== this.myDocumentsId) {
              const card = await this.api.sendCard({ userId: user.uid, phoneNumber: matchedPhones[0] }, id, threadType(type))
              sentCard = { msgId: card.msgId, contactId: user.uid, name: user.display_name || user.zalo_name || `Zalo ${user.uid}`, avatar: user.avatar || '', phone: matchedPhones[0]! }
            }
          } catch { /* The number was sent successfully; a number without a searchable Zalo account has no card. */ }
        }
        const quoted = this.items.get(keyOf(type, id))?.find((message) => message.id === input.replyTo)
        const base = { threadId: id, type, senderId: this.ownId, senderName: this.ownName, self: true, timestamp: Date.now(), ...(quoted ? { quote: { senderName: quoted.senderName, text: quoted.text || quoted.attachments[0]?.name || 'Tin nhắn' } } : {}) }
        if (response.message) this.remember({ ...base, id: String(response.message.msgId), text: input.text, attachments: [] })
        for (const sent of response.attachment) {
          // The listener provides the permanent download URL; do not retain base64 files in history.
          if (!this.items.get(keyOf(type, id))?.some((message) => message.id === String(sent.msgId))) this.remember({ ...base, id: String(sent.msgId), text: response.message ? '' : input.text, attachments: [{ name: attachment?.name || 'Tệp đính kèm', kind: 'file' }] })
        }
        if (sentCard) this.remember({ ...base, id: String(sentCard.msgId), text: '', attachments: [{ kind: 'contact', name: sentCard.name, thumbnailUrl: sentCard.avatar, contactId: sentCard.contactId, phone: sentCard.phone }] })
        return [...response.attachment.map((sent) => String(sent.msgId)), ...(sentCard ? [String(sentCard.msgId)] : [])]
      } catch { throw new ChatError('Chưa xác nhận được kết quả gửi. Kiểm tra hội thoại trên Zalo trước khi gửi lại để tránh trùng tin.', 502) }
      finally {
        this.sendBusy = false
        if (file) await unlink(file).catch(() => undefined)
        if (directory) await rmdir(directory).catch(() => undefined)
      }
    })()
    this.sends.set(input.requestId, { fingerprint, result })
    return result
  }
  async contactQr(type: ConversationType, id: string, messageId: string, index: number) {
    const card = this.items.get(keyOf(type, id))?.find((message) => message.id === messageId)?.attachments[index]
    if (this.disposed || card?.kind !== 'contact' || !card.contactId) throw new ChatError('Danh thiếp không có UID hợp lệ.', 404)
    if (card.qrUrl) return { qrUrl: card.qrUrl }
    let request = this.qrRequests.get(card.contactId)
    if (!request) {
      if (this.qrRequests.size >= 1000) return {}
      request = this.api.getQR(card.contactId).then((result) => ({ qrUrl: safeMediaUrl(result[card.contactId!]) })).catch(() => ({}))
      this.qrRequests.set(card.contactId, request)
    }
    return request
  }
  action(type: ConversationType, id: string, input: MessageAction): Promise<{ conversation?: Conversation }> {
    if (this.disposed || this.state !== 'connected') throw new ChatError('Kết nối Zalo chưa sẵn sàng.', 409)
    if (!input || typeof input.messageId !== 'string' || typeof input.requestId !== 'string' || !/^[a-f0-9-]{36}$/i.test(input.requestId)) throw new ChatError('Thao tác không hợp lệ.')
    const key = keyOf(type, id)
    const message = this.items.get(key)?.find((item) => item.id === input.messageId)
    if (!message) throw new ChatError('Không tìm thấy tin nhắn trong hội thoại.', 404)
    if (message.system) throw new ChatError('Thông báo hệ thống không hỗ trợ thao tác tin nhắn.')
    const fingerprint = createHash('sha256').update(JSON.stringify({ type, id, input })).digest('hex')
    const previous = this.actions.get(input.requestId)
    if (previous) {
      if (previous.fingerprint !== fingerprint) throw new ChatError('Mã thao tác đã được sử dụng.', 409)
      return previous.result
    }
    if (this.actions.size >= 2000) throw new ChatError('Đã đạt giới hạn thao tác trong phiên.', 429)
    const result = (async (): Promise<{ conversation?: Conversation }> => {
      if (input.kind === 'react') {
        const icons = [Reactions.LIKE, Reactions.HEART, Reactions.HAHA, Reactions.WOW, Reactions.CRY, Reactions.ANGRY]
        const reaction = icons[CHAT_REACTIONS.indexOf(input.reaction)]
        const original = this.originals.get(`${key}:${message.id}`)
        if (!reaction || !original?.cliMsgId) throw new ChatError('Tin nhắn chưa đủ dữ liệu để thả cảm xúc.')
        await this.api.addReaction(reaction, { data: { msgId: original.msgId, cliMsgId: original.cliMsgId }, threadId: id, type: threadType(type) })
        if (!this.disposed) this.remember({ ...message, ownReaction: input.reaction })
        return {}
      }
      if (input.kind === 'forward') {
        if (!message.text || message.attachments.length || !['personal', 'group'].includes(input.targetType)) throw new ChatError('Hiện chỉ chuyển tiếp được tin nhắn văn bản.')
        await this.send(input.targetType, input.targetId, { requestId: input.requestId, text: message.text })
        return {}
      }
      if (input.kind !== 'open-contact' && input.kind !== 'add-friend') throw new ChatError('Thao tác không hợp lệ.')
      const card = Number.isInteger(input.attachmentIndex) ? message.attachments[input.attachmentIndex] : undefined
      if (card?.kind !== 'contact' || !card.contactId) throw new ChatError('Danh thiếp không có UID để mở tài khoản.')
      if (input.kind === 'add-friend') {
        await this.api.sendFriendRequest('Xin chào, mình muốn kết bạn với bạn.', card.contactId)
        return {}
      }
      const conversation: Conversation = { id: card.contactId, type: 'personal', name: card.name, avatar: card.thumbnailUrl || '', lastMessage: '', updatedAt: 0, ...this.threads.get(keyOf('personal', card.contactId)) }
      this.setThread(keyOf('personal', card.contactId), conversation)
      return { conversation }
    })().catch((cause: unknown) => { if (cause instanceof ChatError) throw cause; throw new ChatError('Chưa xác nhận được thao tác từ Zalo. Kiểm tra Zalo trước khi thử lại.', 502) })
    this.actions.set(input.requestId, { fingerprint, result })
    return result
  }
  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.phoneSyncController.dispose()
    this.incomingListeners.clear()
    clearTimeout(this.reconnectTimer)
    clearTimeout(this.readyTimer)
    for (const history of Object.values(this.histories)) clearTimeout(history.timer)
    this.api.listener.stop()
    this.items.clear(); this.threads.clear(); this.sends.clear(); this.originals.clear(); this.actions.clear(); this.qrRequests.clear(); this.avatars.clear(); this.profileRequests.clear()
    if (this.ownsUnreadStore) this.unreadStore.close()
  }
}
