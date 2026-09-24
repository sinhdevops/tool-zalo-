import { readFileSync } from 'node:fs'
import type { Knowledge, Region } from './types.ts'
interface City { aliases: string[]; legacyInnerDistricts: string[]; legacyOuterDistricts: string[]; entries: { name: string; region: string; era: string }[] }
const data = JSON.parse(readFileSync(new URL('../../shared/data/pricing-localities.json', import.meta.url), 'utf8')) as { cities: City[] }
export const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/\bq\s*\.?\s*(\d+)\b/g, 'quan $1').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ')
const contains = (text: string, word: string) => ` ${text} `.includes(` ${normalize(word)} `)
const bare = (name: string) => normalize(name).replace(/^(quan|huyen|thi xa|thanh pho|phuong|xa|thi tran) /, '')
export function classifyAddress(address: string, knowledge: Knowledge): Region {
  const text = normalize(address)
  if (!text) return { value: 'unknown', matched: [], verified: false, reason: 'missing-address' }
  const outer = (matched: string[] = [], reason = 'outer-by-user-default'): Region => ({ value: 'outer', matched, verified: true, reason })
  const cities = data.cities.filter(c => c.aliases.some(a => contains(text, a)))
  if (cities.length > 1) return outer([], 'conflicting-city-default-outer')
  if (knowledge.confirmedOuterProvinces.some(p => contains(text, p))) return outer([], 'configured-outer-province')
  const pool = cities.length ? cities : data.cities
  const segments = address.split(/[,;+\n]/).map(normalize)
  const matches = (name: string, kind: 'district' | 'ward') => {
    const n = bare(name)
    if (/^\d+$/.test(n)) return kind === 'district' && contains(text, `quan ${n}`)
    if (segments.some(s => s === n || s === normalize(name))) return true
    if (contains(text, `${kind === 'ward' ? 'phuong' : 'quan'} ${n}`) || contains(text, `${kind === 'ward' ? 'xa' : 'huyen'} ${n}`)) return true
    // Accept a bare named locality within an address, but not a street carrying its name.
    return contains(text, n) && !contains(text, `duong ${n}`) && !contains(text, `pho ${n}`)
  }
  const districtInner = pool.flatMap(c => c.legacyInnerDistricts).filter(n => matches(n,'district'))
  const districtOuter = pool.flatMap(c => c.legacyOuterDistricts).filter(n => matches(n,'district'))
  if (districtOuter.length) return outer(districtOuter, 'outer-district-match')
  if (districtInner.length) return { value: 'inner', matched: districtInner, verified: true, reason: 'inner-district-match' }
  const matched = pool.flatMap(c => c.entries).filter(e => matches(e.name,'ward'))
  const inner = matched.filter(e => e.region === 'inner')
  if (inner.length) return { value: 'inner', matched: [...new Set(inner.map(e => e.name))], verified: true, reason: 'inner-ward-match' }
  return outer()
}
