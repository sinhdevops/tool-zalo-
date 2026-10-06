import type { NormalizedMessage } from '../domain/model.ts'

const chatReplacements: ReadonlyArray<readonly [RegExp, string]> = [
  [/\b(?:ko|kh|kg|hong|hông|khum)\b/giu, 'không'],
  [/\bk\b/giu, 'không'],
  [/(^|\s)bn(?=\s|$)/giu, '$1bao nhiêu'],
  [/(^|\s)j(?=\s|$)/giu, '$1gì'],
  [/(^|\s)r(?=\s|$)/giu, '$1rồi'],
  [/(^|\s)(?:dc|đc)(?=\s|$)/giu, '$1được'],
  [/\b(?:bth|bthw)\b/giu, 'bình thường'],
  [/(^|\s)(?:sdt|sđt)(?=\s|$)/giu, '$1số điện thoại'],
  [/\b(?:đki|dki|đky|dky)\b/giu, 'đăng ký'],
  [/\b(?:nt)\b/giu, 'nhắn tin'],
]

export function normalizeText(rawText: string) {
  let value = rawText.normalize('NFC').toLocaleLowerCase('vi-VN')
  value = value.replace(/[“”„‟]/gu, '"').replace(/[‘’]/gu, "'")
  value = value.replace(/[!?.,;:]+/gu, ' ')
  for (const [pattern, replacement] of chatReplacements) value = value.replace(pattern, replacement)
  return value.replace(/\s+/gu, ' ').trim()
}

export function foldVietnamese(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
}

export function normalizeMessage(rawText: string): NormalizedMessage {
  return { rawText, normalizedText: normalizeText(rawText) }
}
