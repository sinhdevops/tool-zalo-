import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { foldVietnamese, normalizeText } from './nlp/normalizer.ts'

export type AdvisorLibraryKind = 'example' | 'answer'
export type AdvisorLibraryStatus = 'review' | 'test-approved' | 'archived'
export type AdvisorLibrarySource = 'history' | 'correction' | 'manual'

export interface AdvisorLibraryItem {
  id: string
  kind: AdvisorLibraryKind
  status: AdvisorLibraryStatus
  intent: string
  title: string
  customerText: string
  context: string
  draftReply: string
  answer: string
  variants: string[]
  source: AdvisorLibrarySource
  createdAt: number
  updatedAt: number
}

export interface AdvisorLibraryMatch {
  item: AdvisorLibraryItem
  score: number
  matchedBy: 'wording' | 'context'
}

const MAX_ITEMS = 20_000
const MAX_IMPORT_ITEMS = 5_000
const clean = (value: unknown, max: number) => typeof value === 'string' ? value.normalize('NFC').trim().slice(0, max) : ''

function normalizeForSearch(value: string) {
  return foldVietnamese(normalizeText(value)).replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/gu, ' ').trim()
}

function grams(value: string, size: number) {
  const padded = ` ${value} `
  const result = new Set<string>()
  for (let i = 0; i <= padded.length - size; i++) result.add(padded.slice(i, i + size))
  return result
}

function overlap(left: Set<string>, right: Set<string>) {
  if (!left.size || !right.size) return 0
  let common = 0
  for (const token of left) if (right.has(token)) common++
  return (2 * common) / (left.size + right.size)
}

/** Local fuzzy search tolerates missing Vietnamese accents, common abbreviations and small typing errors. */
export function advisorTextSimilarity(query: string, candidate: string) {
  const q = normalizeForSearch(query)
  const c = normalizeForSearch(candidate)
  if (!q || !c) return 0
  if (q === c) return 1
  if (c.includes(q) || q.includes(c)) return 0.96
  const tokenScore = overlap(new Set(q.split(' ').filter(Boolean)), new Set(c.split(' ').filter(Boolean)))
  const gramsScore = overlap(grams(q, 3), grams(c, 3))
  return tokenScore * 0.55 + gramsScore * 0.45
}

/** Redact common direct identifiers before storing examples derived from customer chat. */
export function redactAdvisorText(input: string) {
  return input
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu, '[email đã ẩn]')
    .replace(/https?:\/\/\S+/giu, '[liên kết đã ẩn]')
    .replace(/(?:\+?84|0)(?:[\s().-]?\d){8,10}\b/gu, '[số điện thoại đã ẩn]')
    .replace(/\b\d{9,12}\b/gu, '[số định danh đã ẩn]')
    .replace(/\b(?:địa chỉ(?: lắp đặt)?|nơi lắp đặt)\s*[:：]?\s*[^\n,!?;]+/giu, 'địa chỉ [đã ẩn]')
    .replace(/\b(?:em|anh|chị|tôi|mình)\s+tên\s+(?:là\s+)?[\p{L}]+(?:\s+[\p{L}]+){0,2}/giu, '[tên đã ẩn]')
    .replace(/\b\d{1,5}\s+(?:đường|đ\.|ngõ|hẻm|kiệt|ấp|thôn|tổ|khu phố)\s+[^\n,!?;]+/giu, '[địa chỉ đường phố đã ẩn]')
    .slice(0, 6000)
}

function makeItem(input: Partial<AdvisorLibraryItem> & Pick<AdvisorLibraryItem, 'kind' | 'intent' | 'customerText'>): AdvisorLibraryItem {
  const now = Date.now()
  const item: AdvisorLibraryItem = {
    id: input.id ?? randomUUID(),
    kind: input.kind,
    status: input.status ?? 'review',
    intent: clean(input.intent, 100),
    title: clean(input.title, 160),
    customerText: redactAdvisorText(clean(input.customerText, 6000)),
    context: redactAdvisorText(clean(input.context, 3000)),
    draftReply: redactAdvisorText(clean(input.draftReply, 3000)),
    answer: redactAdvisorText(clean(input.answer, 3000)),
    variants: Array.isArray(input.variants) ? [...new Set(input.variants.map(value => redactAdvisorText(clean(value, 500))).filter(Boolean))].slice(0, 40) : [],
    source: input.source ?? 'manual',
    createdAt: Number.isFinite(input.createdAt) ? Number(input.createdAt) : now,
    updatedAt: now,
  }
  if (!item.title) item.title = item.customerText.slice(0, 100) || 'Chưa có tiêu đề'
  return item
}

