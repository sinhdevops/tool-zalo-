import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import type { AutomationRule, Lead, AutomationLog, LeadStage } from '../../shared/automation.ts'

export interface Job {
  id: string; revision: string; accountId: string; kind: 'forward'; leadIds: string[]
  groupId: string; targetGroupId: string; messageId: string; clientId: string; text: string; notBefore: number; state: 'pending' | 'running' | 'done' | 'review' | 'cancelled'
}
export interface Card { revision: string; phone: string; contactId: string; name?: string; groupId: string; messageId: string; clientId: string; at: number }
export class AutomationStore {
  static readonly LOG_LIMIT = 100
  private db: DatabaseSync
  constructor(filename = ':memory:') {
    this.db = new DatabaseSync(filename)
    this.db.exec(`PRAGMA busy_timeout=3000;
      CREATE TABLE IF NOT EXISTS automation_config(id TEXT PRIMARY KEY, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS automation_events(id TEXT PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS leads(id TEXT PRIMARY KEY, scope TEXT NOT NULL, phone TEXT NOT NULL, body TEXT NOT NULL, UNIQUE(scope,phone));
      CREATE TABLE IF NOT EXISTS automation_cards(id INTEGER PRIMARY KEY, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS automation_jobs(id TEXT PRIMARY KEY, state TEXT NOT NULL, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS automation_logs(id INTEGER PRIMARY KEY, at INTEGER NOT NULL, text TEXT NOT NULL, leadId TEXT);`)
    this.pruneLogs()
    // Never execute jobs created by the removed friend/private-message workflow.
    for (const job of [...this.jobs('pending'), ...this.jobs('running')]) {
      const compatible = job.kind === 'forward' && Array.isArray(job.leadIds) && typeof job.targetGroupId === 'string' && typeof job.text === 'string' && Boolean(job.text.trim())
      this.saveJob({ ...job, state: compatible && job.state === 'pending' ? 'pending' : compatible ? 'review' : 'cancelled' } as Job)
      for (const leadId of Array.isArray(job.leadIds) ? job.leadIds : [String((job as unknown as { leadId?: string }).leadId ?? '')].filter(Boolean)) {
        const lead = this.lead(leadId); if (lead && lead.status !== 'sent') this.saveLead({ ...lead, status: 'review', detail: 'Tác vụ cũ đã dừng. Quy tắc mới không kết bạn hoặc gửi tin riêng.' })
      }
      if (job.state === 'running') this.log('Một thao tác bị gián đoạn; không tự thực hiện lại.')
    }
  }
  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE')
    try { const value = fn(); this.db.exec('COMMIT'); return value } catch (error) { this.db.exec('ROLLBACK'); throw error }
  }
  rule(): AutomationRule | null { const row = this.db.prepare('SELECT body FROM automation_config WHERE id=?').get('group-leads'); return row ? JSON.parse(String(row.body)) : null }
  saveRule(rule: AutomationRule) { this.db.prepare('INSERT OR REPLACE INTO automation_config VALUES(?,?)').run(rule.id, JSON.stringify(rule)) }
  observe(id: string) { return this.db.prepare('INSERT OR IGNORE INTO automation_events VALUES(?)').run(id).changes > 0 }
  lead(id: string): Lead | undefined { const row = this.db.prepare('SELECT body FROM leads WHERE id=?').get(id); return row ? JSON.parse(String(row.body)) : undefined }
  byPhone(scope: string, phone: string): Lead | undefined { const row = this.db.prepare('SELECT body FROM leads WHERE scope=? AND phone=?').get(scope, phone); return row ? JSON.parse(String(row.body)) : undefined }
  saveLead(lead: Lead) { this.db.prepare('INSERT INTO leads VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body').run(lead.id, lead.scope, lead.phone, JSON.stringify(lead)) }
  enrichLeadFromCard(scope: string, phone: string, name: string, contactId?: string) {
    const lead = this.byPhone(scope, phone)
    if (!lead) return false
    const cardName = name.trim().slice(0, 160)
    const nextName = lead.name.trim() ? lead.name : cardName
    const nextContactId = lead.contactId || (/^\d{1,30}$/.test(contactId ?? '') ? contactId : undefined)
    if (nextName === lead.name && nextContactId === lead.contactId) return false
    this.saveLead({ ...lead, name: nextName, contactId: nextContactId, updatedAt: Math.max(Date.now(), lead.updatedAt + 1) })
    return true
  }
  leads(search = '', stage = '', page = 1) {
    const where = `WHERE (?='' OR instr(phone,?)>0 OR instr(lower(json_extract(body,'$.name')),lower(?))>0 OR instr(lower(json_extract(body,'$.address')),lower(?))>0) AND (?='' OR COALESCE(json_extract(body,'$.stage'),'new')=?)`
    const args = [search, search, search, search, stage, stage]
    const total = Number(this.db.prepare(`SELECT COUNT(*) AS n FROM leads ${where}`).get(...args)!.n)
    const rows = this.db.prepare(`SELECT body FROM leads ${where} ORDER BY json_extract(body,'$.updatedAt') DESC LIMIT 50 OFFSET ?`).all(...args, (page - 1) * 50)
    return { leads: rows.map((r) => JSON.parse(String(r.body)) as Lead), total, page }
  }
  editLead(id: string, expectedUpdatedAt: number, fields: { name: string; phone: string; address: string; plan: string; stage: LeadStage }): Lead {
    return this.transaction(() => {
      const current = this.lead(id)
      if (!current) throw new Error('LEAD_NOT_FOUND')
      if (current.updatedAt !== expectedUpdatedAt) throw new Error('LEAD_CHANGED')
      const lead = { ...current, ...fields, updatedAt: Math.max(Date.now(), current.updatedAt + 1) }
      try { this.db.prepare('UPDATE leads SET phone=?,body=? WHERE id=?').run(lead.phone, JSON.stringify(lead), id) }
      catch (cause) { if (cause instanceof Error && cause.message.includes('UNIQUE')) throw new Error('LEAD_PHONE_EXISTS', { cause }); throw cause }
      this.log('Đã chỉnh sửa thông tin hoặc trạng thái lead.', id)
      return lead
    })
  }
  stats() { const row = this.db.prepare("SELECT COUNT(*) AS total, COALESCE(SUM(json_extract(body,'$.status')='sent' AND json_extract(body,'$.delivery')='forward'),0) AS sent FROM leads").get()!; return { total: Number(row.total), sent: Number(row.sent), waiting: Number(row.total) - Number(row.sent) } }
  card(card: Card) { this.db.prepare('INSERT INTO automation_cards(body) VALUES(?)').run(JSON.stringify(card)) }
  cards(revision: string, phone: string, at: number): Card[] { return this.db.prepare("SELECT body FROM automation_cards WHERE json_extract(body,'$.revision')=? AND json_extract(body,'$.phone')=? AND ABS(json_extract(body,'$.at')-?)<=600000").all(revision, phone, at).map((r) => JSON.parse(String(r.body))) }
  saveJob(job: Job) { this.db.prepare('INSERT INTO automation_jobs VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state,body=excluded.body').run(job.id, job.state, JSON.stringify(job)) }
  jobs(state: Job['state']): Job[] { return this.db.prepare('SELECT body FROM automation_jobs WHERE state=? ORDER BY rowid').all(state).map((r) => JSON.parse(String(r.body))) }
  newJob(input: Omit<Job, 'id' | 'state'>) { this.saveJob({ ...input, id: randomUUID(), state: 'pending' }) }
  log(text: string, leadId?: string) {
    this.db.prepare('INSERT INTO automation_logs(at,text,leadId) VALUES(?,?,?)').run(Date.now(), text, leadId ?? null)
    this.pruneLogs()
  }
  logs(): AutomationLog[] { return this.db.prepare('SELECT * FROM automation_logs ORDER BY id DESC LIMIT ?').all(AutomationStore.LOG_LIMIT).map((r) => ({ id: Number(r.id), at: Number(r.at), text: String(r.text), leadId: r.leadId ? String(r.leadId) : undefined })) }
  private pruneLogs() {
    this.db.prepare('DELETE FROM automation_logs WHERE id NOT IN (SELECT id FROM automation_logs ORDER BY id DESC LIMIT ?)').run(AutomationStore.LOG_LIMIT)
  }
  close() { this.db.close() }
}
