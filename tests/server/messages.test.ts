import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { UserMessage, GroupMessage, ThreadType } from 'zalo-api-final'
import type { API, MessageContent, TMessage, AddReactionDestination, Reactions } from 'zalo-api-final'
import { ZaloMessagingConnection } from '../../server/messages/connection.ts'
import { normalizeMessage } from '../../server/messages/normalize.ts'
import { MAX_ATTACHMENT_BYTES } from '../../shared/messages.ts'
import { createApp } from '../../server/app.ts'
import { AccountService } from '../../server/accounts/service.ts'
import { UnreadStore } from '../../server/messages/unread-store.ts'
import { paginateConversations } from '../../server/messages/http.ts'
import type { ConversationList } from '../../shared/messages.ts'
import { EncryptedChatStore } from '../../server/messages/chat-store.ts'

function payload(msgId: string, content: TMessage['content'] = 'Xin chào', from = '11', to = '99'): TMessage {
  return { actionId: '', msgId, cliMsgId: msgId, msgType: 'webchat', uidFrom: from, idTo: to, dName: 'Người thử nghiệm', ts: String(1_700_000_000_000 + Number(msgId)), status: 1, content, notify: '', ttl: 0, userId: '', uin: '', topOut: '', topOutTimeOut: '', topOutImprTimeOut: '', propertyExt: undefined, paramsExt: { countUnread: 0, containType: 0, platformType: 0 }, cmd: 0, st: 0, at: 0, realMsgId: msgId, quote: undefined }
}

test('conversation pagination returns 20 at a time and searches the complete source', () => {
  const source: ConversationList = { connection: 'connected', conversations: Array.from({ length: 45 }, (_, index) => ({ id: String(index), type: 'personal', name: index === 44 ? 'Khách đặc biệt' : `Liên hệ ${index}`, avatar: '', lastMessage: '', updatedAt: 45 - index })) }
  const first = paginateConversations(source, '', 0, 20)
  const second = paginateConversations(source, '', 20, 20)
  const searched = paginateConversations(source, 'khach dac biet', 0, 20)
  assert.equal(first.conversations.length, 20); assert.equal(first.hasMore, true); assert.equal(first.total, 45)
  assert.equal(second.conversations.length, 20); assert.equal(second.conversations[0]?.id, '20')
  assert.deepEqual(searched.conversations.map((item) => item.id), ['44'])
})

