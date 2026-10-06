import { randomUUID } from 'node:crypto'
import type { AccountService } from '../accounts/service.ts'
import type { MessagingConnection } from '../messages/types.ts'
import { ChatError } from '../messages/types.ts'
import { BULK_MESSAGE_DELAY_SECONDS, BULK_MESSAGE_LOOKUP_RETRY_DELAY_MS, BULK_MESSAGE_MAX_LOOKUP_RETRIES, BULK_MESSAGE_PAUSE_EVERY, BULK_MESSAGE_PAUSE_SECONDS } from '../../shared/automation.ts'
import type { AutomationRule, BulkMessageCampaign, BulkMessageImageUpload, BulkMessageItem, BulkMessageSettings, BulkMessageSnapshot, IncomingMessage, Lead } from '../../shared/automation.ts'
import { AutomationStore } from './store.ts'
import type { Job } from './store.ts'
import { phones, orderFields } from './parse.ts'
import { lookupRetryDelay, vietnamTime } from './lookup-policy.ts'

const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

// Campaign schedules are entered in Vietnam time, regardless of the server's timezone.
export function withinVietnamTimeWindow(start: number, end: number, now: Date) {
  const current = ((now.getUTCHours() + 7) % 24) * 60 + now.getUTCMinutes()
  return current >= start && current < end
}

interface BulkRunState {
  campaignId: string
  running: boolean
  busy: boolean
  nextActionAt: number
  successCount: number
  pausedReason: string
}

