export function phones(text: string): string[] {
  const matches = text.match(/(?<![\d\p{L}])(?:\+84|84|0)(?:[ .-]*\d){9}(?![\d\p{L}])/gu) ?? []
  return [...new Set(matches.map((value) => value.replace(/[ .-]/g, '').replace(/^\+?84/, '0')).filter((value) => /^0[35789]\d{8}$/.test(value)))]
}
export function orderFields(text: string) {
  const field = (label: string) => text.match(new RegExp(`^\\s*${label}\\s*:\\s*(.+)$`, 'imu'))?.[1]?.trim() ?? ''
  return { name: field('Tên khách hàng'), address: field('Địa chỉ(?: lắp đặt)?'), plan: field('Gói cước(?: tư vấn)?') }
}
