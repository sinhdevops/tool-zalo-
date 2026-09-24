import { randomUUID } from 'node:crypto'
import type { AccountService } from '../accounts/service.ts'
import type { MessagingConnection } from '../messages/types.ts'
import { ChatError } from '../messages/types.ts'
import type { AutomationRule, BulkMessageCampaign, BulkMessageItem, BulkMessageSettings, BulkMessageSnapshot, IncomingMessage, Lead } from '../../shared/automation.ts'
import { AutomationStore } from './store.ts'
import type { Job } from './store.ts'
import { phones, orderFields } from './parse.ts'

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
  private bulkSettings: BulkMessageSettings | null = null
  private bulkItems: BulkMessageItem[] = []
  private bulkCampaignId?: string
  private bulkRunning = false
  private bulkBusy = false
  private bulkNextActionAt = 0
  private bulkSuccessCount = 0
  private bulkPausedReason = ''
  constructor(accounts: Pick<AccountService, 'getMessaging'>, store: AutomationStore, settleMs?: number) { this.accounts = accounts; this.store = store; this.settleMs = settleMs }
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
    if (this.closed || this.connecting || this.fault) return
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
      if (!this.closed && !this.busy && !this.bulkBusy) {
        for (const job of this.store.jobs('pending')) {
          if (!this.active(job)) { this.cancel(job); continue }
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
    const pending = this.bulkItems.filter(item => ['pending', 'searching', 'sending'].includes(item.status)).length
    const sent = this.bulkItems.filter(item => item.status === 'sent').length
    const failed = this.bulkItems.filter(item => item.status === 'error').length
    return {
      ...(this.bulkCampaignId ? { activeCampaignId: this.bulkCampaignId } : {}),
      running: this.bulkRunning,
      pausedReason: this.bulkPausedReason,
      settings: this.bulkSettings,
      items: this.bulkItems,
      campaigns: this.store.bulkCampaigns(),
      total: this.bulkItems.length,
      pending,
      sent,
      failed,
      ...(this.bulkNextActionAt > Date.now() ? { nextActionAt: this.bulkNextActionAt } : {}),
    }
  }

  private validateBulk(settings: BulkMessageSettings, phoneList: string[]) {
    if (!settings.accountId || !settings.message.trim() || settings.message.length > 2000) throw new ChatError('Chọn tài khoản và nhập nội dung tin nhắn từ 1 đến 2000 ký tự.')
    if (!/^\d{2}:\d{2}$/.test(settings.startTime) || !/^\d{2}:\d{2}$/.test(settings.endTime)) throw new ChatError('Khung giờ chạy không hợp lệ.')
    const start = this.timeMinutes(settings.startTime), end = this.timeMinutes(settings.endTime)
    if (start === null || end === null || start >= end) throw new ChatError('Giờ bắt đầu phải sớm hơn giờ kết thúc trong cùng một ngày.')
    if (!Number.isInteger(settings.delaySeconds) || settings.delaySeconds < 5 || settings.delaySeconds > 3600) throw new ChatError('Delay giữa các lượt phải từ 5 đến 3600 giây.')
    if (settings.pauseEvery !== 2 || settings.pauseSeconds !== 60) throw new ChatError('Cấu hình nghỉ hiện tại là sau 2 lượt gửi thành công, nghỉ 60 giây.')
    const normalized = [...new Set(phoneList.flatMap(value => phones(value)))]
    if (!normalized.length) throw new ChatError('Chưa có số điện thoại Việt Nam hợp lệ.')
    if (normalized.length > 1000) throw new ChatError('Mỗi lượt hỗ trợ tối đa 1000 số điện thoại.')
    this.accounts.getMessaging(settings.accountId)
    return { settings: { ...settings, message: settings.message.trim() }, normalized }
  }

  createBulk(settings: BulkMessageSettings, phoneList: string[]) {
    const validated = this.validateBulk(settings, phoneList)
    const now = Date.now()
    const campaign: BulkMessageCampaign = {
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      state: 'ready',
      settings: validated.settings,
      items: validated.normalized.map(phone => ({ id: randomUUID(), phone, status: 'pending', detail: 'Chờ bấm Chạy.' })),
    }
    this.store.saveBulkCampaign(campaign)
    return this.bulkSnapshot()
  }

  startBulk(id: string) {
    if (this.bulkRunning || this.bulkBusy) throw new ChatError('Một chiến dịch đang chạy. Hãy dừng chiến dịch hiện tại trước.', 409)
    const campaign = this.store.bulkCampaign(id)
    if (!campaign) throw new ChatError('Không tìm thấy cấu hình gửi tin.', 404)
    if (!campaign.items.some(item => item.status === 'pending')) throw new ChatError('Cấu hình này không còn số nào đang chờ gửi.', 409)
    this.accounts.getMessaging(campaign.settings.accountId)
    this.bulkCampaignId = campaign.id
    this.bulkSettings = campaign.settings
    this.bulkItems = campaign.items
    this.bulkRunning = true
    this.bulkBusy = false
    this.bulkNextActionAt = 0
    this.bulkSuccessCount = 0
    this.bulkPausedReason = ''
    this.saveActiveBulk('running')
    void this.tick()
    return this.bulkSnapshot()
  }

  stopBulk(id?: string) {
    if (id && this.bulkCampaignId && id !== this.bulkCampaignId) throw new ChatError('Chiến dịch này không phải chiến dịch đang chạy.', 409)
    this.bulkRunning = false
    this.bulkPausedReason = 'Đã dừng thủ công.'
    this.saveActiveBulk('stopped')
    return this.bulkSnapshot()
  }

  private saveActiveBulk(state: BulkMessageCampaign['state']) {
    if (!this.bulkCampaignId || !this.bulkSettings) return
    const previous = this.store.bulkCampaign(this.bulkCampaignId)
    this.store.saveBulkCampaign({
      id: this.bulkCampaignId,
      createdAt: previous?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
      state,
      settings: this.bulkSettings,
      items: this.bulkItems,
    })
  }

  private timeMinutes(value: string) {
    const match = /^(\d{2}):(\d{2})$/.exec(value)
    if (!match) return null
    const hour = Number(match[1]), minute = Number(match[2])
    if (hour > 23 || minute > 59) return null
    return hour * 60 + minute
  }

  private withinBulkWindow(settings: BulkMessageSettings, now = new Date()) {
    const start = this.timeMinutes(settings.startTime) ?? 0
    const end = this.timeMinutes(settings.endTime) ?? 0
    const current = now.getHours() * 60 + now.getMinutes()
    return current >= start && current < end
  }

  private updateBulkItem(id: string, update: Partial<BulkMessageItem>) {
    this.bulkItems = this.bulkItems.map(item => item.id === id ? { ...item, ...update } : item)
    this.saveActiveBulk(this.bulkRunning ? 'running' : 'stopped')
  }

  private async tickBulk() {
    if (!this.bulkRunning || this.bulkBusy || this.busy || !this.bulkSettings) return
    const next = this.bulkItems.find(item => item.status === 'pending')
    if (!next) {
      this.bulkRunning = false
      this.bulkPausedReason = 'Đã xử lý xong danh sách.'
      this.saveActiveBulk('completed')
      return
    }
    if (!this.withinBulkWindow(this.bulkSettings)) {
      this.bulkPausedReason = `Ngoài khung giờ ${this.bulkSettings.startTime}–${this.bulkSettings.endTime}.`
      return
    }
    if (Date.now() < this.bulkNextActionAt) {
      this.bulkPausedReason = 'Đang chờ theo giới hạn tốc độ.'
      return
    }
    this.bulkPausedReason = ''
    const chat = this.accounts.getMessaging(this.bulkSettings.accountId)
    if (chat.status() !== 'connected') {
      if (chat.status() === 'disconnected') chat.reconnect()
      this.bulkPausedReason = 'Đang chờ tài khoản Zalo kết nối.'
      return
    }
    this.bulkBusy = true
    this.updateBulkItem(next.id, { status: 'searching', detail: 'Đang tìm tài khoản Zalo theo số điện thoại.' })
    try {
      const user = await chat.automationFindUser(next.phone)
      this.updateBulkItem(next.id, { status: 'sending', detail: `Đã tìm thấy ${user.name || 'tài khoản Zalo'}, đang gửi tin.`, name: user.name })
      await chat.automationSendMessage(user.id, this.bulkSettings.message)
      const sentAt = Date.now()
      this.updateBulkItem(next.id, { status: 'sent', detail: 'Zalo đã xác nhận gửi tin nhắn.', name: user.name, sentAt })
      this.bulkSuccessCount += 1
      if (this.bulkSuccessCount >= this.bulkSettings.pauseEvery) {
        this.bulkSuccessCount = 0
        this.bulkNextActionAt = sentAt + this.bulkSettings.pauseSeconds * 1000
        this.bulkPausedReason = `Đã gửi ${this.bulkSettings.pauseEvery} lượt liên tiếp. Nghỉ ${this.bulkSettings.pauseSeconds} giây.`
      } else {
        this.bulkNextActionAt = sentAt + this.bulkSettings.delaySeconds * 1000
      }
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : 'Không xử lý được số điện thoại này.'
      this.updateBulkItem(next.id, { status: 'error', detail })
      this.bulkSuccessCount = 0
      this.bulkNextActionAt = Date.now() + this.bulkSettings.delaySeconds * 1000
    } finally {
      this.bulkBusy = false
    }
  }
  async close() {
    this.closed = true; clearInterval(this.timer); this.bindings.forEach(binding => binding.unsubscribe())
    // Keep the database open for any acknowledgement already in flight; process exit closes it.
    if (!this.busy) this.store.close()
  }
}
