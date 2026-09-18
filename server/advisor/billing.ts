import { normalize } from './regions.ts'
import type { AdvisorInput } from './types.ts'
export const billingQuestion = 'Mình lấy gói đóng 6 tháng hay đóng 1 năm tặng 1 tháng luôn ạ'
export interface BillingAdvice { reply: string; reason: string; missing: string[]; term?: { paidMonths: number; bonusMonths: number } }
export function adviseBilling(messages: AdvisorInput['messages'], plan?: string): BillingAdvice | undefined {
  const lastReply = messages.findLastIndex(m => m.role !== 'customer')
  const text = normalize(messages.slice(lastReply + 1).map(m => m.text).join(' '))
  if (/da (?:dong|thanh toan)|chuyen khoan|\bck\b|hoa don|bien lai|khong lay|huy goi|khong chon/.test(text)) return undefined
  const monthly = /tung thang|hang thang|dong (?:1|mot) thang|thanh toan (?:1|mot) thang/.test(text)
  const six = /\b(?:6|sau) thang\b/.test(text), year = /\b(?:1|mot) nam\b|\b(?:12|muoi hai) thang\b/.test(text)
  const choose = /(?:lay|chon|chot|dang ky|dang ki) (?:goi )?(?:netvt|meshvt)\d+\b/.test(text) || /^(?:goi )?(?:netvt|meshvt)\d+(?: a| nhe| nha)?$/.test(text)
  if (!(monthly || six || year || choose)) return undefined
  if (!plan || !/^(?:NETVT|MESHVT)\d+$/i.test(plan)) return { reply: 'Dạ mình đang chọn gói nào để em kiểm tra kỳ đóng phù hợp ạ?', reason: 'billing-needs-plan', missing: ['plan'] }
  if (monthly) return /^MESHVT/i.test(plan)
    ? { reply: 'Dạ gói Mesh thì mình đóng tối thiểu 6 tháng ạ. Mình lấy gói đóng 6 tháng hay đóng 1 năm tặng 1 tháng luôn ạ', reason: 'mesh-minimum-six-months', missing: ['billing-term'] }
    : { reply: 'Dạ gói NETVT mình đóng từng tháng được ạ.', reason: 'net-monthly-available', missing: [] }
  // A question about a term is not a selection or evidence of payment.
  if (/duoc khong|co duoc|the nao|bao nhieu|\bhay\b|\bhoac\b/.test(text) || six && year) return { reply: billingQuestion, reason: 'billing-options', missing: ['billing-term'] }
  if (year) return { reply: 'Dạ mình chọn đóng 1 năm, được tặng thêm 1 tháng ạ.', reason: 'billing-year-selected', missing: [], term: { paidMonths: 12, bonusMonths: 1 } }
  if (six) return { reply: 'Dạ mình chọn đóng 6 tháng ạ.', reason: 'billing-six-selected', missing: [], term: { paidMonths: 6, bonusMonths: 0 } }
  return { reply: billingQuestion, reason: 'billing-first-offer', missing: ['billing-term'] }
}
