import { normalize } from './regions.ts'
export interface HomeNeeds { floors?: number; homeType?: 'single-storey' | 'room' | 'multi-storey'; strongNetwork?: boolean; unclearFloors?: boolean }
export interface Recommendation { plan?: string; devices?: number; reason: string }
/** Resolve abbreviated answers only against the immediately preceding advisor question. */
export function contextualHomeAnswer(answer: string, question: string): string | undefined {
  const prompt = normalize(question)
  if (!/nha/.test(prompt) || !/hay|may tang|bao nhieu tang/.test(prompt) || /tivi|smart|truyen hinh/.test(prompt)) return undefined
  const text = normalize(answer).replace(/^(?:da |vang )/, '').replace(/(?: thoi)?(?: a| nhe| nha)?$/, '').trim()
  if (/^(?:nha )?(?:thong thuong|binh thuong|thuong)$/.test(text)) return 'nhà cấp 4'
  if (/^(?:nha )?cap 4$/.test(text)) return 'nhà cấp 4'
  if (/^(?:phong )?tro$/.test(text)) return 'phòng trọ'
  if (/^(?:nha )?(?:tang|nhieu tang)$/.test(text)) return 'nhà tầng'
  if (/^(?:\d+|mot|hai|ba|bon|nam)(?: tang| lau)?$/.test(text)) return /tang|lau/.test(text) ? text : `${text} tầng`
  return undefined
}
export function readHomeNeeds(messages: string[], initial: HomeNeeds = {}): HomeNeeds {
  const needs = { ...initial }
  for (const message of messages) {
    const text = normalize(message).replace(/\bmot\b/g, '1').replace(/\bhai\b/g, '2').replace(/\bba\b/g, '3').replace(/\bbon\b/g, '4').replace(/\bnam\b/g, '5')
    if (/khong can (?:mang )?manh|mang binh thuong|nhu cau binh thuong/.test(text)) needs.strongNetwork = false
    else if (/can (?:mang )?manh|mang manh|toc do cao|mang nhanh/.test(text)) needs.strongNetwork = true
    // Do not interpret comparisons, questions, or negated descriptions as confirmed house facts.
    if (/\bneu\b|hay la|hoac|khong phai|ko phai|may tang|bao nhieu tang/.test(text)) continue
    const ground = text.match(/\b(?:1 )?tret\s*(?:va |voi )?(\d+) lau\b/)
    const counts = [...text.matchAll(/\b(\d+) (?:tang|lau)\b/g)].map(m => Number(m[1]))
    const floors = ground ? Number(ground[1]) + 1 : counts.length === 1 ? counts[0] : undefined
    if (/gac|lung|tum/.test(text) || new Set(counts).size > 1) { needs.floors = undefined; needs.unclearFloors = true; needs.homeType = 'multi-storey'; continue }
    if (floors !== undefined) {
      needs.floors = floors; needs.unclearFloors = floors < 1; needs.homeType = floors > 1 ? 'multi-storey' : 'single-storey'
    } else if (/nha cap 4|phong tro|o tro/.test(text)) {
      needs.homeType = /tro/.test(text) ? 'room' : 'single-storey'; needs.floors = 1; needs.unclearFloors = false
    } else if (/nha tang|nha nhieu tang/.test(text)) { needs.homeType = 'multi-storey'; needs.floors = undefined; needs.unclearFloors = true }
  }
  return needs
}
export function recommendPlan(needs: HomeNeeds): Recommendation {
  if (needs.unclearFloors) return { reason: 'clarify-floor-count' }
  const floors = needs.floors ?? (needs.homeType === 'room' || needs.homeType === 'single-storey' ? 1 : undefined)
  if (!floors) return { reason: 'missing-home-needs' }
  if (floors > 4) return { reason: 'more-than-four-floors', devices: floors }
  if (floors > 1) return { plan: `MESHVT${floors - 1}`, devices: floors, reason: 'one-device-per-floor' }
  return { plan: needs.strongNetwork ? 'NETVT2' : 'NETVT1', devices: 1, reason: needs.strongNetwork ? 'strong-network-request' : 'single-storey-default' }
}