test('encrypted chat storage restores conversations and message order after restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'zalo-chat-'))
  const store = new EncryptedChatStore(directory)
  const first = fixture(undefined, undefined, store)
  try {
    await first.chat.list('personal')
    first.listener.emit('message', new UserMessage('99', payload('80', 'Nội dung bí mật mới')))
    first.listener.emit('old_messages', [new UserMessage('99', payload('79', 'Nội dung bí mật cũ'))], ThreadType.User)
    first.chat.dispose()

    const second = fixture(undefined, undefined, store)
    try {
      const conversation = (await second.chat.list('personal')).conversations.find((item) => item.id === '11')
      assert.equal(conversation?.lastMessage, 'Nội dung bí mật mới')
      assert.deepEqual(second.chat.messages('personal', '11').messages.map((message) => message.id), ['79', '80'])
      const database = await readFile(join(directory, 'chat.sqlite'))
      assert.equal(database.includes(Buffer.from('Nội dung bí mật')), false)
    } finally { second.chat.dispose() }
  } finally { store.close(); await rm(directory, { recursive: true, force: true }) }
})
function fixture(documentsId?: string, unreadStore?: UnreadStore, chatStore?: EncryptedChatStore) {
  const syncFrames: unknown[] = []
  const listener = Object.assign(new EventEmitter(), {
    start() {}, stop() { listener.emit('disconnected', 1000) },
    requestOldMessages(type: ThreadType, cursor: string | null) { requests.push({ type, cursor }) },
    sendWs(frame: unknown) { syncFrames.push(frame) },
  })
  const requests: Array<{ type: ThreadType; cursor: string | null }> = []
  const sends: Array<{ text: string; id: string; type: ThreadType; file?: string; quote?: MessageContent['quote'] }> = []
  const reactions: Array<{ reaction: Reactions; destination: AddReactionDestination }> = []
  const friends: string[] = []
  const cards: Array<{ userId: string; phoneNumber?: string; id: string; type: ThreadType }> = []
  let failSend = false
  let emptySendResponse = false
  let findUserFailures = 0
  let findUserCalls = 0
  let uploadedContent = ''
  // Test-only SDK adapter; synthetic data never enters the running account service.
  const api = {
    listener,
    getContext: () => ({ imei: 'synthetic-device', loginInfo: { send2me_id: documentsId } }),
    async getAllFriends() { return [{ userId: '11', displayName: 'Liên hệ kiểm thử', avatar: '' }] },
    async getAllGroups() { return { gridVerMap: { '22': '1' } } },
    async getGroupInfo() { return { gridInfoMap: { '22': { groupId: '22', name: 'Nhóm kiểm thử', fullAvt: '', totalMember: 3 } } } },
    async findUser() {
      findUserCalls += 1
      if (findUserFailures > 0) { findUserFailures -= 1; throw Object.assign(new Error('Lookup temporarily unavailable'), { code: 429 }) }
      return { uid: '33', display_name: 'Liên hệ mới', avatar: '' }
    },
    async addReaction(reaction: Reactions, destination: AddReactionDestination) { reactions.push({ reaction, destination }); if (failSend) throw new Error('Failed'); return { msgIds: [1] } },
    async sendFriendRequest(_text: string, id: string) { friends.push(id); return '' },
    async sendCard(options: { userId: string; phoneNumber?: string }, id: string, type: ThreadType) { cards.push({ ...options, id, type }); return { msgId: 779 } },
    async getQR(id: string) { return { [id]: 'https://example.com/qr.png' } },
    async getUserInfo(ids: string[]) { return { changed_profiles: Object.fromEntries(ids.map((id) => [id, { userId: id, displayName: `Hồ sơ ${id}`, avatar: 'https://example.com/avatar.png' }])) } },
    async sendMessage(message: MessageContent | string, id: string, type: ThreadType) {
      const file = typeof message === 'string' ? undefined : typeof message.attachments === 'string' ? message.attachments : undefined
      sends.push({ text: typeof message === 'string' ? message : message.msg, id, type, file, quote: typeof message === 'string' ? undefined : message.quote })
      if (file) uploadedContent = await readFile(file, 'utf8')
      if (failSend) throw new Error('Uncertain transport failure')
      if (emptySendResponse) return { message: null, attachment: [] }
      return { message: file ? null : { msgId: 777 }, attachment: file ? [{ msgId: 778 }] : [] }
    },
  } as unknown as API
  const chat = new ZaloMessagingConnection(api, '99', 'Tài khoản kiểm thử', '', unreadStore, chatStore)
  return { chat, listener, sends, requests, syncFrames, reactions, friends, cards, fail: () => { failSend = true }, emptySendResponse: () => { emptySendResponse = true }, failFindUser: (count: number) => { findUserFailures = count }, findUserCallCount: () => findUserCalls, uploaded: () => uploadedContent }
}
const input = (text = 'Tin kiểm thử') => ({ requestId: '12345678-1234-1234-1234-123456789abc', text })

test('bulk automation accepts a resolved SDK send even when no msgId acknowledgement is returned', async (t) => {
  const f = fixture(); t.after(() => f.chat.dispose())
  f.listener.emit('cipher_key', 'synthetic')
  f.emptySendResponse()
  await f.chat.automationSendMessage('33', 'Tin kiểm thử')
  assert.deepEqual(f.sends.map(item => ({ text: item.text, id: item.id, type: item.type })), [{ text: 'Tin kiểm thử', id: '33', type: ThreadType.User }])
})

test('bulk automation retries transient Zalo lookup failures before reporting a phone as missing', async (t) => {
  const f = fixture(); t.after(() => f.chat.dispose())
  f.listener.emit('cipher_key', 'synthetic')
  f.failFindUser(2)
  const user = await f.chat.automationFindUser('0369955757')
  assert.equal(user.id, '33')
  assert.equal(f.findUserCallCount(), 3)
})