function parseStoredItem(value: unknown): AdvisorLibraryItem | undefined {
  if (!value || typeof value !== 'object') return undefined
  const row = value as Partial<AdvisorLibraryItem>
  if (typeof row.id !== 'string' || (row.kind !== 'example' && row.kind !== 'answer') || typeof row.customerText !== 'string') return undefined
  if (!['review', 'test-approved', 'archived'].includes(String(row.status))) return undefined
  return {
    id: row.id,
    kind: row.kind,
    status: row.status as AdvisorLibraryStatus,
    intent: clean(row.intent, 100),
    title: clean(row.title, 160) || clean(row.customerText, 100),
    customerText: clean(row.customerText, 6000),
    context: clean(row.context, 3000),
    draftReply: clean(row.draftReply, 3000),
    answer: clean(row.answer, 3000),
    variants: Array.isArray(row.variants) ? row.variants.filter((item): item is string => typeof item === 'string').slice(0, 40) : [],
    source: ['history', 'correction', 'manual'].includes(String(row.source)) ? row.source as AdvisorLibrarySource : 'manual',
    createdAt: Number.isFinite(row.createdAt) ? Number(row.createdAt) : Date.now(),
    updatedAt: Number.isFinite(row.updatedAt) ? Number(row.updatedAt) : Date.now(),
  }
}

export class AdvisorLearningStore {
  private readonly db: DatabaseSync
  private readonly key: Buffer
  private cache: AdvisorLibraryItem[] | null = null
  private readonly directory: string

