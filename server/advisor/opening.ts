import type { AdvisorInput, Draft, Region } from './types.ts'
import { priceSheets } from './price-sheets.ts'
export function openingSequence(state: NonNullable<AdvisorInput['outreach']>, region: Region): { phase: 'waiting' | 'active'; outgoing: NonNullable<Draft['outgoing']> } | undefined {
  if (state.phase === 'active') return undefined
  if (state.phase === 'new') return { phase: 'waiting', outgoing: [{ kind: 'text', text: 'Em xin chào ạ' }, { kind: 'text', text: 'Em bên Viettel Internet ạ' }] }
  if (state.event === 'setup') return { phase: 'waiting', outgoing: [] }
  if (region.value === 'unknown') return { phase: 'waiting', outgoing: [{ kind: 'text', text: 'Mình cho em xin khu vực lắp đặt để em gửi đúng bảng giá nhé.' }] }
  const sheets = priceSheets.filter(sheet => sheet.region === region.value)
  return { phase: 'active', outgoing: [
    ...sheets.map(sheet => ({ kind: 'image' as const, path: sheet.path, label: sheet.service === 'internet' ? 'Bảng giá Internet' : 'Bảng giá Internet + TV' })),
    { kind: 'text', text: 'Các gói cước internet, truyền hình bên em ạ' },
    { kind: 'text', text: 'Đóng 6 tháng thì ko tặng, Đóng cước 1 năm tặng 1 tháng. Phí hòa mạng chung cho tất cả các gói cước: 300k . Thiết bị bên em hỗ trợ miễn phí ạ' },
    { kind: 'text', text: 'Nhà mình nhà tầng hay nhà thông thường để em biết tư vấn đúng gói cho mình ạ' },
  ] }
}