test('My Documents uses the account-specific send2me ID and remains first even without history', async (t) => {
  const a = fixture('555'); const b = fixture('666'); t.after(() => { a.chat.dispose(); b.chat.dispose() })
  assert.deepEqual((await a.chat.list('personal')).conversations[0], { id: '555', type: 'personal', name: 'My Documents', avatar: '', lastMessage: '', updatedAt: 0, isMyDocuments: true, unreadCount: 0 })
  assert.equal((await b.chat.list('personal')).conversations[0]?.id, '666')
  a.listener.emit('cipher_key', 'synthetic')
  await a.chat.send('personal', '555', input('Ghi chú cá nhân'))
  assert.equal(a.sends[0]?.id, '555'); assert.equal(a.sends[0]?.type, ThreadType.User)
  a.listener.emit('old_messages', [new UserMessage('99', payload('53', 'Tin đã lưu', '0', '555'))], ThreadType.User)
  assert.equal(a.chat.messages('personal', '555').conversation?.name, 'My Documents')
  assert.equal(a.chat.messages('personal', '555').conversation?.isMyDocuments, true)
  assert.equal(b.chat.messages('personal', '555').messages.length, 0)
  assert.equal((await a.chat.list('group')).conversations.some((item) => item.isMyDocuments), false)
})

test('missing send2me ID does not invent a My Documents destination', async (t) => {
  const f = fixture(); t.after(() => f.chat.dispose())
  assert.equal((await f.chat.list('personal')).conversations.some((item) => item.isMyDocuments), false)
})

test('phone sync remains unavailable when the SDK adapter lacks the required custom API', async (t) => {
  const f = fixture(); t.after(() => f.chat.dispose())
  assert.throws(() => f.chat.requestPhoneSync(), /chưa sẵn sàng/)
  await f.chat.list('personal'); f.listener.emit('cipher_key', 'synthetic')
  assert.throws(() => f.chat.requestPhoneSync(), { status: 501 })
  assert.equal(f.syncFrames.length, 0)
  assert.equal(f.chat.phoneSync().status, 'error')
  f.listener.emit('old_messages', [new UserMessage('99', payload('20'))], ThreadType.User)
  assert.equal(f.chat.phoneSync().status, 'error')
  assert.equal(f.chat.messages('personal', '11').messages.length, 1)
})

test('automation sends the full source message once and then matching contact cards', async (t) => {
  const f = fixture(); t.after(() => f.chat.dispose())
  await f.chat.list('group'); f.listener.emit('cipher_key', 'synthetic')
  const sourceText = 'Tên khách hàng: Khách mẫu\nSố liên hệ: 0900000000\nSố phụ: 0380000000'
  await f.chat.automationDeliver('33', sourceText, [{ phone: '0900000000', contactId: '123' }, { phone: '0380000000' }])
  assert.deepEqual(f.sends.map(({ text, id, type }) => ({ text, id, type })), [{ text: sourceText, id: '33', type: ThreadType.Group }])
  assert.deepEqual(f.cards, [{ userId: '123', phoneNumber: '0900000000', id: '33', type: ThreadType.Group }, { userId: '33', phoneNumber: '0380000000', id: '33', type: ThreadType.Group }])
})

test('separates personal, group and account histories; deduplicates listener messages', async (t) => {
  const a = fixture(); const b = fixture(); t.after(() => { a.chat.dispose(); b.chat.dispose() })
  await a.chat.list('personal'); await a.chat.list('group'); a.listener.emit('cipher_key', 'synthetic')
  a.listener.emit('message', new UserMessage('99', payload('10')))
  a.listener.emit('message', new UserMessage('99', payload('10')))
  a.listener.emit('message', new GroupMessage('99', { ...payload('12', 'Tin nhóm', '11', '22'), mentions: undefined }))
  assert.equal(a.chat.messages('personal', '11').messages.length, 1)
  assert.equal(a.chat.messages('group', '22').messages[0]?.text, 'Tin nhóm')
  assert.equal(b.chat.messages('personal', '11').messages.length, 0)
  assert.equal((await a.chat.list('personal')).conversations[0]?.name, 'Liên hệ kiểm thử')
})

test('unread counts only live incoming messages; read tokens preserve newer arrivals', async (t) => {
  const f = fixture('555'); t.after(() => f.chat.dispose())
  await f.chat.list('personal'); await f.chat.list('group')
  f.listener.emit('old_messages', [new UserMessage('99', payload('1'))], ThreadType.User)
  f.listener.emit('message', new UserMessage('99', payload('1')))
  f.listener.emit('message', new UserMessage('99', payload('2', 'Tự gửi', '0', '11')))
  f.listener.emit('message', new UserMessage('99', payload('3', 'Ghi chú', '0', '555')))
  f.listener.emit('message', new UserMessage('99', payload('4')))
  f.listener.emit('message', new UserMessage('99', payload('4')))
  f.listener.emit('message', new GroupMessage('99', { ...payload('4', 'Tin nhóm', '11', '22'), mentions: undefined }))
  const shown = f.chat.messages('personal', '11').unread!
  assert.equal(shown.count, 1)
  assert.equal(f.chat.messages('personal', '555').unread?.count, 0)
  assert.equal(f.chat.messages('group', '22').unread?.count, 1)
  f.listener.emit('message', new UserMessage('99', payload('5')))
  assert.equal(f.chat.markRead('personal', '11', shown.through).count, 1)
  const listedUnread = (await f.chat.list('personal')).conversations.find((c) => c.id === '11')
  assert.equal(listedUnread?.unreadCount, 1); assert.ok(listedUnread?.unreadThrough)
  assert.equal(f.chat.messages('group', '22').unread?.count, 1)
  assert.throws(() => f.chat.markRead('personal', '11', -1))
  assert.throws(() => f.chat.markRead('personal', '11', 1.5))
})