  constructor(directory: string) {
    this.directory = directory
    mkdirSync(directory, { recursive: true, mode: 0o700 })
    const keyFile = path.join(directory, 'advisor.key')
    const databaseFile = path.join(directory, 'advisor-learning.sqlite')
    if (!existsSync(keyFile)) {
      if (existsSync(databaseFile)) throw new Error('Advisor learning key is missing; refusing to hide encrypted advisor data')
      try { writeFileSync(keyFile, randomBytes(32), { flag: 'wx', mode: 0o600 }) }
      catch (error) { if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST') throw error }
    }
    this.key = readFileSync(keyFile)
    if (this.key.length !== 32) throw new Error('Invalid advisor learning key')
    this.db = new DatabaseSync(databaseFile)
    this.db.exec(`PRAGMA busy_timeout=3000;
      CREATE TABLE IF NOT EXISTS advisor_library(
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        status TEXT NOT NULL,
        intent TEXT NOT NULL,
        createdAt INTEGER NOT NULL,
        body BLOB NOT NULL
      );
      CREATE INDEX IF NOT EXISTS advisor_library_status ON advisor_library(status, createdAt DESC);`)
  }

  private encrypt(item: AdvisorLibraryItem) {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', this.key, iv)
    const body = Buffer.concat([cipher.update(JSON.stringify(item), 'utf8'), cipher.final()])
    return Buffer.concat([iv, cipher.getAuthTag(), body])
  }

  private decrypt(value: unknown) {
    try {
      const body = Buffer.from(value as Uint8Array)
      if (body.length < 29) return undefined
      const decipher = createDecipheriv('aes-256-gcm', this.key, body.subarray(0, 12))
      decipher.setAuthTag(body.subarray(12, 28))
      const plain = Buffer.concat([decipher.update(body.subarray(28)), decipher.final()]).toString('utf8')
      return parseStoredItem(JSON.parse(plain))
    } catch { return undefined }
  }

  private all() {
    if (this.cache) return this.cache.map(item => ({ ...item, variants: [...item.variants] }))
    this.cache = this.db.prepare('SELECT status,body FROM advisor_library ORDER BY createdAt DESC LIMIT ?').all(MAX_ITEMS).flatMap(row => {
      const item = this.decrypt(row.body)
      return item ? [{ ...item, status: String(row.status) as AdvisorLibraryStatus }] : []
    })
    return this.cache.map(item => ({ ...item, variants: [...item.variants] }))
  }

  save(input: Partial<AdvisorLibraryItem> & Pick<AdvisorLibraryItem, 'kind' | 'intent' | 'customerText'>) {
    const item = makeItem(input)
    this.db.prepare(`INSERT INTO advisor_library(id,kind,status,intent,createdAt,body) VALUES(?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,status=excluded.status,intent=excluded.intent,body=excluded.body`)
      .run(item.id, item.kind, item.status, item.intent, item.createdAt, this.encrypt(item))
    if (this.cache) {
      const index = this.cache.findIndex(existing => existing.id === item.id)
      if (index < 0) this.cache.unshift(item)
      else this.cache[index] = item
      this.cache = this.cache.slice(0, MAX_ITEMS)
    }
    return item
  }

  item(id: string) { return this.all().find(item => item.id === id) }

  setStatus(id: string, status: AdvisorLibraryStatus) {
    const current = this.item(id)
    if (!current) return undefined
    return this.save({ ...current, status })
  }

  remove(id: string) {
    const deleted = this.db.prepare('DELETE FROM advisor_library WHERE id=?').run(id).changes > 0
    if (deleted && this.cache) this.cache = this.cache.filter(item => item.id !== id)
    return deleted
  }

  search(query = '', options: { status?: AdvisorLibraryStatus | 'all'; kind?: AdvisorLibraryKind | 'all'; limit?: number } = {}) {
    const normalizedQuery = clean(query, 300)
    return this.all()
      .filter(item => options.status === undefined || options.status === 'all' || item.status === options.status)
      .filter(item => options.kind === undefined || options.kind === 'all' || item.kind === options.kind)
      .map(item => {
        const fields = [item.title, item.customerText, item.context, item.answer, ...item.variants]
        return { item, score: normalizedQuery ? Math.max(...fields.map(field => advisorTextSimilarity(normalizedQuery, field))) : 0 }
      })
      .filter(result => !normalizedQuery || result.score >= 0.08)
      .sort((a, b) => b.score - a.score || b.item.updatedAt - a.item.updatedAt)
      .slice(0, Math.max(1, Math.min(options.limit ?? 100, 250)))
  }

  bestAnswer(input: { text: string; context: string; intent: string[] }): AdvisorLibraryMatch | undefined {
    const candidates = this.all().filter(item => item.kind === 'answer' && item.status === 'test-approved' && item.answer)
    const matches = candidates.flatMap(item => {
      const intents = item.intent.split(',').map(value => value.trim()).filter(Boolean)
      if (intents.length && !intents.some(intent => input.intent.includes(intent))) return []
      const phrases = [item.customerText, ...item.variants]
      const wording = Math.max(...phrases.map(phrase => advisorTextSimilarity(input.text, phrase)))
      const context = item.context ? advisorTextSimilarity(input.context, item.context) : 1
      if (item.context && context < 0.72) return []
      const score = item.context ? wording * 0.82 + context * 0.18 : wording
      if (score < 0.88) return []
      return [{ item, score, matchedBy: wording === 1 ? 'wording' as const : 'context' as const }]
    })
    return matches.sort((a, b) => b.score - a.score)[0]
  }

  importAnalysis() {
    const filename = path.join(this.directory, 'advisor-analysis.json')
    if (!existsSync(filename)) throw new Error('ADVISOR_ANALYSIS_NOT_FOUND')
    const data = JSON.parse(readFileSync(filename, 'utf8').replace(/^\uFEFF/, '')) as { examples?: Record<string, unknown> }
    const examples = data?.examples
    if (!examples || typeof examples !== 'object') throw new Error('ADVISOR_ANALYSIS_INVALID')
    const existing = new Set(this.all().filter(item => item.source === 'history').map(item => `${item.intent}\n${normalizeForSearch(item.customerText)}`))
    let imported = 0
    let skipped = 0
    let inspected = 0
    for (const [intent, rawItems] of Object.entries(examples)) {
      if (!Array.isArray(rawItems)) continue
      for (const raw of rawItems) {
        if (inspected >= MAX_IMPORT_ITEMS) break
        inspected++
        if (!raw || typeof raw !== 'object') { skipped++; continue }
        const pair = raw as { customer?: unknown; operator?: unknown }
        const customerText = redactAdvisorText(clean(pair.customer, 6000))
        const answer = redactAdvisorText(clean(pair.operator, 3000))
        if (!customerText || !answer) { skipped++; continue }
        const fingerprint = `${intent}\n${normalizeForSearch(customerText)}`
        if (existing.has(fingerprint)) { skipped++; continue }
        existing.add(fingerprint)
        this.save({ kind: 'example', status: 'review', intent, title: `Lịch sử · ${intent}`, customerText, answer, source: 'history' })
        imported++
      }
      if (inspected >= MAX_IMPORT_ITEMS) break
    }
    return { imported, skipped, total: this.all().length }
  }

  exportJsonl() {
    return this.all().filter(item => item.status !== 'archived').map(item => JSON.stringify({
      id: item.id, kind: item.kind, status: item.status, intent: item.intent, title: item.title,
      context: item.context, customerText: item.customerText, draftReply: item.draftReply,
      expectedAnswer: item.answer, variants: item.variants, source: item.source,
      createdAt: item.createdAt, updatedAt: item.updatedAt,
    })).join('\n')
  }

  stats() {
    const items = this.all()
    return {
      total: items.length,
      answers: items.filter(item => item.kind === 'answer').length,
      examples: items.filter(item => item.kind === 'example').length,
      needsReview: items.filter(item => item.status === 'review').length,
      testApproved: items.filter(item => item.status === 'test-approved').length,
    }
  }

  close() { this.db.close() }
}