export class AutomationService {
  private accounts: Pick<AccountService, 'getMessaging'>
  readonly store: AutomationStore
  private bindings = new Map<string, { chat: MessagingConnection; unsubscribe: () => void }>()
  private timer?: ReturnType<typeof setInterval>
  private busy = false
  private connecting = false
  private closed = false
  private fault = ''
  private lastReconnect = new Map<string, number>()
  private backfilledRevisions = new Map<string, string>()
  private settleMs?: number
  private bulkRuns = new Map<string, BulkRunState>()
  private bulkAccountsBusy = new Set<string>()
  private bulkFocusCampaignId?: string
  private bulkClock: () => Date
  constructor(accounts: Pick<AccountService, 'getMessaging'>, store: AutomationStore, settleMs?: number, bulkClock: () => Date = () => new Date()) {
    this.accounts = accounts; this.store = store; this.settleMs = settleMs
    this.bulkClock = bulkClock
    for (const campaign of store.bulkCampaigns()) {
      let current = campaign
      let running = campaign.state === 'running'
      let nextActionAt = 0
      let pausedReason = campaign.state === 'completed' ? 'Đã xử lý xong danh sách.' : campaign.state === 'stopped' ? 'Đã dừng thủ công.' : 'Chưa chạy'
      if (running) {
        const interruptedSend = campaign.items.some(item => item.status === 'sending')
        const items = campaign.items.map(item => {
          if (item.status === 'searching') {
            const retryCount = (item.retryCount ?? 0) + 1
            if (retryCount > BULK_MESSAGE_MAX_LOOKUP_RETRIES) return { ...item, status: 'error' as const, retryCount, retryAt: undefined, detail: 'Đã hết 2 lần thử lại khi khôi phục tra cứu. Bỏ qua số này và tiếp tục danh sách.' }
            return { ...item, status: 'pending' as const, retryCount, retryAt: Date.now() + lookupRetryDelay(retryCount), detail: 'Máy chủ khởi động lại khi đang tra cứu số này. Sẽ thử lại số này trong khoảng 1 phút.' }
          }
          if (item.status === 'sending') return { ...item, status: 'error' as const, detail: 'Máy chủ khởi động lại khi đang gửi. Kiểm tra Zalo trước khi gửi lại để tránh gửi trùng.' }
          if (item.status === 'pending' && item.retryAt && item.retryAt > Date.now()) {
            return { ...item, retryAt: Math.min(item.retryAt, Date.now() + BULK_MESSAGE_LOOKUP_RETRY_DELAY_MS) }
          }
          return item
        })
        running = items.some(item => item.status === 'pending')
        const lastSentAt = Math.max(0, ...items.map(item => item.sentAt ?? 0))
        nextActionAt = Math.max(
          lastSentAt ? lastSentAt + BULK_MESSAGE_PAUSE_SECONDS * 1000 : 0,
          campaign.dailyResumeAt ?? 0,
        )
        pausedReason = interruptedSend
          ? 'Một lượt gửi bị gián đoạn khi máy chủ khởi động lại; số đó cần kiểm tra. Các số còn lại sẽ tiếp tục.'
          : running ? 'Đang khôi phục chiến dịch sau khi khởi động lại.' : 'Đã xử lý xong danh sách.'
        current = { ...campaign, updatedAt: Date.now(), state: running ? 'running' : 'completed', items }
        store.saveBulkCampaign(current)
      }
      this.bulkRuns.set(campaign.id, { campaignId: campaign.id, running, busy: false, nextActionAt, successCount: 0, pausedReason })
    }
    this.bulkFocusCampaignId = store.bulkCampaigns()[0]?.id
  }
  start() { this.timer = setInterval(() => { void this.tick() }, 1500); this.timer.unref(); void this.tick() }
  snapshot() { const rules = this.store.rules().map(rule => ({ ...rule, connection: this.bindings.get(rule.accountId)?.chat.status() ?? 'disconnected' })); return { rules, rule: this.store.rule(), connection: rules.some(rule => rule.enabled && rule.connection === 'connected') ? 'connected' : 'disconnected', error: this.fault, ...this.store.stats() } }
  async choices(accountId: string, groupId?: string) {
    const chat = this.accounts.getMessaging(accountId)
    if (groupId) return { members: await chat.groupMembers(groupId) }
    return { groups: (await chat.list('group')).conversations }
  }
  private async validate(accountId: string, groupId: string, senderId: string, targetGroupId: string) {
    if (![accountId, groupId, senderId, targetGroupId].every((id) => /^\d{1,30}$/.test(id))) throw new ChatError('Hãy chọn tài khoản, nhóm theo dõi, người gửi và nhóm nhận hợp lệ.')
    if (accountId === senderId) throw new ChatError('Chọn người gửi khác tài khoản đang trực.')
    if (groupId === targetGroupId) throw new ChatError('Nhóm nhận số phải khác nhóm đang theo dõi.')
    const chat = this.accounts.getMessaging(accountId)
    const groups = (await chat.list('group')).conversations
    const group = groups.find((g) => g.id === groupId)
    const targetGroup = groups.find((g) => g.id === targetGroupId)
    const sender = (await chat.groupMembers(groupId)).find((m) => m.id === senderId)
    if (!group || !targetGroup || !sender) throw new ChatError('Không tìm thấy nhóm hoặc thành viên đã chọn.')
    return { groupName: group.name, senderName: sender.name, targetGroupName: targetGroup.name }
  }
  async configure(accountId: string, groupId: string, senderId: string, targetGroupId: string, id: string | null = 'group-leads') {
    const ruleId = id ?? randomUUID()
    const previous = this.store.rule(ruleId)
    if (id && id !== 'group-leads' && !previous) throw new ChatError('Không tìm thấy cấu hình.', 404)
    if (previous?.enabled) throw new ChatError('Tắt quy tắc và chờ thao tác hiện tại hoàn tất trước khi đổi cấu hình.', 409)
    const names = await this.validate(accountId, groupId, senderId, targetGroupId)
    if (this.closed || this.store.rule(ruleId)?.enabled || this.store.rule(ruleId)?.revision !== previous?.revision) throw new ChatError('Trạng thái đã thay đổi. Hãy tải lại.', 409)
    if (this.store.rules().some(rule => rule.id !== ruleId && rule.accountId === accountId && rule.groupId === groupId && rule.senderId === senderId && rule.targetGroupId === targetGroupId)) throw new ChatError('Cấu hình nhận nhóm này đã tồn tại.', 409)
    const rule: AutomationRule = { id: ruleId, accountId, groupId, senderId, targetGroupId, ...names, enabled: false, enabledAt: 0, revision: randomUUID() }
    this.store.saveRule(rule); this.store.log('Đã lưu cấu hình trực nhóm. Quy tắc đang tắt.')
    return this.snapshot()
  }
  async toggle(enabled: boolean, id = 'group-leads') {
    const rule = this.store.rule(id)
    if (!rule) throw new ChatError('Lưu cấu hình trước khi bật quy tắc.')
    if (rule.enabled === enabled) return this.snapshot()
    if (enabled) {
      if (this.store.jobs('running').some(job => job.revision === rule.revision)) throw new ChatError('Chờ thao tác của nhóm này hoàn tất.', 409)
      if (!rule.targetGroupId) throw new ChatError('Mở Cấu hình và chọn nhóm nhận số trước khi bật quy tắc.')
      await this.validate(rule.accountId, rule.groupId, rule.senderId, rule.targetGroupId)
      if (this.closed || this.store.rule(id)?.revision !== rule.revision) throw new ChatError('Cấu hình đã thay đổi. Hãy tải lại.', 409)
    }
    this.store.transaction(() => {
      this.store.saveRule({ ...rule, enabled, ...(enabled ? { enabledAt: Date.now(), revision: randomUUID() } : {}) })
      if (!enabled) for (const job of this.store.jobs('pending')) if (job.revision === rule.revision) this.cancel(job)
      this.store.log(enabled ? 'Đã bật trực nhóm. Chỉ xử lý tin mới từ thời điểm này.' : 'Đã tắt trực nhóm. Thao tác đã gửi tới Zalo có thể vẫn hoàn tất.')
    })
    this.fault = ''
    await this.tick()
    return this.snapshot()
  }
  private cancel(job: Job) {
    this.store.saveJob({ ...job, state: 'cancelled' })
    for (const leadId of job.leadIds) { const lead = this.store.lead(leadId); if (lead && lead.status !== 'sent') this.store.saveLead({ ...lead, status: 'review', detail: 'Quy tắc đã dừng trước khi chuyển tiếp hoàn tất. Chưa tự gửi lại.' }) }
  }
  private applyCardToLead(scope: string, card: { name: string; phone?: string; contactId?: string }) {
    const cardPhones = phones(card.phone ?? '')
    if (cardPhones.length !== 1) return
    this.store.enrichLeadFromCard(scope, cardPhones[0]!, card.name, card.contactId)
  }
  private scope(rule: AutomationRule) { return `${rule.accountId}:${rule.groupId}:${rule.senderId}${rule.id === 'group-leads' ? '' : ':' + rule.id}` }
  private backfillCardNames(rule: AutomationRule, chat: MessagingConnection) {
    const scope = this.scope(rule)
    for (const message of chat.messages('group', rule.groupId).messages) {
      if (message.senderId !== rule.senderId) continue
      for (const attachment of message.attachments) if (attachment.kind === 'contact') this.applyCardToLead(scope, attachment)
    }
  }
  ingest(accountId: string, event: IncomingMessage) {
    if (this.closed || this.fault) return
    for (const rule of this.store.rules()) this.ingestRule(rule, accountId, event)
  }
  private ingestRule(rule: AutomationRule, accountId: string, event: IncomingMessage) {
    const m = event.message
    if (!rule?.enabled || rule.accountId !== accountId || m.type !== 'group' || m.threadId !== rule.groupId || m.senderId !== rule.senderId || m.self || m.system || !Number.isFinite(m.timestamp) || m.timestamp < rule.enabledAt) return
    const scope = this.scope(rule)
    const textPhones = phones(m.text)
    const cards = m.attachments.filter((attachment) => attachment.kind === 'contact')
    if (!textPhones.length && !cards.length) return
    try {
      this.store.transaction(() => {
        if (!this.store.observe(`${scope}:${m.id}`)) return
        for (const card of cards) {
          const cardPhones = phones(card.phone ?? '')
          if (cardPhones.length === 1 && card.contactId && /^\d{1,30}$/.test(card.contactId)) this.store.card({ revision: rule.revision, phone: cardPhones[0]!, contactId: card.contactId, name: card.name.trim().slice(0, 160), groupId: rule.groupId, messageId: m.id, clientId: event.clientId, at: m.timestamp })
          this.applyCardToLead(scope, card)
        }
        if (!textPhones.length) return
        const leadIds: string[] = []
        for (const phone of textPhones) {
          const previous = this.store.byPhone(scope, phone)
          const fields = orderFields(m.text)
          const now = Date.now()
          const lead: Lead = previous ? { ...previous, updatedAt: now, occurrences: previous.occurrences + 1, name: fields.name || previous.name, address: fields.address || previous.address, plan: fields.plan || previous.plan } : {
            id: randomUUID(), scope, phone, ...fields, name: fields.name || '', createdAt: now, updatedAt: now,
            sourceAt: m.timestamp, sourceId: m.id, occurrences: 1, accountId, groupId: rule.groupId, groupName: rule.groupName, senderId: rule.senderId, revision: rule.revision, hasOrder: true, status: 'queued', stage: 'new', detail: `Chờ thả tim và chuyển tiếp sang nhóm ${rule.targetGroupName}.` }
          lead.sourceAt = m.timestamp; lead.sourceId = m.id; lead.revision = rule.revision; lead.hasOrder = true; lead.status = 'queued'; lead.sentAt = undefined; lead.delivery = 'forward'; lead.detail = `Chờ thả tim và chuyển tiếp sang nhóm ${rule.targetGroupName}.`
          this.store.saveLead(lead)
          leadIds.push(lead.id)
          this.store.log(previous ? 'Đã cập nhật lead từ tin nhắn mới.' : 'Đã lưu lead mới.', lead.id)
        }
        const delay = this.settleMs ?? 10_000 + Math.floor(Math.random() * 5_001)
        this.store.newJob({ kind: 'forward', revision: rule.revision, accountId, groupId: rule.groupId, targetGroupId: rule.targetGroupId, messageId: m.id, clientId: event.clientId, text: m.text, leadIds, notBefore: Date.now() + delay })
      })
    } catch { this.fault = 'Không lưu được dữ liệu tự động hóa. Đã ngừng xử lý; kiểm tra thư mục dữ liệu rồi tắt/bật lại quy tắc.' }
  }
  async tick() {
    if (this.closed) return
    if (this.connecting || this.fault) { await this.tickBulk(); return }
    const rules = this.store.rules().filter(rule => rule.enabled)
    const accountIds = new Set(rules.map(rule => rule.accountId))
    for (const [id, binding] of this.bindings) if (!accountIds.has(id)) { binding.unsubscribe(); this.bindings.delete(id) }
    this.connecting = true
    try {
      for (const accountId of accountIds) {
        try {
          const chat = this.accounts.getMessaging(accountId)
          if (this.bindings.get(accountId)?.chat !== chat) {
            this.bindings.get(accountId)?.unsubscribe()
            this.bindings.set(accountId, { chat, unsubscribe: chat.subscribeIncoming(event => this.ingest(accountId, event)) })
          }
          for (const rule of rules.filter(rule => rule.accountId === accountId)) {
            if (this.backfilledRevisions.get(rule.id) !== rule.revision) { this.backfillCardNames(rule, chat); this.backfilledRevisions.set(rule.id, rule.revision) }
          }
          if (chat.status() === 'idle') await chat.list('group')
          else if (chat.status() === 'disconnected' && Date.now() - (this.lastReconnect.get(accountId) ?? 0) > 30_000) { this.lastReconnect.set(accountId, Date.now()); chat.reconnect() }
        } catch { this.bindings.get(accountId)?.unsubscribe(); this.bindings.delete(accountId) }
      }
      if (!this.closed && !this.busy) {
        for (const job of this.store.jobs('pending')) {
          if (!this.active(job)) { this.cancel(job); continue }
          if (this.bulkAccountsBusy.has(job.accountId)) continue
          const chat = this.bindings.get(job.accountId)?.chat
          if (job.notBefore <= Date.now() && chat?.status() === 'connected') {
            this.busy = true; void this.run(job, chat).finally(() => { this.busy = false }); break
          }
        }
      }
    } finally { this.connecting = false }
    if (!this.closed && !this.busy) await this.tickBulk()
  }
  private active(job: Job) { return !this.closed && !this.fault && this.store.rules().some(rule => rule.enabled && rule.revision === job.revision && rule.accountId === job.accountId) }
  private async run(job: Job, chat: MessagingConnection) {
    try {
      if (!this.active(job)) { this.cancel(job); return }
      this.store.saveJob({ ...job, state: 'running' })
      await chat.automationHeart(job.groupId, job.messageId, job.clientId)
      this.store.log('Đã thả ❤️ vào tin chứa số điện thoại.')
      if (!this.active(job)) { this.cancel(job); return }
      const deliveries = job.leadIds.flatMap((leadId) => {
        let lead = this.store.lead(leadId)
        if (!lead) return []
        const sourceAt = lead.sourceAt
        const card = this.store.cards(job.revision, lead.phone, sourceAt).filter((item) => item.groupId === job.groupId).sort((a, b) => Math.abs(a.at - sourceAt) - Math.abs(b.at - sourceAt))[0]
        if (card) {
          this.store.enrichLeadFromCard(lead.scope, lead.phone, card.name ?? '', card.contactId)
          lead = this.store.lead(leadId) ?? lead
        }
        this.store.saveLead({ ...lead, status: 'sending', detail: 'Đang gửi nguyên tin nguồn và danh thiếp (nếu có) sang nhóm nhận.' })
        return [{ phone: lead.phone, contactId: card?.contactId }]
      })
      if (!job.text?.trim()) throw new ChatError('Tác vụ cũ không lưu nội dung tin nguồn. Không thể gửi lại an toàn.')
      const delivered = await chat.automationDeliver(job.targetGroupId, job.text, deliveries)
      const now = Date.now()
      for (const leadId of job.leadIds) { const lead = this.store.lead(leadId); if (lead) { const hasCard = delivered.find((item) => item.phone === lead.phone)?.card; this.store.saveLead({ ...lead, status: 'sent', sentAt: now, updatedAt: now, delivery: 'forward', detail: hasCard ? 'Zalo đã xác nhận gửi nguyên tin nguồn kèm danh thiếp sang nhóm nhận.' : 'Đã gửi nguyên tin nguồn; không tìm thấy tài khoản Zalo để gửi danh thiếp.' }) } }
      const cardCount = delivered.filter((item) => item.card).length
      this.store.log(`Zalo xác nhận đã gửi nguyên tin chứa ${delivered.length} số; ${cardCount} số có kèm danh thiếp.`)
      this.store.saveJob({ ...job, state: 'done' })
    } catch (error) {
      try {
        const detail = error instanceof ChatError ? error.message : 'Chưa xác nhận được thao tác từ Zalo. Kiểm tra Zalo; không tự thực hiện lại.'
        this.store.saveJob({ ...job, state: 'review' })
        for (const leadId of job.leadIds) { const lead = this.store.lead(leadId); if (lead) this.store.saveLead({ ...lead, status: 'review', detail }) }
        this.store.log(`Thả tim hoặc gửi sang nhóm chưa hoàn tất: ${detail}`)
      } catch { this.fault = 'Không lưu được kết quả. Đã ngừng tự động hóa để tránh gửi lặp.' }
    }
  }

