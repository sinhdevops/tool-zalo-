import type { z } from 'zod'
import type { closingSchema } from './types.ts'
import { billingQuestion } from './billing.ts'
export function closingChecklist(state: z.infer<typeof closingSchema>) {
  const missing: string[] = []
  if (!state.plan) missing.push('plan')
  if (!state.paymentMonths || /^MESHVT/i.test(state.plan ?? '') && state.paymentMonths === 1) missing.push('payment-term')
  if (!state.address) missing.push('full-address')
  if (!state.phone) missing.push('phone')
  if (!state.location) missing.push('installation-location')
  if (!state.cccdFrontMessageId) missing.push('cccd-front')
  if (!state.cccdBackMessageId || state.cccdBackMessageId === state.cccdFrontMessageId) missing.push('cccd-back')
  const questions: Record<string, string> = {
    plan: 'Dạ mình chọn gói nào để em làm thông tin đăng ký ạ?',
    'payment-term': /^MESHVT/i.test(state.plan ?? '') && state.paymentMonths === 1 ? `Dạ gói Mesh đóng tối thiểu 6 tháng ạ. ${billingQuestion}` : billingQuestion,
    'full-address': 'Gửi giúp em địa chỉ lắp đặt cụ thể: số nhà, đường hoặc thôn/ấp, xã/phường và tỉnh/thành nhé.',
    phone: 'Cho em xin số điện thoại liên hệ của mình nhé.',
    'installation-location': 'Mình gửi giúp em định vị đúng nhà cần lắp nhé.',
    'cccd-front': state.cccdBackMessageId ? 'Mình gửi thêm giúp em mặt trước CCCD của người đăng ký lắp mạng nhé.' : 'Gửi giúp em ảnh rõ cả 2 mặt CCCD của người đăng ký lắp mạng nhé.',
    'cccd-back': 'Mình gửi thêm giúp em mặt sau CCCD của người đăng ký lắp mạng nhé.',
  }
  return { complete: !missing.length, missing, nextQuestion: missing[0] ? questions[missing[0]]! : null }
}
