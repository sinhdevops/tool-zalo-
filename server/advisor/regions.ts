import { readFileSync } from 'node:fs'
import type { Knowledge, Region } from './types.ts'
const data = JSON.parse(readFileSync(new URL('../../shared/data/pricing-regions.json', import.meta.url), 'utf8').replace(/^\uFEFF/, '')) as { cities: { id: string; aliases: string[]; legacyInnerDistricts: string[]; legacyOuterDistricts: string[] }[] }
export const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/\bq\s*\.?\s*(\d+)\b/g, 'quan $1').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ')
const contains = (text: string, word: string) => ` ${text} `.includes(` ${normalize(word)} `)
export function classifyAddress(address: string, knowledge: Knowledge): Region {
  const text = normalize(address)
  const cities = data.cities.filter(city => city.aliases.some(alias => contains(text, alias)))
  const outer = knowledge.confirmedOuterProvinces.filter(province => contains(text, province))
  const unknown = (reason: string): Region => ({ value: 'unknown', matched: [], verified: false, reason })
  if (!text) return unknown('missing-address')
  if (cities.length > 1 || (cities.length && outer.length)) return unknown('conflicting-city')
  if (!cities.length) return outer.length ? { value: 'outer', matched: outer, verified: true, reason: 'configured-outer-province' } : unknown('unrecognized-city')
  const city = cities[0]!
  // Districts must be an address segment or carry an explicit district marker.
  // A street named Thanh Xuan must not turn an unknown ward into an inner district.
  const segments = address.split(/[,;+\n]/).map(normalize)
  const isDistrict = (name: string) => {
    const n = normalize(name)
    return n.startsWith('quan ') ? contains(text, n) : segments.some(s => s === n || s.startsWith(`${n} `) && city.aliases.some(a => s === `${n} ${normalize(a)}`)) || contains(text, `quan ${n}`) || contains(text, `huyen ${n}`) || contains(text, `thi xa ${n}`)
  }
  const inner = city.legacyInnerDistricts.filter(isDistrict), outside = city.legacyOuterDistricts.filter(isDistrict)
  if (inner.length && outside.length) return unknown('conflicting-district')
  if (!inner.length && !outside.length) return unknown('missing-or-new-district')
  return { value: inner.length ? 'inner' : 'outer', matched: [...inner, ...outside], verified: knowledge.regionRulesApproved, reason: knowledge.regionRulesApproved ? 'approved-district-table' : 'district-table-needs-approval' }
}
