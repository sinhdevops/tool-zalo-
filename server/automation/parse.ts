import { vietnamesePhones } from '../../shared/phone.ts'

export const phones = vietnamesePhones
export function orderFields(text: string) {
  const field = (label: string) => text.match(new RegExp(`^\\s*${label}\\s*:\\s*(.+)$`, 'imu'))?.[1]?.trim() ?? ''
  return { name: field('Tên khách hàng'), address: field('Địa chỉ(?: lắp đặt)?'), plan: field('Gói cước(?: tư vấn)?') }
}
