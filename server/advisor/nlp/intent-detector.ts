import type { AdvisorIntent, BotQuestionKind, IntentResult } from '../domain/model.ts'
import { intentPhraseGroups } from './intent-dictionary.ts'
import { foldVietnamese, normalizeText } from './normalizer.ts'

export interface IntentContext {
  lastBotQuestion?: BotQuestionKind
}

type Candidate = IntentResult & { order: number }

function canonical(value: string) {
  return foldVietnamese(normalizeText(value))
}

const exactDictionary = intentPhraseGroups.flatMap(group => group.phrases.map(phrase => ({
  intent: group.intent,
  phrase: canonical(phrase),
  source: group.source,
})))

function contextualResult(intent: AdvisorIntent, evidence: string): IntentResult {
  return { intent, confidence: 0.99, source: 'PREVIOUS_QUESTION', evidence: [evidence] }
}

/** Resolves short answers only when the immediately preceding bot question makes them unambiguous. */
export function resolveByPreviousQuestion(text: string, question?: BotQuestionKind): IntentResult[] {
  const value = canonical(text).replace(/^(?:da|vang)\s+/, '').replace(/\s+(?:a|ah|nhe|nha)$/, '').trim()
  if (!question) return []

  if (question === 'HOUSE_TYPE') {
    if (/^(?:nha )?(?:thong thuong|binh thuong|thuong)(?: thoi)?$/.test(value)) return [contextualResult('HOUSE_NORMAL', 'HOUSE_TYPE')]
    if (/^(?:phong )?tro$/.test(value)) return [contextualResult('HOUSE_ROOM', 'HOUSE_TYPE')]
    if (/^(?:nha )?(?:tang|nhieu tang)$/.test(value)) return [contextualResult('HOUSE_MULTI_FLOOR', 'HOUSE_TYPE')]
    if (/^(?:1|mot)(?: tang)?$/.test(value)) return [contextualResult('HOUSE_LEVEL_1', 'HOUSE_TYPE')]
  }

  if (question === 'FLOOR_COUNT' && /^(?:\d+|mot|hai|ba|bon|nam)(?: tang| lau)?$/.test(value)) {
    return [contextualResult('PROVIDE_FLOOR_COUNT', 'FLOOR_COUNT')]
  }

  if (question === 'PAYMENT_TERM') {
    if (/^(?:1 nam|mot nam|12 thang|muoi hai thang)(?: luon| thoi)?$/.test(value)) return [contextualResult('SELECT_PAYMENT', 'PAYMENT_TERM')]
    if (/^(?:6 thang|sau thang|nua nam)(?: luon| thoi)?$/.test(value)) return [contextualResult('SELECT_PAYMENT', 'PAYMENT_TERM')]
    if (/^(?:tung thang|hang thang|1 thang|mot thang)$/.test(value)) return [contextualResult('SELECT_PAYMENT', 'PAYMENT_TERM')]
  }

  if (question === 'TV_TYPE') {
    if (/^(?:smart|smart tv|tivi smart|tv smart)$/.test(value)) return [contextualResult('TV_SMART', 'TV_TYPE')]
    if (/^(?:thuong|tivi thuong|tv thuong|tivi thong thuong|tv thong thuong)$/.test(value)) return [contextualResult('TV_NORMAL', 'TV_TYPE')]
  }

  if (/^(?:da|dung|dung roi|ok|oke|okay|vang)$/.test(value)) return [contextualResult('AFFIRM', question)]
  if (/^(?:khong|khong dau|thoi|bo di)$/.test(value)) return [contextualResult('DENY', question)]
  return []
}

function add(candidates: Candidate[], intent: AdvisorIntent, confidence: number, order: number, evidence: string, source: IntentResult['source'] = 'RULE') {
  const existing = candidates.find(item => item.intent === intent)
  if (existing && existing.confidence >= confidence) return
  if (existing) candidates.splice(candidates.indexOf(existing), 1)
  candidates.push({ intent, confidence, source, evidence: [evidence], order })
}

