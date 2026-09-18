import { normalize } from './regions.ts'
import type { AdvisorInput } from './types.ts'
export interface TvAdvice { reply: string; reason: string; missing: string[]; addon?: { kind: 'box' | 'app'; monthlyPrice: number; maxDevices?: number } }
const tvTopic = /\btivi\b|\btv\b|truyen hinh|dau box|\bsmart\b/
const expensive = /dat qua|mac qua|hoi dat|hoi mac|re hon|giam gia|gia cao/
export function adviseTv(messages: AdvisorInput['messages'], service?: string): TvAdvice | undefined {
  let active = service === 'internet-tv', priceObjection = false
  let type: 'ordinary' | 'smart' | undefined
  let latest = '', latestIsTv = false
  for (const m of messages) {
    const text = normalize(m.text)
    if (m.role !== 'customer') continue
    latest = text; latestIsTv = tvTopic.test(text)
    if (/khong (?:can |lay |dung )?(?:tivi|tv|truyen hinh)|chi (?:can |lay |lap )?(?:internet|mang)(?: thoi)?/.test(text)) { active = false; priceObjection = false; type = undefined; latestIsTv = false; continue }
    if (latestIsTv) active = true
    if (!active) continue
    if (expensive.test(text)) priceObjection = true
    if (/khong phai smart|khong (?:co |la )?smart|tivi thuong|tv thuong|tivi thong thuong|tv thong thuong/.test(text)) type = 'ordinary'
    else if (/\bsmart\b/.test(text) && !/hay|hoac|\bneu\b/.test(text)) type = 'smart'
    else if (/^(?:loai )?thuong(?: a| nhe)?$/.test(text)) type = 'ordinary'
  }
  if (!active || !(latestIsTv || expensive.test(latest) || /^(?:loai )?thuong(?: a| nhe)?$/.test(latest) || /may thiet bi|bao nhieu thiet bi/.test(latest))) return undefined
  if (priceObjection && !type) return { reason: 'tv-ask-type', reply: 'Tivi nhà mình là tivi thông thường hay là tivi smart ạ?', missing: ['tv-type'] }
  if (priceObjection && type === 'smart') return { reason: 'tv-smart-app', reply: 'Dạ Smart TV thì mình có thể dùng app truyền hình, thêm 20k/tháng, kết nối tối đa 3 thiết bị ạ.', missing: [], addon: { kind: 'app', monthlyPrice: 20000, maxDevices: 3 } }
  return { reason: priceObjection ? 'tv-ordinary-box' : 'tv-initial-box', reply: priceObjection ? 'Dạ tivi thông thường thì mình dùng gói thêm 40k/tháng có đầu box tivi ạ.' : 'Dạ thêm 40k/tháng nữa là mình có đầu box tivi ạ.', missing: [], addon: { kind: 'box', monthlyPrice: 40000 } }
}
