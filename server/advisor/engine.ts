import { createHash } from 'node:crypto'
import { classifyAddress, normalize } from './regions.ts'
import { selectPriceSheet } from './price-sheets.ts'
import { readHomeNeeds, recommendPlan } from './recommendation.ts'
import { adviseTv } from './tv.ts'
import { adviseBilling } from './billing.ts'
import { closingChecklist } from './closing.ts'
import { cameraAdvice, cameraQuestion } from './camera.ts'
import type { AdvisorInput, Draft, Intent, Knowledge } from './types.ts'

const patterns: [Intent, RegExp][] = [
  ['stop', /dung nhan|dung lien he|khong nhan tin|dung tu van/],
  ['human', /nhan vien|nguoi that|goi cho|goi dien/],
  ['complaint', /khieu nai|lua dao|sai goi|khong dang ky|khong dang ki|huy camera|huy cam|mat mang|mang yeu/],
  ['invoice', /hoa don|bien lai|ke toan/], ['payment', /chuyen khoan|thanh toan|\bck\b|da dong tien|tien mat|so tai khoan/],
  ['price', /bao nhieu|gia|tien cuoc|cuoc phi|\d+\s*k\b/], ['fee', /phi lap|phi hoa mang|phat sinh|chi phi/],
  ['promotion', /khuyen mai|uu dai|tang thang|6 thang|12 thang|1 nam|sinh vien/],
  ['schedule', /khi nao|bao gio|may gio|hom nay|ngay mai|hen lap|lich lap|qua lap/],
  ['signup', /dang ky|dang ki|chot|lay goi|lap giup|lap cho/],
  ['recommend', /tu van|goi nao|phu hop|tang|lau|nha cap 4|phong tro|o tro|mang manh|mang nhanh|toc do cao|wifi|camera|truyen hinh/],
  ['greeting', /^(alo|chao|hello|hi|anh oi|chi oi|em oi)$/],
]
const money = (amount: number) => `${new Intl.NumberFormat('vi-VN').format(amount)}đ`