  bulkSnapshot(): BulkMessageSnapshot {
    const campaigns = this.store.bulkCampaigns()
    const focused = campaigns.find(campaign => campaign.id === this.bulkFocusCampaignId && campaign.state === 'running')
      ?? campaigns.find(campaign => campaign.state === 'running')
      ?? campaigns.find(campaign => campaign.id === this.bulkFocusCampaignId)
      ?? campaigns[0]
    const run = focused ? this.bulkRuns.get(focused.id) : undefined
    const items = focused?.items ?? []
    const pending = items.filter(item => ['pending', 'searching', 'sending'].includes(item.status)).length
    const sent = items.filter(item => item.status === 'sent').length
    const failed = items.filter(item => item.status === 'error').length
    return {
      ...(focused ? { activeCampaignId: focused.id } : {}),
      running: campaigns.some(campaign => campaign.state === 'running'),
      pausedReason: run?.pausedReason ?? '',
      settings: focused?.settings ?? null,
      items,
      campaigns,
      total: items.length,
      pending,
      sent,
      failed,
      ...(run && run.nextActionAt > Date.now() ? { nextActionAt: run.nextActionAt } : {}),
    }
  }

  private validateBulk(settings: BulkMessageSettings, phoneList: string[]) {
    if (!settings.accountId || !settings.message.trim() || settings.message.length > 2000) throw new ChatError('Chọn tài khoản và nhập nội dung tin nhắn từ 1 đến 2000 ký tự.')
    if (!/^\d{2}:\d{2}$/.test(settings.startTime) || !/^\d{2}:\d{2}$/.test(settings.endTime)) throw new ChatError('Khung giờ chạy không hợp lệ.')
    const start = this.timeMinutes(settings.startTime), end = this.timeMinutes(settings.endTime)
    if (start === null || end === null || start >= end) throw new ChatError('Giờ bắt đầu phải sớm hơn giờ kết thúc trong cùng một ngày.')
    if (!Number.isInteger(settings.delaySeconds) || settings.delaySeconds < 5 || settings.delaySeconds > 3600) throw new ChatError('Delay giữa các lượt phải từ 5 đến 3600 giây.')
    const dailyLimit = settings.dailyLimit ?? 130
    if (!Number.isInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > 10000) throw new ChatError('Giới hạn gửi trong ngày phải từ 1 đến 10000 tin nhắn.')
    if (settings.pauseEvery !== BULK_MESSAGE_PAUSE_EVERY || settings.pauseSeconds !== BULK_MESSAGE_PAUSE_SECONDS) throw new ChatError('Cấu hình nghỉ hiện tại là sau 2 lượt gửi thành công, nghỉ 120 giây.')
    const normalized = [...new Set(phoneList.flatMap(value => phones(value)))]
    if (!normalized.length) throw new ChatError('Chưa có số điện thoại Việt Nam hợp lệ.')
    if (normalized.length > 1000) throw new ChatError('Mỗi lượt hỗ trợ tối đa 1000 số điện thoại.')
    this.accounts.getMessaging(settings.accountId)
    return { settings: { ...settings, dailyLimit, message: settings.message.trim() }, normalized }
  }

