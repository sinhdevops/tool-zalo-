import type { Region } from './types.ts'

// Verified visually against the supplied images after the filenames were corrected.
export const priceSheets = [
  { id: 'inner-internet', region: 'inner', service: 'internet', path: '/images/noi-thanh.jpg', prices: { NETVT1: 235000, NETVT2: 265000, MESHVT1: 255000, MESHVT2: 289000, MESHVT3: 359000 } },
  { id: 'inner-tv', region: 'inner', service: 'internet-tv', path: '/images/noi-thanh-tivi.jpg', prices: { NETVT1: 275000, NETVT2: 305000, MESHVT1: 295000, MESHVT2: 329000, MESHVT3: 399000 } },
  { id: 'outer-internet', region: 'outer', service: 'internet', path: '/images/ngoai-thanh.jpg', prices: { NETVT1: 195000, NETVT2: 240000, MESHVT1: 210000, MESHVT2: 245000, MESHVT3: 299000 } },
  { id: 'outer-tv', region: 'outer', service: 'internet-tv', path: '/images/ngoai-thanh-tivi.jpg', prices: { NETVT1: 235000, NETVT2: 280000, MESHVT1: 250000, MESHVT2: 285000, MESHVT3: 339000 } },
] as const
export function selectPriceSheet(region: Region, service?: 'internet' | 'internet-tv') {
  if (!region.verified || region.value === 'unknown' || !service) return undefined
  return priceSheets.find(sheet => sheet.region === region.value && sheet.service === service)
}
