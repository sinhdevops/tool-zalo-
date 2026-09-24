import { normalize } from './regions.ts'

export interface ConversationContextAdvice {
  action: 'draft' | 'handoff'
  reason: string
  reply: string
  missing?: string[]
}

/**
 * Stable conversational rules distilled from real operator/customer chats.
 * Monetary values stay in the dedicated pricing/policy modules so historical
 * chat prices can never override the current approved catalog.
 */
export function adviseConversationContext(text: string, hasAddress = false): ConversationContextAdvice | undefined {
  const value = normalize(text)

  if (/mat (?:mang|internet)|khong (?:vao|dung) duoc (?:mang|wifi|internet)|k (?:vao|dung) duoc (?:mang|wifi|internet)|mang (?:yeu|lag|chap chon|co van de)|wifi.*(?:loi|mat mang)/.test(value)) {
    return { action: 'handoff', reason: 'existing-service-support', reply: 'Dạ trường hợp đường truyền đang lỗi hoặc mất mạng, mình gọi 18008119 giúp em để kỹ thuật kiểm tra trực tiếp ạ.' }
  }

  if (/doi ten (?:wifi|wi-fi)|doi mat khau (?:wifi|wi-fi)|quen mat khau (?:wifi|wi-fi)/.test(value)) {
    return { action: 'draft', reason: 'wifi-name-password-support', reply: 'Dạ mình gọi 18008119 giúp em, tổng đài hỗ trợ đổi tên Wi-Fi hoặc mật khẩu cho mình ạ.' }
  }

  if (/(?:co|con) ha tang|kiem tra ha tang|khao sat|co keo duoc|keo duoc khong|co lap duoc|lap duoc khong|het cong|xa tru|xa cot/.test(value)) {
    return hasAddress
      ? { action: 'handoff', reason: 'infrastructure-check-required', reply: 'Dạ để em kiểm tra hạ tầng đúng địa chỉ và định vị nhà mình trước rồi mới xác nhận lắp được ạ.' }
      : { action: 'draft', reason: 'infrastructure-needs-address', reply: 'Dạ mình gửi giúp em địa chỉ cụ thể và định vị nhà cần lắp để em kiểm tra hạ tầng ạ.', missing: ['address', 'installation-location'] }
  }

  if (/(?:dang dung|dang xai|dang sai) (?:fpt|vnpt)|doi (?:tu )?(?:fpt|vnpt) (?:qua|sang) viettel|chuyen (?:tu )?(?:fpt|vnpt) (?:qua|sang) viettel/.test(value)) {
    return { action: 'draft', reason: 'switch-provider-without-interruption', reply: 'Dạ mình cứ dùng mạng hiện tại trước ạ. Bên em lắp Viettel xong rồi mình báo hủy mạng cũ để tránh bị gián đoạn Internet.' }
  }

  if (/(?:dang dung|dang xai|dang sai) viettel|viettel.*(?:lap them|them duong)|(?:lap them|them) (?:1 |mot )?duong.*viettel/.test(value)) {
    return { action: 'handoff', reason: 'existing-viettel-line-review', reply: 'Dạ địa chỉ mình đang có đường truyền Viettel rồi thì em cần kiểm tra trên hệ thống trước khi tư vấn lắp thêm hoặc đổi đường truyền ạ.' }
  }

  if (/(?:co|kem|bao gom).*(?:day mang|day lan|vat tu)|(?:day mang|day lan|vat tu).*(?:co|mien phi|tinh phi)|thiet bi.*mien phi/.test(value)) {
    return { action: 'draft', reason: 'installation-materials-included', reply: 'Dạ thiết bị, dây và công lắp bên em hỗ trợ miễn phí ạ. Phí hòa mạng lắp mới là 300k.' }
  }

  if (/hop dong.*(?:online|dien tu)|hop dong la gi|hop dong nhu nao/.test(value)) {
    return { action: 'draft', reason: 'electronic-contract', reply: 'Dạ bên em làm hợp đồng điện tử ạ.' }
  }

  if (/ma hop dong|ma hd|tra (?:cuu )?hop dong|xem hop dong/.test(value)) {
    return { action: 'handoff', reason: 'contract-lookup-required', reply: 'Dạ để em kiểm tra thông tin hợp đồng trên hệ thống rồi báo lại mình ạ.' }
  }

  if (/ky thuat.*(?:goi|lien he).*(?:truoc|khong)|(?:goi|lien he).*truoc.*ky thuat/.test(value)) {
    return { action: 'draft', reason: 'technician-calls-before-arrival', reply: 'Dạ khi kỹ thuật qua lắp sẽ gọi báo trước cho mình, thường khoảng 30 phút ạ.' }
  }

  if (/gia han|het ky cuoc|den ky cuoc|het (?:6|12) thang/.test(value)) {
    return { action: 'draft', reason: 'renewal-guidance', reply: 'Dạ khi hết kỳ cước thấy tin nhắn báo về thì mình nhắn em để gia hạn lại nhé.' }
  }

  const mesh = value.match(/\bmeshvt([123])\b/)
  if (mesh && /may (?:cuc|thiet bi|modem)|bao nhieu (?:cuc|thiet bi|modem)|gom.*(?:cuc|thiet bi|modem)|thiet bi.*khac/.test(value)) {
    const extras = Number(mesh[1])
    return { action: 'draft', reason: 'mesh-device-count', reply: `Dạ MESHVT${extras} có tổng ${extras + 1} thiết bị phát Wi-Fi: 1 thiết bị chính và ${extras} thiết bị Mesh phụ ạ.` }
  }

  if (/netvt2.*meshvt2|meshvt2.*netvt2/.test(value) && /toc do|manh|nhanh|khac nhau|khac gi/.test(value)) {
    return { action: 'draft', reason: 'netvt2-meshvt2-difference', reply: 'Dạ NETVT2 và MESHVT2 cùng nhóm mạng mạnh. MESHVT2 có thêm 2 thiết bị Mesh phụ để phủ sóng tốt hơn, tổng 3 thiết bị ạ.' }
  }

  if (/300\s*mbps.*khong gioi han|khong gioi han.*300\s*mbps/.test(value)) {
    return { action: 'draft', reason: 'speed-tier-explanation', reply: 'Dạ 300Mbps là tốc độ của gói NETVT1, phù hợp nhu cầu gia đình thông thường. Nếu mình cần mạng mạnh hơn thì em tư vấn nhóm NETVT2 ạ.' }
  }

  return undefined
}