  private validateBulkImage(image?: BulkMessageImageUpload) {
    if (!image) return undefined
    if (typeof image.name !== 'string' || typeof image.mimeType !== 'string' || typeof image.base64 !== 'string' || image.base64.length > Math.ceil(10 * 1024 * 1024 * 4 / 3) + 8 || !/^[A-Za-z0-9+/]*={0,2}$/.test(image.base64)) throw new ChatError('Ảnh đính kèm không hợp lệ.')
    const name = [...image.name].map(character => character.charCodeAt(0) < 32 || /[\\/:*?"<>|]/.test(character) ? '_' : character).join('').slice(-180)
    const extension = /\.([^.]+)$/.exec(name)?.[1]?.toLowerCase()
    const expectedMime: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' }
    if (!extension || expectedMime[extension] !== image.mimeType) throw new ChatError('Chỉ hỗ trợ ảnh PNG, JPG, GIF hoặc WebP.')
    const data = Buffer.from(image.base64, 'base64')
    if (!data.length || data.length > 10 * 1024 * 1024 || data.toString('base64').replace(/=+$/, '') !== image.base64.replace(/=+$/, '')) throw new ChatError('Ảnh phải có dung lượng từ 1 byte đến 10 MB.', 413)
    const png = data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    const jpeg = data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff
    const gif = data.length >= 6 && ['GIF87a', 'GIF89a'].includes(data.subarray(0, 6).toString('ascii'))
    const webp = data.length >= 12 && data.subarray(0, 4).toString('ascii') === 'RIFF' && data.subarray(8, 12).toString('ascii') === 'WEBP'
    if (!(png || jpeg || gif || webp) || (extension === 'png' && !png) || (['jpg', 'jpeg'].includes(extension) && !jpeg) || (extension === 'gif' && !gif) || (extension === 'webp' && !webp)) throw new ChatError('Tệp không phải ảnh hợp lệ hoặc không khớp phần mở rộng.')
    return { name, mimeType: image.mimeType, base64: image.base64 }
  }

  createBulk(settings: BulkMessageSettings, phoneList: string[], imageUpload?: BulkMessageImageUpload) {
    const image = this.validateBulkImage(imageUpload)
    const validated = this.validateBulk({ ...settings, ...(image ? { image: { name: image.name, mimeType: image.mimeType } } : {}) }, phoneList)
    const now = Date.now()
    const campaign: BulkMessageCampaign = {
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      state: 'ready',
      settings: { ...validated.settings, delaySeconds: BULK_MESSAGE_DELAY_SECONDS },
      items: validated.normalized.map(phone => ({ id: randomUUID(), phone, status: 'pending', detail: 'Chờ bấm Chạy.' })),
    }
    this.store.saveBulkCampaign(campaign)
    if (image) this.store.saveBulkImage(campaign.id, image)
    this.bulkRuns.set(campaign.id, { campaignId: campaign.id, running: false, busy: false, nextActionAt: 0, successCount: 0, pausedReason: 'Chưa chạy' })
    if (![...this.bulkRuns.values()].some(run => run.running)) this.bulkFocusCampaignId = campaign.id
    return this.bulkSnapshot()
  }

  updateBulkCampaign(id: string, settings: BulkMessageSettings, imageUpload?: BulkMessageImageUpload, removeImage = false) {
    const campaign = this.store.bulkCampaign(id)
    if (!campaign) throw new ChatError('Không tìm thấy cấu hình gửi tin.', 404)
    const run = this.bulkRuns.get(id)
    if (campaign.state === 'running' || run?.running || run?.busy) throw new ChatError('Hãy dừng chiến dịch và chờ lượt hiện tại hoàn tất trước khi chỉnh sửa.', 409)
    const image = this.validateBulkImage(imageUpload)
    const validated = this.validateBulk({ ...settings, image: image ? { name: image.name, mimeType: image.mimeType } : removeImage ? undefined : campaign.settings.image }, campaign.items.map(item => item.phone))
    const dailyLimitChanged = (campaign.settings.dailyLimit ?? 130) !== (validated.settings.dailyLimit ?? 130)
    const updated: BulkMessageCampaign = { ...campaign, updatedAt: Date.now(), settings: { ...validated.settings, delaySeconds: BULK_MESSAGE_DELAY_SECONDS }, ...(dailyLimitChanged ? { dailyResumeAt: undefined } : {}) }
    this.store.saveBulkCampaign(updated)
    if (image) this.store.saveBulkImage(id, image)
    else if (removeImage) this.store.deleteBulkImage(id)
    if (run && dailyLimitChanged) { run.nextActionAt = 0; run.pausedReason = 'Đã cập nhật giới hạn gửi trong ngày.' }
    return this.bulkSnapshot()
  }

  startBulk(id: string) {
    const campaign = this.store.bulkCampaign(id)
    if (!campaign) throw new ChatError('Không tìm thấy cấu hình gửi tin.', 404)
    const currentRun = this.bulkRuns.get(id)
    if (currentRun?.running || currentRun?.busy) throw new ChatError('Chiến dịch này đang chạy hoặc đang hoàn tất một lượt gửi.', 409)
    if (!campaign.items.some(item => item.status === 'pending')) throw new ChatError('Cấu hình này không còn số nào đang chờ gửi.', 409)
    this.assertBulkAccountAvailable(id, campaign.settings.accountId)
    this.accounts.getMessaging(campaign.settings.accountId)
    this.store.saveBulkCampaign({ ...campaign, updatedAt: Date.now(), state: 'running', items: campaign.items.map(item => item.status === 'pending' ? { ...item, detail: item.retryAt ? item.detail : 'Đã vào hàng chờ gửi.' } : item) })
    this.bulkRuns.set(id, { campaignId: id, running: true, busy: false, nextActionAt: 0, successCount: 0, pausedReason: '' })
    this.bulkFocusCampaignId = id
    void this.tickBulk(id)
    return this.bulkSnapshot()
  }

  retryBulkFailed(id?: string) {
    const campaignId = id || this.bulkFocusCampaignId
    if (!campaignId) throw new ChatError('Không tìm thấy chiến dịch để gửi lại.', 404)
    const campaign = this.store.bulkCampaign(campaignId)
    if (!campaign) throw new ChatError('Không tìm thấy cấu hình gửi tin.', 404)
    const currentRun = this.bulkRuns.get(campaignId)
    if (currentRun?.running || currentRun?.busy) throw new ChatError('Chiến dịch này đang chạy hoặc đang hoàn tất một lượt gửi.', 409)
    const failed = campaign.items.filter(item => item.status === 'error')
    if (!failed.length) throw new ChatError('Chiến dịch này không có số lỗi để gửi lại.', 409)
    this.assertBulkAccountAvailable(campaignId, campaign.settings.accountId)
    this.accounts.getMessaging(campaign.settings.accountId)
    const items = campaign.items.map(item => {
      if (item.status !== 'error') return item
      return { ...item, status: 'pending' as const, detail: `Đã đưa số này vào hàng chờ gửi lại theo yêu cầu. ${item.detail}`, retryAt: undefined, retryCount: 0, sentAt: undefined }
    })
    this.store.saveBulkCampaign({ ...campaign, updatedAt: Date.now(), state: 'running', items })
    this.bulkRuns.set(campaignId, { campaignId, running: true, busy: false, nextActionAt: 0, successCount: 0, pausedReason: `Đang gửi lại ${failed.length} số đã lỗi.` })
    this.bulkFocusCampaignId = campaignId
    void this.tickBulk(campaignId)
    return this.bulkSnapshot()
  }

  stopBulk(id?: string) {
    const campaignId = id ?? this.store.bulkCampaigns().find(campaign => campaign.state === 'running')?.id
    if (!campaignId) throw new ChatError('Không tìm thấy chiến dịch đang chạy.', 404)
    const run = this.bulkRuns.get(campaignId)
    if (!run?.running) throw new ChatError('Chiến dịch này không chạy.', 409)
    run.running = false
    run.pausedReason = 'Đã dừng thủ công. Nếu đang gửi một tin, lệnh đã gửi tới Zalo có thể vẫn hoàn tất.'
    this.saveBulkRun(run, 'stopped')
    this.bulkFocusCampaignId = campaignId
    return this.bulkSnapshot()
  }

  private assertBulkAccountAvailable(campaignId: string, accountId: string) {
    const conflict = this.store.bulkCampaigns().find(campaign => campaign.id !== campaignId && campaign.settings.accountId === accountId
      && (campaign.state === 'running' || this.bulkRuns.get(campaign.id)?.busy))
    if (conflict) throw new ChatError('Tài khoản này đang chạy một chiến dịch khác. Chọn tài khoản khác để chạy song song.', 409)
  }

  private saveBulkRun(run: BulkRunState, state: BulkMessageCampaign['state']) {
    const campaign = this.store.bulkCampaign(run.campaignId)
    if (!campaign) return
    this.store.saveBulkCampaign({ ...campaign, updatedAt: Date.now(), state })
  }

  private timeMinutes(value: string) {
    const match = /^(\d{2}):(\d{2})$/.exec(value)
    if (!match) return null
    const hour = Number(match[1]), minute = Number(match[2])
    if (hour > 23 || minute > 59) return null
    return hour * 60 + minute
  }

  private withinBulkWindow(settings: BulkMessageSettings, now = this.bulkClock()) {
    const start = this.timeMinutes(settings.startTime) ?? 0
    const end = this.timeMinutes(settings.endTime) ?? 0
    return withinVietnamTimeWindow(start, end, now)
  }

  private sentToday(campaign: BulkMessageCampaign, now: number) {
    const shifted = new Date(now + VIETNAM_OFFSET_MS)
    const todayStart = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - VIETNAM_OFFSET_MS
    return campaign.items.filter(item => item.status === 'sent' && (item.sentAt ?? 0) >= todayStart && (item.sentAt ?? 0) < todayStart + DAY_MS).length
  }

  private nextVietnamStartAt(startTime: string, now: number) {
    const shifted = new Date(now + VIETNAM_OFFSET_MS)
    const [hour, minute] = startTime.split(':').map(Number)
    let resumeAt = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate(), hour, minute) - VIETNAM_OFFSET_MS
    if (resumeAt <= now) resumeAt += DAY_MS
    return resumeAt
  }

  private updateBulkItem(run: BulkRunState, id: string, update: Partial<BulkMessageItem>) {
    const campaign = this.store.bulkCampaign(run.campaignId)
    if (!campaign) return
    this.store.saveBulkCampaign({
      ...campaign,
      updatedAt: Date.now(),
      state: run.running ? 'running' : 'stopped',
      items: campaign.items.map(item => item.id === id ? { ...item, ...update } : item),
    })
  }

  private async tickBulk(campaignId?: string) {
    const runs = campaignId
      ? [this.bulkRuns.get(campaignId)].filter((run): run is BulkRunState => Boolean(run))
      : [...this.bulkRuns.values()]
    await Promise.all(runs.map(run => this.tickBulkCampaign(run)))
  }

  private async tickBulkCampaign(run: BulkRunState) {
    if (!run.running || run.busy) return
    if (this.busy) { run.pausedReason = 'Đang chờ thao tác trực nhóm hoàn tất.'; return }
    const campaign = this.store.bulkCampaign(run.campaignId)
    if (!campaign) { run.running = false; return }
    const now = this.bulkClock().getTime()
    const pending = campaign.items.filter(item => item.status === 'pending')
    if (!pending.length) {
      run.running = false
      const failedCount = campaign.items.filter(item => item.status === 'error').length
      run.pausedReason = failedCount ? `Đã xử lý xong danh sách. Còn ${failedCount} số lỗi có thể gửi lại thủ công.` : 'Đã xử lý xong danh sách.'
      this.saveBulkRun(run, 'completed')
      return
    }
    const next = pending.find(item => !item.retryAt || item.retryAt <= now)
    if (!next) {
      const retryAt = Math.min(...pending.map(item => item.retryAt ?? now))
      run.nextActionAt = Math.max(run.nextActionAt, retryAt)
      run.pausedReason = pending[0]?.detail || `Đang chờ thử lại sau khoảng 1 phút.`
      return
    }
    const dailyLimit = campaign.settings.dailyLimit ?? 130
    const sentToday = this.sentToday(campaign, now)
    if (sentToday >= dailyLimit) {
      const resumeAt = campaign.dailyResumeAt && campaign.dailyResumeAt > now ? campaign.dailyResumeAt : this.nextVietnamStartAt(campaign.settings.startTime, now)
      if (campaign.dailyResumeAt !== resumeAt) this.store.saveBulkCampaign({ ...campaign, updatedAt: Date.now(), dailyResumeAt: resumeAt })
      run.nextActionAt = Math.max(run.nextActionAt, resumeAt)
      run.pausedReason = `Đã đạt giới hạn ${dailyLimit} tin gửi thành công hôm nay. ${campaign.items.filter(item => item.status === 'pending').length} số còn lại sẽ tiếp tục lúc ${vietnamTime(resumeAt)} ngày mai (giờ Việt Nam).`
      return
    }
    if (campaign.dailyResumeAt) {
      this.store.saveBulkCampaign({ ...campaign, updatedAt: Date.now(), dailyResumeAt: undefined })
      if (run.nextActionAt === campaign.dailyResumeAt) run.nextActionAt = 0
    }
    if (!this.withinBulkWindow(campaign.settings)) {
      run.pausedReason = `Ngoài khung giờ ${campaign.settings.startTime}–${campaign.settings.endTime} (giờ Việt Nam).`
      return
    }
    if (now < run.nextActionAt) {
      run.pausedReason = 'Đang chờ theo giới hạn tốc độ.'
      return
    }
    if (this.bulkAccountsBusy.has(campaign.settings.accountId)) {
      run.pausedReason = 'Đang chờ lượt gửi khác trên cùng tài khoản.'
      return
    }
    run.pausedReason = ''
    let chat: MessagingConnection
    try { chat = this.accounts.getMessaging(campaign.settings.accountId) }
    catch (cause) {
      run.pausedReason = cause instanceof Error ? cause.message : 'Tài khoản Zalo chưa kết nối.'
      return
    }
    if (chat.status() !== 'connected') {
      if (['idle', 'disconnected'].includes(chat.status()) && Date.now() - (this.lastReconnect.get(campaign.settings.accountId) ?? 0) > 30_000) {
        this.lastReconnect.set(campaign.settings.accountId, Date.now())
        try { chat.reconnect() } catch (cause) {
          run.pausedReason = cause instanceof Error ? cause.message : 'Không thể kết nối lại Zalo.'
          return
        }
      }
      run.pausedReason = 'Đang chờ tài khoản Zalo kết nối.'
      return
    }

    run.busy = true
    this.bulkAccountsBusy.add(campaign.settings.accountId)
    this.updateBulkItem(run, next.id, { status: 'searching', detail: 'Đang tìm tài khoản Zalo theo số điện thoại.', retryAt: undefined })
    let foundUserName = ''
    let lookupCompleted = false
    try {
      const user = await chat.automationFindUser(next.phone, detail => this.updateBulkItem(run, next.id, { status: 'searching', detail }), 0)
      lookupCompleted = true
      if (!run.running) {
        this.updateBulkItem(run, next.id, { status: 'pending', detail: `Đã dừng sau khi tìm thấy ${user.name || 'tài khoản Zalo'}; chưa gửi tin. Có thể chạy tiếp.` })
        return
      }
      foundUserName = user.name
      this.updateBulkItem(run, next.id, { status: 'sending', detail: `Đã tìm thấy ${user.name || 'tài khoản Zalo'}, đang gửi tin.`, name: user.name, retryCount: undefined })
      const image = this.store.bulkImage(campaign.id)
      await chat.automationSendMessage(user.id, campaign.settings.message, image ? { name: image.name, base64: image.base64 } : undefined)
      const sentAt = this.bulkClock().getTime()
      this.updateBulkItem(run, next.id, { status: 'sent', detail: 'Zalo đã xử lý lệnh gửi tin nhắn thành công.', name: user.name, sentAt, retryAt: undefined, retryCount: undefined })
      run.successCount += 1
      if (run.successCount >= BULK_MESSAGE_PAUSE_EVERY) {
        run.successCount = 0
        run.nextActionAt = sentAt + BULK_MESSAGE_PAUSE_SECONDS * 1000
        run.pausedReason = `Đã gửi ${BULK_MESSAGE_PAUSE_EVERY} lượt liên tiếp. Nghỉ ${BULK_MESSAGE_PAUSE_SECONDS} giây.`
      } else {
        run.nextActionAt = sentAt + BULK_MESSAGE_DELAY_SECONDS * 1000
      }
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : 'Không xử lý được số điện thoại này.'
      if (!lookupCompleted) {
        const retryCount = (next.retryCount ?? 0) + 1
        run.successCount = 0
        if (retryCount <= BULK_MESSAGE_MAX_LOOKUP_RETRIES) {
          const retryAt = now + lookupRetryDelay(retryCount)
          const time = vietnamTime(retryAt)
          const detail = `Tra cứu số này chưa thành công (${retryCount}/${BULK_MESSAGE_MAX_LOOKUP_RETRIES} lần thử lại): ${reason} Sẽ thử lại lúc ${time} (giờ Việt Nam).`
          this.updateBulkItem(run, next.id, { status: 'pending', detail, retryAt, retryCount })
          const hasReadyItem = this.store.bulkCampaign(run.campaignId)?.items.some(item => item.id !== next.id && item.status === 'pending' && (!item.retryAt || item.retryAt <= now))
          if (!hasReadyItem) run.nextActionAt = Math.max(run.nextActionAt, retryAt)
          run.pausedReason = hasReadyItem
            ? `${next.phone} sẽ được thử lại lúc ${time}; đang tiếp tục các số còn lại.`
            : `Đang chờ thử lại ${next.phone} lúc ${time} (giờ Việt Nam).`
        } else {
          this.updateBulkItem(run, next.id, { status: 'error', detail: `Đã hết ${BULK_MESSAGE_MAX_LOOKUP_RETRIES} lần thử lại (${retryCount} lần tra cứu). Bỏ qua số này và tiếp tục danh sách. ${reason}`, retryCount, retryAt: undefined })
          run.pausedReason = `Đã bỏ qua ${next.phone} sau ${BULK_MESSAGE_MAX_LOOKUP_RETRIES} lần thử lại; tiếp tục danh sách.`
        }
      } else {
        const detail = `Đã tìm thấy ${foundUserName || 'tài khoản Zalo'}, nhưng gửi tin thất bại: ${reason} Không tự gửi lại số này để tránh gửi trùng; sẽ tiếp tục các số còn lại.`
        this.updateBulkItem(run, next.id, { status: 'error', detail })
        run.successCount = 0
        run.nextActionAt = this.bulkClock().getTime() + BULK_MESSAGE_DELAY_SECONDS * 1000
        run.pausedReason = `Gửi tới ${next.phone} không thành công; tiếp tục các số còn lại sau ${BULK_MESSAGE_DELAY_SECONDS} giây.`
      }
    } finally {
      run.busy = false
      this.bulkAccountsBusy.delete(campaign.settings.accountId)
      if (run.running) {
        const latest = this.store.bulkCampaign(run.campaignId)
        if (!latest || !latest.items.some(item => item.status === 'pending' || item.status === 'searching' || item.status === 'sending')) {
          run.running = false
          const failedCount = latest?.items.filter(item => item.status === 'error').length ?? 0
          run.pausedReason = failedCount ? `Đã xử lý xong danh sách. Còn ${failedCount} số lỗi có thể gửi lại thủ công.` : 'Đã xử lý xong danh sách.'
          this.saveBulkRun(run, 'completed')
        }
      }
    }
  }
  async close() {
    this.closed = true; clearInterval(this.timer); this.bindings.forEach(binding => binding.unsubscribe())
    // Keep the database open for any acknowledgement already in flight; process exit closes it.
    if (!this.busy && ![...this.bulkRuns.values()].some(run => run.busy)) this.store.close()
  }
}