test('restored unread counts cannot be cleared by an empty history', async (t) => {
  const store = new UnreadStore()
  const a = fixture(undefined, store)
  a.listener.emit('message', new UserMessage('99', payload('8', 'Tin từ người lạ', '88')))
  a.chat.dispose()
  const b = fixture(undefined, store)
  t.after(() => { b.chat.dispose(); store.close() })
  assert.equal((await b.chat.list('personal')).conversations.find((c) => c.id === '88')?.unreadCount, 1)
  assert.deepEqual(b.chat.messages('personal', '88').unread, { count: 1, through: 0 })
  assert.equal(b.chat.markRead('personal', '88', 0).count, 1)
  b.listener.emit('old_messages', [new UserMessage('99', payload('8', 'Tin từ người lạ', '88'))], ThreadType.User)
  const shown = b.chat.messages('personal', '88').unread!
  assert.equal(shown.count, 1)
  assert.ok(shown.through > 0)
  assert.equal(b.chat.markRead('personal', '88', shown.through).count, 0)
})

test('old messages use per-type cursors and stop on exhausted history', async (t) => {
  const f = fixture(); t.after(() => f.chat.dispose()); await f.chat.list('personal'); f.listener.emit('cipher_key', 'synthetic')
  f.listener.emit('old_messages', [new UserMessage('99', payload('30')), new UserMessage('99', payload('20'))], ThreadType.User)
  f.chat.history('personal')
  assert.deepEqual(f.requests.at(-1), { type: ThreadType.User, cursor: '20' })
  f.listener.emit('old_messages', [], ThreadType.User)
  assert.equal(f.chat.messages('personal', '11').hasMore, false)
  assert.equal(f.chat.messages('personal', '11').historyLoading, false)
})

test('automation subscription receives live events only and unsubscribes without stopping chat', async (t) => {
  const f = fixture(); t.after(() => f.chat.dispose())
  const ids: string[] = []
  const stop = f.chat.subscribeIncoming((event) => ids.push(event.message.id))
  f.listener.emit('old_messages', [new UserMessage('99', payload('1'))], ThreadType.User)
  f.listener.emit('message', new UserMessage('99', payload('2')))
  stop(); f.listener.emit('message', new UserMessage('99', payload('3')))
  assert.deepEqual(ids, ['2'])
  assert.equal(f.chat.messages('personal', '11').messages.length, 3)
})

test('send targets selected recipient/type and same request cannot send twice', async (t) => {
  const f = fixture(); t.after(() => f.chat.dispose()); await f.chat.list('personal'); await f.chat.list('group'); f.listener.emit('cipher_key', 'synthetic')
  await Promise.all([f.chat.send('group', '22', input()), f.chat.send('group', '22', input())])
  assert.equal(f.sends.length, 1); assert.equal(f.sends[0]?.id, '22'); assert.equal(f.sends[0]?.type, ThreadType.Group)
  assert.throws(() => f.chat.send('personal', '11', input()), /Mã gửi/)
  assert.throws(() => f.chat.send('personal', '404', { ...input(), requestId: '22345678-1234-1234-1234-123456789abc' }), /hợp lệ/)
  f.listener.emit('message', new GroupMessage('99', { ...payload('777', 'Tin kiểm thử', '0', '22'), mentions: undefined }))
  assert.equal(f.chat.messages('group', '22').messages.length, 1)
})

