import { vietnamesePhones } from '../../../shared/phone.ts'
import type { AdvisorEntities, AdvisorIntent, BotQuestionKind, PaymentTerm } from '../domain/model.ts'
import { detectIntents } from './intent-detector.ts'
import { foldVietnamese, normalizeText } from './normalizer.ts'

export interface EntityContext {
  lastBotQuestion?: BotQuestionKind
  intents?: AdvisorIntent[]
}

const numberWords: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bmot\b/g, '1'], [/\bhai\b/g, '2'], [/\bba\b/g, '3'], [/\bbon\b/g, '4'], [/\bnam\b/g, '5'],
]

function numericText(value: string) {
  let result = value
  for (const [pattern, number] of numberWords) result = result.replace(pattern, number)
  return result
}

function extractFloors(value: string) {
  const text = numericText(value)
  if (/\b(?:gac|lung|tum)\b/.test(text)) return undefined
  const groundAndUpper = text.match(/\b(?:1\s*)?tret\s*(?:va\s*|voi\s*)?(\d+)\s*lau\b/)
  if (groundAndUpper) return 1 + Number(groundAndUpper[1])
  const counts = [...text.matchAll(/\b(\d+)\s*(?:tang|lau)\b/g)].map(match => Number(match[1]))
  if (counts.length === 1 && counts[0]! >= 1 && counts[0]! <= 100) return counts[0]
  return undefined
}

function extractPaymentTerm(value: string, intents: readonly AdvisorIntent[]): PaymentTerm | undefined {
  if (!intents.includes('SELECT_PAYMENT')) return undefined
  if (/\b(?:tung thang|hang thang|1 thang)\b/.test(value)) return 'MONTHLY'
  if (/\b(?:6 thang|nua nam)\b/.test(value)) return '6_MONTHS'
  if (/\b(?:1 nam|12 thang)\b/.test(value)) return '12_MONTHS'
  return undefined
}

function explicitAddress(rawText: string) {
  return rawText.match(/(?:^|\n)\s*địa chỉ(?: lắp đặt)?\s*:\s*([^\n]+)/iu)?.[1]?.trim()
}

function naturalLocation(rawText: string) {
  return rawText.match(/^(?:dạ\s+)?(?:em|anh|chị|mình|tôi|nhà em|nhà mình)\s+ở\s+([^\n?!]+)$/iu)?.[1]?.trim()
    ?? rawText.match(/^(?:dạ\s+)?(?:em|anh|chị|mình|tôi)?\s*(?:muốn|cần)?\s*lắp(?: mạng| wifi| internet)?\s+(?:ở|tại)\s+([^\n?!]+)$/iu)?.[1]?.trim()
}

function looksLikeFullAddress(value: string) {
  const folded = foldVietnamese(value)
  const localityTokens = folded.match(/\b(?:thon|ap|to|to dan pho|xa|phuong|quan|huyen|thi xa|thanh pho|tinh|duong|kiet|hem)\b/g)?.length ?? 0
  return localityTokens >= 2 || /^\s*\d+[\s/,-]/.test(value)
}

export function extractEntities(rawText: string, context: EntityContext = {}): AdvisorEntities {
  const normalized = normalizeText(rawText)
  const value = foldVietnamese(normalized)
  const detected = context.intents ?? detectIntents(rawText, { lastBotQuestion: context.lastBotQuestion }).map(result => result.intent)
  const intents = [...new Set(detected)]
  const entities: AdvisorEntities = {}

  const floors = extractFloors(value)
  if (floors !== undefined) entities.floors = floors

  const phone = vietnamesePhones(rawText)[0]
  if (phone) entities.phone = phone

  const paymentTerm = extractPaymentTerm(value, intents)
  if (paymentTerm) entities.paymentTerm = paymentTerm

  if (intents.includes('SELECT_PACKAGE')) {
    const plan = value.match(/\b((?:netvt|meshvt)\d+)\b/)?.[1]
    if (plan) entities.plan = plan.toUpperCase()
  }

  if (intents.includes('HOUSE_ROOM')) entities.houseType = 'ROOM'
  else if (intents.includes('HOUSE_LEVEL_1')) entities.houseType = 'LEVEL_1'
  else if (intents.includes('HOUSE_NORMAL')) entities.houseType = 'NORMAL'
  else if (intents.includes('HOUSE_MULTI_FLOOR') || (floors ?? 0) > 1) entities.houseType = 'MULTI_FLOOR'
  if (intents.includes('NEED_FAST_INTERNET')) entities.heavyUsage = true
  else if (intents.includes('NEED_NORMAL_INTERNET')) entities.heavyUsage = false

  if (intents.includes('TV_SMART')) entities.televisionType = 'SMART_TV'
  else if (intents.includes('TV_NORMAL')) entities.televisionType = 'NORMAL_TV'

  if (intents.includes('PROVIDE_LOCATION_PIN')) entities.locationPinReceived = true
  const cccdSides = [] as NonNullable<AdvisorEntities['cccdSides']>
  if (intents.includes('PROVIDE_CCCD_FRONT')) cccdSides.push('FRONT')
  if (intents.includes('PROVIDE_CCCD_BACK')) cccdSides.push('BACK')
  if (cccdSides.length) entities.cccdSides = cccdSides

  const labeledAddress = explicitAddress(rawText)
  const location = labeledAddress ?? naturalLocation(rawText)
  if (location) {
    entities.locationText = location
    if (labeledAddress || looksLikeFullAddress(location)) entities.installationAddress = location
  } else if (intents.includes('PROVIDE_ADDRESS') && looksLikeFullAddress(rawText)) {
    entities.locationText = rawText.trim()
    entities.installationAddress = rawText.trim()
  }

  return entities
}
