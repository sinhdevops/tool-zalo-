import type { AdvisorIntent } from '../domain/model.ts'

export interface IntentPhraseGroup {
  intent: AdvisorIntent
  phrases: readonly string[]
  source: 'CURATED' | 'CHAT_DATA'
}

/**
 * CHAT_DATA phrases are redacted examples mined from the encrypted local .data
 * archive. They teach wording only; they contain no prices or policy facts.
 */
export const intentPhraseGroups: readonly IntentPhraseGroup[] = [
  { intent: 'HOUSE_ROOM', source: 'CHAT_DATA', phrases: ['em ở trọ', 'phòng trọ', 'ở trọ'] },
  { intent: 'HOUSE_NORMAL', source: 'CHAT_DATA', phrases: ['nhà cấp 4', 'nhà mình nhà cấp 4 thôi', 'em ở nhà thông thường thôi', 'nhà thường ạ'] },
  { intent: 'ASK_CAMERA', source: 'CHAT_DATA', phrases: ['có bán camera luôn không a', 'tặng 1 camera ak', 'có tặng cam không', 'cam có free không'] },
  { intent: 'ASK_INSTALLATION_FEE', source: 'CHAT_DATA', phrases: ['chi phí lắp đặt thế nào nhỉ', '300 là phí lắp đặt em ha', '300k này là phí lắp đặt hả a', 'phí hòa mạng là sao a'] },
  { intent: 'ASK_INSTALLATION_TIME', source: 'CHAT_DATA', phrases: ['ok e cho a hoi minh lap dat tai nhà lau không e', 'lắp đặt tại nhà lâu không', 'lắp mạng mất bao lâu'] },
  { intent: 'ASK_MONTHLY_PAYMENT', source: 'CHAT_DATA', phrases: ['em đóng theo từng tháng được không anh', 'đóng từng tháng được không'] },
  { intent: 'NEED_FAST_INTERNET', source: 'CHAT_DATA', phrases: ['mạng phải mạnh nha', 'nhà nhiều thiết bị dùng mạng lắm', 'cần mạng mạnh'] },
  { intent: 'SELECT_PACKAGE', source: 'CHAT_DATA', phrases: ['dạ cho em đăng ký gói netvt1 được ạ', 'em muốn sử dụng netvt1'] },
  { intent: 'ASK_PACKAGE', source: 'CURATED', phrases: ['gói nào', 'có gói gì', 'các gói mạng'] },
  { intent: 'ASK_RECOMMENDATION', source: 'CURATED', phrases: ['tư vấn giúp mình', 'gói nào phù hợp', 'tư vấn gói phù hợp'] },
] as const