test('manual phone-only messages automatically include the searchable Zalo contact card', async (t) => {
  const f = fixture(); t.after(() => f.chat.dispose())
  await f.chat.list('group'); f.listener.emit('cipher_key', 'synthetic')
  await f.chat.send('group', '22', input('0900000000'))
  assert.deepEqual(f.cards, [{ userId: '33', phoneNumber: '0900000000', id: '22', type: ThreadType.Group }])
  const sent = f.chat.messages('group', '22').messages
  assert.equal(sent.at(-2)?.text, '0900000000')
  assert.deepEqual(sent.at(-1)?.attachments[0], { kind: 'contact', name: 'Liên hệ mới', thumbnailUrl: '', contactId: '33', phone: '0900000000' })
})

test('failed send is not reported successful or automatically retried', async (t) => {
  const f = fixture(); t.after(() => f.chat.dispose()); await f.chat.list('personal'); f.listener.emit('cipher_key', 'synthetic'); f.fail()
  await assert.rejects(f.chat.send('personal', '11', input()), /Chưa xác nhận/)
  await assert.rejects(f.chat.send('personal', '11', input()), /Chưa xác nhận/)
  assert.equal(f.sends.length, 1); assert.equal(f.chat.messages('personal', '11').messages.length, 0)
})

test('attachment content reaches SDK through safe temporary file and is cleaned up', async (t) => {
  const f = fixture(); t.after(() => f.chat.dispose()); await f.chat.list('personal'); f.listener.emit('cipher_key', 'synthetic')
  const upload = { ...input(''), attachment: { name: '../../sample.txt', base64: Buffer.from('synthetic upload').toString('base64') } }
  const ids = await f.chat.send('personal', '11', upload)
  assert.deepEqual(ids, ['778'])
  assert.deepEqual(await f.chat.send('personal', '11', upload), ids)
  assert.equal(f.sends.length, 1)
  assert.equal(f.uploaded(), 'synthetic upload')
  const file = f.sends[0]?.file; assert.ok(file)
  await assert.rejects(readFile(file), { code: 'ENOENT' })
  assert.throws(() => f.chat.send('personal', '11', { ...input(), requestId: '22345678-1234-1234-1234-123456789abc', attachment: { name: 'huge.txt', base64: Buffer.alloc(MAX_ATTACHMENT_BYTES + 1).toString('base64') } }), /10 MB/)
})

test('contact cards preserve avatars instead of rendering the Zalo home page as a file', () => {
  const content = { title: 'Liên hệ mẫu', action: 'recommened.user', thumb: 'https://example.com/avatar.jpg', href: 'https://zaloapp.com/', params: '123' }
  const message = normalizeMessage(new UserMessage('99', { ...payload('1', content), msgType: 'chat.recommended' }))
  assert.equal(message.text, '')
  assert.deepEqual(message.attachments, [{ name: 'Liên hệ mẫu', kind: 'contact', thumbnailUrl: content.thumb, contactId: '123', phone: undefined, qrUrl: undefined }])
})

test('contact details retain real phone and QR; unsafe URLs and invalid UIDs are dropped', () => {
  const card = (params: unknown, description: unknown) => normalizeMessage(new UserMessage('99', { ...payload('1', { title: 'Danh thiếp', action: 'recommened.user', params, description }), msgType: 'chat.recommended' })).attachments[0]
  assert.equal(card('123', JSON.stringify({ phone: '0900000000', qrCodeUrl: 'https://example.com/qr.png' }))?.qrUrl, 'https://example.com/qr.png')
  assert.equal(card('123', JSON.stringify({ phone: '0900000000' }))?.phone, '0900000000')
  assert.equal(card('https://example.com', { qrCodeUrl: 'javascript:alert(1)' })?.contactId, undefined)
  assert.equal(card('123', { qrCodeUrl: 'https://user:pass@example.com/qr.png' })?.qrUrl, undefined)
})

test('incoming name replaces an outgoing-only placeholder without replacing a known contact name', async (t) => {
  const f = fixture(); t.after(() => f.chat.dispose()); await f.chat.list('personal')
  f.listener.emit('message', new UserMessage('99', payload('50', 'Xin chào', '0', '44')))
  assert.equal((await f.chat.list('personal')).conversations.find((item) => item.id === '44')?.name, 'Zalo 44')
  f.listener.emit('message', new UserMessage('99', { ...payload('51', 'Chào bạn', '44'), dName: 'Thu' }))
  assert.equal((await f.chat.list('personal')).conversations.find((item) => item.id === '44')?.name, 'Thu')
  f.listener.emit('message', new UserMessage('99', { ...payload('52'), dName: 'Tên khác trong tin nhắn' }))
  assert.equal((await f.chat.list('personal')).conversations.find((item) => item.id === '11')?.name, 'Liên hệ kiểm thử')
})

