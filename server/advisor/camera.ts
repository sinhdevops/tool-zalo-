import type { Knowledge, Region } from './types.ts'
import { normalize } from './regions.ts'
export const cameraFees: Record<string, number> = { NETVT1: 10000, MESHVT1: 10000, NETVT2: 20000, MESHVT2: 20000, MESHVT3: 20000 }
export function cameraQuestion(text: string) {
  const value = normalize(text)
  return !/khong (?:can|lay|dung)|huy|khong dang k/.test(value) && /\bcam\b|camera|co tang gi|tang gi khong|qua tang/.test(value)
}
export function cameraAdvice(plan: string | undefined, region: Region, knowledge: Knowledge, now: number, paymentMonths?: number) {
  const prefix = 'Dạ đóng tối thiểu 6 tháng cước thì mình được tặng camera free lắp đặt.'
  const fee = cameraFees[(plan ?? '').toUpperCase()]
  if (!fee) return { reply: `${prefix} Phí camera cộng vào cước là 10k/tháng với NETVT1, MESHVT1; 20k/tháng với NETVT2, MESHVT2, MESHVT3. Mình đang chọn gói nào ạ?`, reason: 'camera-needs-plan' }
  const feeText = `Phí camera là ${fee / 1000}k/tháng, cộng vào cước Internet ạ.`
  if (paymentMonths === 1) return { reply: `${prefix} ${feeText} Nếu lấy camera thì mình cần chuyển sang đóng ít nhất 6 tháng nhé.`, reason: 'camera-minimum-six-months', monthlyFee: fee }
  const offers = knowledge.offers.filter(o => o.approved && o.service === 'internet' && o.plan.toUpperCase() === plan!.toUpperCase() && o.region === region.value && Date.parse(o.validFrom) <= now && now < Date.parse(o.validUntil))
  if (!region.verified || region.value === 'unknown' || offers.length !== 1) return { reply: `${prefix} ${feeText} Em cần kiểm tra giá Internet đúng khu vực mình trước khi báo tổng cước nhé.`, reason: 'camera-needs-base-price', monthlyFee: fee }
  const offer = offers[0]!, total = offer.monthlyPrice + fee
  return { reply: `${prefix} Gói ${offer.plan} ${offer.monthlyPrice / 1000}k + camera ${fee / 1000}k, tổng là ${total / 1000}k/tháng ạ.`, reason: 'camera-quote', monthlyFee: fee, baseMonthlyPrice: offer.monthlyPrice, totalMonthlyPrice: total, offerId: offer.id }
}
