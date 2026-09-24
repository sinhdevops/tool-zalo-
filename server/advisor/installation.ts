import { normalize } from './regions.ts'
export const installationPolicy = { standardFee: 300000, maximumDiscount: 100000, minimumPrepaidMonths: 6 } as const
export function installationAdvice(text: string, months?: number) {
  const value = normalize(text)
  if (!/phi hoa mang|phi lap|phi lap dat|phi ban dau/.test(value)) return undefined
  const discount = /giam|mien|bot|re hon/.test(value)
  if (!discount) return { action: 'draft' as const, reason: 'installation-standard-fee', reply: 'Dạ phí hòa mạng là 300k ạ.', fee: 300000 }
  if (months === 1) return { action: 'draft' as const, reason: 'installation-monthly-no-discount', reply: 'Dạ đóng từng tháng thì phí hòa mạng là 300k, không áp dụng giảm phí ạ.', fee: 300000 }
  if (!months) return { action: 'draft' as const, reason: 'installation-needs-payment-term', reply: 'Dạ phí hòa mạng là 300k ạ. Mình định đóng 6 tháng hay 1 năm để em xem trường hợp của mình nhé?', fee: 300000 }
  return { action: 'handoff' as const, reason: 'installation-discount-review', reply: 'Dạ phí hòa mạng là 300k ạ. Để em xem có hỗ trợ được trường hợp của mình không rồi báo lại nhé.', fee: 300000, maximumDiscount: 100000, minimumFee: 200000 }
}