test('message polling refreshes recipient profile even when every message is outgoing', async (t) => {
  const f = fixture(); t.after(() => f.chat.dispose()); await f.chat.list('personal')
  f.listener.emit('message', new UserMessage('99', payload('50', 'Xin chào', '0', '44')))
  assert.equal(f.chat.messages('personal', '44').conversation?.name, 'Zalo 44')
  await new Promise<void>((resolve) => setImmediate(resolve))
  const updated = f.chat.messages('personal', '44').conversation
  assert.equal(updated?.name, 'Hồ sơ 44')
  assert.equal(updated?.avatar, 'https://example.com/avatar.png')
})

test('friendship ecards are system notices; identical user text remains a normal message', async (t) => {
  const notice = new UserMessage('99', { ...payload('50', { type: '2', title: 'Bạn vừa kết bạn với Thu' }), msgType: 'chat.ecard' })
  const normalized = normalizeMessage(notice)
  assert.equal(normalized.system, true); assert.equal(normalized.canReply, false); assert.equal(normalized.canReact, false)
  assert.equal(normalizeMessage(new UserMessage('99', payload('51', 'Bạn vừa kết bạn với Thu'))).system, undefined)
  const f = fixture(); t.after(() => f.chat.dispose()); await f.chat.list('personal'); f.listener.emit('cipher_key', 'synthetic'); f.listener.emit('message', notice)
  assert.throws(() => f.chat.send('personal', '11', { ...input(), replyTo: '50' }), /không còn/)
  assert.throws(() => f.chat.action('personal', '11', { requestId: input().requestId, messageId: '50', kind: 'react', reaction: '👍' }), /Thông báo hệ thống/)
})

test('reply resolves the original message only in the selected conversation', async (t) => {
  const f = fixture(); t.after(() => f.chat.dispose())
  await f.chat.list('personal'); await f.chat.list('group'); f.listener.emit('cipher_key', 'synthetic')
  f.listener.emit('message', new UserMessage('99', payload('40')))
  assert.throws(() => f.chat.send('group', '22', { ...input(), replyTo: '40' }), /không còn/)
  await f.chat.send('personal', '11', { ...input(), replyTo: '40' })
  assert.equal(f.sends[0]?.quote?.msgId, '40')
  assert.equal(f.sends[0]?.quote?.uidFrom, '11')
  assert.equal(f.chat.messages('personal', '11').messages.find((message) => message.id === '777')?.quote?.text, 'Xin chào')
})

test('reactions use SDK message IDs, are deduplicated, and failures are not shown as successful', async (t) => {
  const f = fixture(); t.after(() => f.chat.dispose())
  await f.chat.list('personal'); f.listener.emit('cipher_key', 'synthetic')
  f.listener.emit('message', new UserMessage('99', { ...payload('40'), cliMsgId: '400' }))
  const action = { requestId: input().requestId, messageId: '40', kind: 'react' as const, reaction: '❤️' as const }
  assert.throws(() => f.chat.action('group', '22', action), /Không tìm thấy/)
  await Promise.all([f.chat.action('personal', '11', action), f.chat.action('personal', '11', action)])
  assert.equal(f.reactions.length, 1)
  assert.deepEqual(f.reactions[0]?.destination, { data: { msgId: '40', cliMsgId: '400' }, threadId: '11', type: ThreadType.User })
  assert.equal(f.chat.messages('personal', '11').messages[0]?.ownReaction, '❤️')
  f.fail()
  await assert.rejects(f.chat.action('personal', '11', { ...action, requestId: '22345678-1234-1234-1234-123456789abc', reaction: '👍' }), /Chưa xác nhận/)
  assert.equal(f.chat.messages('personal', '11').messages[0]?.ownReaction, '❤️')
})