/** Produces a bounded decision summary and a draft. Never sends a message or treats chat text as policy. */
export function draftAdvice(input: AdvisorInput, knowledge: Knowledge, now = Date.now()): Draft {
  const messages = [...input.messages].sort((a, b) => a.at - b.at)
  const last = messages.at(-1)!
  const lastReply = messages.findLastIndex(m => m.role !== 'customer')
  const pending = messages.slice(lastReply + 1).filter(m => m.role === 'customer')
  const facts = { ...input.facts }
  facts.home = readHomeNeeds(messages.filter(m => m.role === 'customer').map(m => m.text), facts.home)
  let suppliedAddress = false
  // Only structured customer address/plan fields update memory; never extract a location from an arbitrary question.
  for (const message of messages.filter(m => m.role === 'customer')) {
    const address = message.text.match(/(?:^|\n)\s*địa chỉ(?: lắp đặt)?\s*:\s*([^\n]+)/iu)?.[1]?.trim()
      ?? message.text.match(/^(?:em|anh|chị|mình|tôi|nhà em|nhà mình)\s+ở\s+([^\n?!]+)$/iu)?.[1]?.trim()
    if (address) { facts.address = address; if (pending.some(m => m.id === message.id)) suppliedAddress = true }
    const plan = message.text.match(/(?:^|\n)\s*gói(?: cước(?: tư vấn)?)?\s*:\s*(NETVT\d+|MESHVT\d+)\b/iu)?.[1]
    if (plan) facts.plan = plan.toUpperCase()
  }
  const region = classifyAddress(facts.address ?? '', knowledge)
  const result: Draft = { mode: 'draft-only', action: 'draft', reply: null, intent: [], missing: [], reasons: [], sourceMessageIds: pending.map(m => m.id), knowledgeVersion: knowledge.version, region, facts }
  if (input.closing?.active) result.closingChecklist = closingChecklist(input.closing)
  const finish = (action: Draft['action'], reason: string, reply: string | null, missing: string[] = []) => ({ ...result, action, reasons: [...result.reasons, reason], reply, missing })
  if (input.paused || messages.some(m => m.role === 'operator' && now - m.at < 30 * 60_000)) return finish('skip', 'operator-takeover', null)
  if (last.role !== 'customer' || !pending.length || pending.every(m => input.handledMessageIds.includes(m.id))) return finish('skip', 'already-handled', null)
  if (last.at > now || now - last.at < 4000) return finish('wait', 'collecting-customer-messages', null)
  const text = normalize(pending.map(m => m.text).join('\n'))
  const mentionedPlans = [...new Set(text.match(/\b(?:netvt|meshvt)\d+\b/g) ?? [])]
  if (mentionedPlans.length === 1 && !/khong|ko|\bk\b|huy|dung|so sanh/.test(text)) facts.plan = mentionedPlans[0]!.toUpperCase()
  result.intent = patterns.filter(([, regex]) => regex.test(text)).map(([intent]) => intent)
  // A location-only reply continues the question before the bot asked for an address.
  // Carry only commercial intents, never revive old payments/complaints or old send actions.
  if (!result.intent.length && suppliedAddress) {
    const question = messages.slice(0, lastReply).findLast(m => m.role === 'customer')
    if (question) result.intent = patterns.filter(([intent, regex]) => ['price', 'fee', 'recommend', 'signup'].includes(intent) && regex.test(normalize(question.text))).map(([intent]) => intent)
  }
  if (!result.intent.length) result.intent = ['other']
  const has = (intent: Intent) => result.intent.includes(intent)
  const who = facts.salutation
  if (has('stop')) return finish('handoff', 'customer-opt-out', null)
  if (has('human') || has('complaint')) return finish('handoff', 'operator-required', `Dạ em chuyển nhân viên hỗ trợ ${who} phần này nhé.`)
  if (mentionedPlans.length > 1) return finish('handoff', 'plan-selection-needs-review', null)
  const billingPlan = facts.plan ?? [...messages].reverse().filter(m => m.role === 'customer').map(m => m.text.match(/(?:lấy|chọn|chốt|đăng ký|đăng kí)\s+(?:gói\s+)?((?:NETVT|MESHVT)\d+)\b/iu)?.[1]).find(Boolean)
  const billing = adviseBilling(messages, billingPlan)
  if (cameraQuestion(text) && !has('payment') && !has('invoice') && !has('schedule')) {
    if (facts.service === 'internet-tv' || /tivi|\btv\b|truyen hinh/.test(text)) return finish('handoff', 'camera-tv-bundle-review', 'Dạ em kiểm tra tổng gói Internet kèm truyền hình và camera cho mình nhé.')
    const camera = cameraAdvice(billingPlan ?? input.closing?.plan, region, knowledge, now, input.closing?.paymentMonths)
    if (camera.monthlyFee) result.cameraAddon = { monthlyFee: camera.monthlyFee, minimumMonths: 6, baseMonthlyPrice: camera.baseMonthlyPrice, totalMonthlyPrice: camera.totalMonthlyPrice }
    result.offerId = camera.offerId
    return finish('draft', camera.reason, camera.reply)
  }
  if (billing) {
    result.billingTerm = billing.term
    if (billing.term && input.closing?.active) {
      result.closingChecklist = closingChecklist({ ...input.closing, paymentMonths: billing.term.paidMonths as 6 | 12 })
      return finish('draft', billing.reason, [billing.reply, result.closingChecklist.nextQuestion].filter(Boolean).join('\n'), result.closingChecklist.missing)
    }
    return finish('draft', billing.reason, billing.reply, billing.missing)
  }
  if (has('payment') || has('invoice')) return finish('handoff', 'payment-or-invoice-needs-record', `Dạ để em kiểm tra thông tin đơn của mình rồi phản hồi ${who} nhé.`)
  if (has('schedule')) return finish('handoff', 'installation-needs-confirmation', `Dạ để em kiểm tra lịch kỹ thuật trước rồi xác nhận lại với ${who} nhé.`)
  const tv = adviseTv(messages, facts.service)
  if (tv) {
    result.tvAddon = tv.addon
    return finish('draft', tv.reason, tv.reply, tv.missing)
  }
  if (has('promotion')) return finish('handoff', 'promotion-not-configured', `Dạ để em kiểm tra ưu đãi áp dụng cho mình trước nhé.`)
  if (mentionedPlans.length > 1 || /khong lay|khong chon|ko lay|huy goi/.test(text)) return finish('handoff', 'plan-selection-needs-review', null)
  if (result.closingChecklist && (has('other') || has('signup'))) {
    if (result.closingChecklist.complete) return finish('handoff', 'registration-details-complete', 'Dạ em đã đủ thông tin để chuyển kiểm tra đăng ký lắp đặt cho mình ạ.')
    return finish('draft', 'collect-registration-details', result.closingChecklist.nextQuestion, result.closingChecklist.missing)
  }
  if (has('price') || has('fee') || has('recommend') || has('signup')) {
    result.recommendation = recommendPlan(facts.home)
    if (!facts.plan) {
      if (result.recommendation.reason === 'more-than-four-floors') return finish('handoff', 'more-than-four-floors', `Dạ nhà mình ${facts.home.floors} tầng thì em tính mỗi tầng một thiết bị. Để em kiểm tra phương án bổ sung thiết bị cho mình nhé.`)
      if (result.recommendation.reason === 'clarify-floor-count') return finish('draft', 'clarify-floor-count', 'Dạ mình cần dùng Wi-Fi tổng cộng mấy tầng, tính cả tầng trệt và gác nếu có ạ?', ['floors'])
    }
    if (region.value === 'unknown') return finish('draft', region.reason, facts.address ? `Dạ địa chỉ này thuộc quận/huyện nào trước đây và tỉnh/thành nào vậy ${who}? Em cần xác định đúng khu vực để báo giá ạ.` : `Dạ ${who} cho em xin khu vực lắp đặt, quận/huyện và tỉnh/thành để em tư vấn đúng giá nhé.`, ['address'])
    if (!region.verified) return finish('handoff', region.reason, `Dạ em kiểm tra lại bảng giá áp dụng tại địa chỉ của mình nhé.`, ['approved-region-table'])
    const selectedPlan = facts.plan ?? result.recommendation.plan
    if (!selectedPlan) return finish('draft', 'plan-not-selected', 'Dạ nhà mình là nhà cấp 4, phòng trọ hay nhà mấy tầng ạ?', ['home'])
    const offers = knowledge.offers.filter(o => o.approved && o.service === (facts.service ?? 'internet') && normalize(o.plan) === normalize(selectedPlan) && o.region === region.value && Date.parse(o.validFrom) <= now && now < Date.parse(o.validUntil))
    if (offers.length !== 1) return finish('handoff', offers.length ? 'conflicting-offers' : 'no-current-approved-offer', `Dạ em kiểm tra lại giá gói ${selectedPlan} tại khu vực mình rồi báo chính xác nhé.`, ['current-offer'])
    const offer = offers[0]!
    result.offerId = offer.id
    if (/camera/.test(text) || (/truyen hinh|tivi|\btv\b/.test(text) && facts.service !== 'internet-tv')) return finish('handoff', 'bundle-not-configured', `Dạ em kiểm tra giá gói kèm dịch vụ mình cần nhé.`, ['bundle-offer'])
    const sheet = selectPriceSheet(region, facts.service)
    // Do not attach a stale sheet that contradicts the approved quote.
    if (sheet && Object.entries(sheet.prices).some(([plan, price]) => normalize(plan) === normalize(offer.plan) && price === offer.monthlyPrice)) result.priceSheet = { id: sheet.id, path: sheet.path, service: sheet.service }
    const parts: string[] = []
    if (!facts.plan && result.recommendation.reason === 'one-device-per-floor') parts.push(`Nhà mình ${facts.home.floors} tầng thì em tư vấn mỗi tầng một thiết bị Wi-Fi nhé.`)
    if (has('price') || has('recommend') || has('signup')) parts.push(`Dạ gói ${offer.plan}${offer.service === 'internet-tv' ? ' kèm truyền hình' : ''} của mình là ${money(offer.monthlyPrice)}/tháng, có ${offer.devices} thiết bị phát Wi-Fi ạ.`)
    if (has('fee')) parts.push(`Phí hòa mạng là ${money(offer.installationFee)} ạ.`)
    if (has('signup')) parts.push('Mình muốn đăng ký gói này đúng không ạ? Em chuyển thông tin để nhân viên kiểm tra lắp đặt nhé.')
    return finish('draft', 'approved-offer', parts.join('\n'))
  }
  if (has('greeting')) return finish('draft', 'greeting', `Dạ em nghe ạ. ${who === 'anh/chị' ? 'Anh/chị' : who === 'anh' ? 'Anh' : 'Chị'} cần tư vấn lắp mạng ở khu vực nào ạ?`)
  return finish('handoff', 'unrecognized-request', null)
}
export function draftId(input: AdvisorInput, knowledge: Knowledge) { return createHash('sha256').update(JSON.stringify({ input, knowledge })).digest('hex') }