export function detectIntents(rawText: string, context: IntentContext = {}): IntentResult[] {
  const normalized = normalizeText(rawText)
  const value = foldVietnamese(normalized)
  const contextResults = resolveByPreviousQuestion(normalized, context.lastBotQuestion)
  const candidates: Candidate[] = contextResults.map((result, order) => ({ ...result, order }))
  let order = candidates.length

  for (const entry of exactDictionary) {
    if (value === entry.phrase || value.includes(entry.phrase)) {
      add(candidates, entry.intent, value === entry.phrase ? 0.97 : 0.93, order++, entry.source === 'CHAT_DATA' ? 'chat-data-phrase' : 'curated-phrase', 'DICTIONARY')
    }
  }

  const rule = (intent: AdvisorIntent, pattern: RegExp, confidence = 0.95) => {
    if (pattern.test(value)) add(candidates, intent, confidence, order++, pattern.source)
  }

  rule('GREETING', /^(?:alo|hello|hi|chao|em oi|anh oi|chi oi)$/)
  rule('ASK_INSTALLATION_FEE', /(?:phi|chi phi).*(?:lap|hoa mang)|(?:lap|hoa mang).*bao nhieu.*(?:phi|tien)|phi ban dau/)
  rule('ASK_INSTALLATION_TIME', /(?:lap|lap dat|lap mang).*(?:bao lau|lau khong|co lau|nhanh khong|mat bao lau|mat may phut)/)
  rule('ASK_PRICE', /(?:gia|cuoc|tien cuoc).*(?:bao nhieu|sao|the nao)|bao nhieu\s*(?:k|nghin|thang)|goi\s+(?:netvt|meshvt)\d+.*bao nhieu/)
  rule('ASK_RECOMMENDATION', /(?:tu van).*(?:goi|mang|internet)|goi nao.*phu hop/)
  rule('ASK_PACKAGE', /(?:co|ben em co).*goi|cac goi|goi nao(?!.*phu hop)/)

  rule('HOUSE_ROOM', /\b(?:phong tro|o tro)\b/)
  rule('HOUSE_LEVEL_1', /\b(?:nha )?(?:1|mot) tang\b|\bnha cap 4\b/)
  rule('HOUSE_NORMAL', /\bnha (?:thong thuong|binh thuong|thuong)\b/)
  rule('HOUSE_MULTI_FLOOR', /\bnha (?:cao tang|nhieu tang|tang)\b/)
  rule('PROVIDE_FLOOR_COUNT', /\b(?:\d+|mot|hai|ba|bon|nam)\s*(?:tang|lau)\b|\b1\s*tret\s*(?:\d+|mot|hai|ba|bon)\s*lau\b/)

  rule('NEED_FAST_INTERNET', /\b(?:mang (?:phai )?manh|mang nhanh|mang khoe|toc do cao|xai nang|tac vu nang|choi game|gaming|nhieu thiet bi)\b/)
  rule('NEED_NORMAL_INTERNET', /\b(?:mang binh thuong|nhu cau binh thuong|mang thuong la du|khong can mang manh)\b/)

  rule('ASK_MONTHLY_PAYMENT', /(?:dong|thanh toan).*(?:tung thang|hang thang|1 thang|mot thang).*(?:duoc khong|duoc|khong)|(?:tung thang|hang thang).*(?:duoc khong|duoc)/)
  rule('ASK_6_MONTH', /(?:dong|lay).*6 thang.*(?:duoc khong|sao|the nao)|6 thang.*(?:duoc khong|co tang|tang gi)/)
  rule('ASK_12_MONTH', /(?:dong|lay).*(?:1 nam|12 thang).*(?:duoc khong|sao|the nao|bao nhieu)|(?:1 nam|12 thang).*bao nhieu/)
  if (!/(?:duoc khong|co duoc|hay khong|sao|the nao|bao nhieu)/.test(value)) {
    rule('SELECT_PAYMENT', /(?:dong|lay|chon)\s+(?:goi\s+)?(?:6 thang|12 thang|1 nam|mot nam|tung thang|hang thang)\b/)
  }

  rule('TV_TOO_EXPENSIVE', /(?:tivi|tv|truyen hinh|40k).*(?:dat|mac|cao)|(?:dat|mac|cao).*(?:tivi|tv|truyen hinh|40k)/)
  rule('ASK_TV', /(?:goi|dich vu|them|co).*(?:tivi|tv|truyen hinh|dau box)|(?:tivi|truyen hinh).*(?:bao nhieu|sao|the nao|co khong)/)
  rule('TV_SMART', /\b(?:tivi smart|tv smart|smart tv)\b/)
  rule('TV_NORMAL', /\b(?:tivi thuong|tv thuong|tivi thong thuong|tv thong thuong)\b/)

  const cameraNegated = /(?:khong|khoi|bo|huy).{0,12}(?:cam|camera)|(?:cam|camera).{0,12}(?:khong lay|khoi lay|bo|huy)/.test(value)
  if (!cameraNegated) rule('ASK_CAMERA', /\b(?:cam|camera)\b|co tang gi|tang gi khong/)
  else add(candidates, 'DENY', 0.96, order++, 'camera-negation')

  rule('SELECT_PACKAGE', /(?:lay|chon|chot|dang ky)\s+(?:goi\s+)?(?:netvt|meshvt)\d+\b/)
  rule('PROVIDE_PHONE', /(?:\+?84|0)[\s.-]?(?:\d[\s.-]?){8,10}\d/)
  rule('PROVIDE_LOCATION_PIN', /(?:maps\.app\.goo\.gl|google\.com\/maps|goo\.gl\/maps)|\b(?:gui|day|nay).*(?:dinh vi|location)|\bdinh vi\b/)
  rule('PROVIDE_CCCD_FRONT', /(?:cccd|can cuoc).*(?:mat truoc)|(?:mat truoc).*(?:cccd|can cuoc)/)
  rule('PROVIDE_CCCD_BACK', /(?:cccd|can cuoc).*(?:mat sau)|(?:mat sau).*(?:cccd|can cuoc)/)
  if (/(?:2|hai) mat.*(?:cccd|can cuoc)|(?:cccd|can cuoc).*(?:2|hai) mat/.test(value)) {
    add(candidates, 'PROVIDE_CCCD_FRONT', 0.96, order++, 'two-id-sides')
    add(candidates, 'PROVIDE_CCCD_BACK', 0.96, order++, 'two-id-sides')
  }
  rule('PROVIDE_ADDRESS', /\bdia chi\b|\b(?:thon|ap|xa|phuong|quan|huyen|duong|kiet|hem)\b.*\b(?:\d+|tp|thanh pho|tinh|xa|phuong|quan|huyen)\b/, 0.9)
  rule('PROVIDE_LOCATION', /\b(?:em|anh|chi|minh|toi|nha em|nha minh)\s+o\s+[a-z0-9]|\blap\s+(?:mang|wifi|internet)?\s*(?:o|tai)\s+[a-z0-9]/, 0.92)

  if (/^(?:da|dung|dung roi|ok|oke|okay|vang)(?: a| ah)?$/.test(value)) add(candidates, 'AFFIRM', 0.9, order++, 'affirmation')
  if (/^(?:khong|khong dau|thoi|bo di)(?: a| ah)?$/.test(value)) add(candidates, 'DENY', 0.9, order++, 'denial')

  if (!candidates.length) return [{ intent: 'UNCLEAR', confidence: 0.2, source: 'FALLBACK' }]
  return candidates.sort((a, b) => a.order - b.order).map(({ order: _order, ...result }) => result)
}