test('contact actions target the card UID and forward uses the explicitly selected conversation', async (t) => {
  const f = fixture(); t.after(() => f.chat.dispose())
  await f.chat.list('personal'); await f.chat.list('group'); f.listener.emit('cipher_key', 'synthetic')
  f.listener.emit('message', new UserMessage('99', { ...payload('40', { title: 'Danh thiếp', action: 'recommened.user', params: '123' }), msgType: 'chat.recommended' }))
  const base = { requestId: input().requestId, messageId: '40', attachmentIndex: 0 }
  const opened = await f.chat.action('personal', '11', { ...base, kind: 'open-contact' })
  assert.equal(opened.conversation?.id, '123'); assert.equal(f.friends.length, 0)
  await f.chat.action('personal', '11', { ...base, requestId: '22345678-1234-1234-1234-123456789abc', kind: 'add-friend' })
  assert.deepEqual(f.friends, ['123'])
  assert.equal((await f.chat.contactQr('personal', '11', '40', 0)).qrUrl, 'https://example.com/qr.png')
  f.listener.emit('message', new UserMessage('99', payload('41')))
  const forward = { requestId: '32345678-1234-1234-1234-123456789abc', messageId: '41', kind: 'forward' as const, targetType: 'group' as const, targetId: '22' }
  await Promise.all([f.chat.action('personal', '11', forward), f.chat.action('personal', '11', forward)])
  assert.equal(f.sends.length, 1); assert.equal(f.sends[0]?.id, '22'); assert.equal(f.sends[0]?.type, ThreadType.Group)
})

test('photos preserve thumbnails and fall back when the original URL is missing or unsafe', () => {
  const photo = (content: TMessage['content']) => normalizeMessage(new UserMessage('99', { ...payload('2', content), msgType: 'chat.photo' })).attachments[0]
  assert.deepEqual(photo({ href: 'https://example.com/full.jpg', thumb: 'https://example.com/thumb.jpg' }), { name: 'Hình ảnh', kind: 'image', url: 'https://example.com/full.jpg', thumbnailUrl: 'https://example.com/thumb.jpg' })
  assert.equal(photo({ thumb: 'https://example.com/thumb.jpg' })?.url, 'https://example.com/thumb.jpg')
  assert.equal(photo({ href: 'javascript:alert(1)', thumb: 'https://example.com/thumb.jpg' })?.url, 'https://example.com/thumb.jpg')
  assert.equal(photo({ params: JSON.stringify({ normalUrl: 'https://example.com/normal.jpg' }) })?.url, 'https://example.com/normal.jpg')
  assert.equal(photo({ href: 'javascript:alert(1)', thumb: 'data:text/html,invalid', params: '{' })?.url, undefined)
  const file = normalizeMessage(new UserMessage('99', { ...payload('3', { href: 'https://example.com/doc.pdf', thumb: 'https://example.com/thumb.jpg' }), msgType: 'share.file' }))
  assert.equal(file.attachments[0]?.kind, 'file')
})

test('normalization never serves unsafe attachment URLs; disposal stops updates and sends', async (t) => {
  const content = { href: 'javascript:alert(1)', title: 'Tệp', description: '', thumb: '', childnumber: 0, action: '', params: '', type: '' }
  assert.equal(normalizeMessage(new UserMessage('99', payload('1', content))).attachments.length, 0)
  const f = fixture(); t.after(() => f.chat.dispose()); await f.chat.list('personal'); f.listener.emit('cipher_key', 'synthetic')
  f.chat.dispose(); f.listener.emit('message', new UserMessage('99', payload('10')))
  assert.equal(f.chat.messages('personal', '11').messages.length, 0)
  assert.throws(() => f.chat.send('personal', '11', input()), /chưa sẵn sàng/)
})

test('chat HTTP rejects unauthenticated account, cross-origin sends and malformed bodies', async (t) => {
  const f = fixture()
  const credentials = { imei: 'synthetic', cookie: [], userAgent: 'test' }
  const connection = { profile: { id: '99', displayName: 'Test', avatar: '', phoneNumber: '' }, credentials, messaging: f.chat, disconnect: () => f.chat.dispose() }
  const service = new AccountService({ load: async () => [], save: async () => {} }, { loginQR: async () => connection, restore: async () => connection })
  await service.initialize(); service.startLogin('http-test'); await new Promise<void>((resolve) => setImmediate(resolve))
  const server = createApp(service, 3001); server.listen(0, '127.0.0.1'); await new Promise<void>((resolve) => server.once('listening', resolve))
  t.after(() => { service.shutdown(); server.closeAllConnections(); server.close() })
  const address = server.address(); assert.ok(address && typeof address !== 'string')
  const base = `http://127.0.0.1:${address.port}/api/chat`
  const headers = { 'X-Zalo-Tool': '1', 'Content-Type': 'application/json' }
  assert.equal((await fetch(`${base}/missing/phone-sync`, { method: 'POST', headers, body: '{}' })).status, 409)
  assert.equal((await fetch(`${base}/99/phone-sync`, { method: 'POST', headers, body: '{}' })).status, 409)
  assert.equal((await fetch(`${base}/missing/conversations`)).status, 409)
  assert.equal((await fetch(`${base}/99/conversations?type=unknown`)).status, 400)
  assert.equal((await fetch(`${base}/99/conversations?type=personal`)).status, 200)
  f.listener.emit('cipher_key', 'synthetic')
  const syncUrl = `${base}/99/phone-sync`
  assert.equal((await fetch(syncUrl, { method: 'POST', headers: { ...headers, Origin: 'https://untrusted.example' }, body: '{}' })).status, 403)
  assert.equal((await fetch(syncUrl, { method: 'POST', body: '{}' })).status, 403)
  assert.equal((await (await fetch(syncUrl)).json() as { status: string }).status, 'error')
  assert.equal(f.syncFrames.length, 0)
  assert.equal((await fetch(syncUrl, { method: 'POST', headers, body: '{}' })).status, 501)
  assert.equal((await fetch(syncUrl, { method: 'POST', headers, body: '{}' })).status, 501)
  assert.equal(f.syncFrames.length, 0)
  const syncResult = await (await fetch(syncUrl)).json() as Record<string, unknown>
  assert.equal(syncResult.status, 'error')
  assert.deepEqual(Object.keys(syncResult).sort(), ['reason', 'status', 'updatedAt'])
  const url = `${base}/99/messages?type=personal&threadId=11`
  assert.equal((await fetch(url, { method: 'POST', headers: { ...headers, Origin: 'https://untrusted.example' }, body: JSON.stringify(input()) })).status, 403)
  assert.equal((await fetch(url, { method: 'POST', headers, body: '{' })).status, 400)
  assert.equal((await fetch(url, { method: 'POST', headers, body: JSON.stringify(input()) })).status, 200)
  assert.equal(f.sends.length, 1)
  const openUrl = `${base}/99/open-thread?type=personal&threadId=123`
  assert.equal((await fetch(openUrl, { method: 'POST', headers, body: JSON.stringify({ name: 'Khách lead' }) })).status, 200)
  assert.equal(f.chat.messages('personal', '123').conversation?.name, 'Khách lead')
  f.listener.emit('message', new UserMessage('99', payload('900')))
  const through = f.chat.messages('personal', '11').unread!.through
  const readUrl = `${base}/99/read?type=personal&threadId=11`
  assert.equal((await fetch(readUrl, { method: 'POST', body: JSON.stringify({ through }) })).status, 403)
  assert.equal((await fetch(readUrl, { method: 'POST', headers: { ...headers, Origin: 'https://untrusted.example' }, body: JSON.stringify({ through }) })).status, 403)
  assert.equal((await fetch(readUrl, { method: 'POST', headers, body: '{"through":-1}' })).status, 400)
  const read = await fetch(readUrl, { method: 'POST', headers, body: JSON.stringify({ through }) })
  assert.equal(read.status, 200)
  assert.equal((await read.json() as { count: number }).count, 0)
})

test('listener reconnects after a disconnect and resumes live incoming events', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const f = fixture(); t.after(() => f.chat.dispose())
  let starts = 0; f.listener.start = () => { starts++ }
  let received = 0; f.chat.subscribeIncoming(() => { received++ })
  f.listener.emit('disconnected', 1006)
  t.mock.timers.tick(2000)
  assert.equal(starts, 1); assert.equal(f.chat.status(), 'connecting')
  f.listener.emit('cipher_key', 'synthetic')
  f.listener.emit('message', new UserMessage('99', payload('900')))
  assert.equal(f.chat.status(), 'connected'); assert.equal(received, 1)
  f.listener.emit('disconnected', 1006)
  f.chat.dispose(); t.mock.timers.tick(30_000)
  assert.equal(starts, 1)
})

test('handshake timeout retries even when SDK stop emits no close event', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const f = fixture(); t.after(() => f.chat.dispose())
  f.listener.emit('disconnected', 1006)
  let starts = 0; f.listener.start = () => { starts++ }; f.listener.stop = () => {}
  f.chat.reconnect()
  t.mock.timers.tick(20_000)
  assert.equal(f.chat.status(), 'disconnected')
  t.mock.timers.tick(4000)
  assert.equal(starts, 2); assert.equal(f.chat.status(), 'connecting')
})
