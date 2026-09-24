import { createDecipheriv } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'

type StoredMessage = {
  id: string
  threadId: string
  type: 'personal' | 'group'
  senderName?: string
  self: boolean
  text?: string
  timestamp: number
}

type StoredConversation = { id: string; type: 'personal' | 'group'; name?: string }

const dataDir = path.resolve('.data')
const key = readFileSync(path.join(dataDir, 'chat.key'))
const db = new DatabaseSync(path.join(dataDir, 'chat.sqlite'), { readOnly: true })

function decrypt<T>(value: unknown): T | undefined {
  try {
    const content = Buffer.from(value as Uint8Array)
    const decipher = createDecipheriv('aes-256-gcm', key, content.subarray(0, 12))
    decipher.setAuthTag(content.subarray(12, 28))
    return JSON.parse(Buffer.concat([decipher.update(content.subarray(28)), decipher.final()]).toString('utf8')) as T
  } catch { return undefined }
}

function norm(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/\s+/g, ' ').trim()
}

function redact(value: string) {
  return value
    .replace(/(?:\+?84|0)[\s.-]?(?:\d[\s.-]?){8,10}\d/g, '[SĐT]')
    .replace(/\b\d{9,16}\b/g, '[ID]')
    .replace(/\s+/g, ' ')
    .trim()
}

const categories: Array<[string, RegExp]> = [
  ['greeting', /\b(chao|hello|hi|alo|anh oi|chi oi|em oi)\b/],
  ['technical-support', /mat (?:internet|mang)|mang (?:yeu|lag|khong dung|k dung|co van de)|wifi.*(?:khong dung|k dung|mat|loi)|doi ten.*wifi|doi mat khau/],
  ['infrastructure', /ha tang|het cong|tru|cot|khao sat|keo duoc|keo dc|xa.*(?:tru|cot)|hon 200m/],
  ['existing-provider', /dang dung (?:viettel|fpt|vnpt)|dang xai (?:viettel|fpt|vnpt)|doi qua viettel|chuyen qua viettel|huy.*(?:fpt|vnpt|viettel)|lap them.*duong/],
  ['installation-materials', /day mang|vat tu|modem|thiet bi.*mien phi|mien phi.*thiet bi|day.*mien phi|tho.*mien phi/],
  ['contract', /hop dong|ma hd|ma hop dong|tra.*hop dong/],
  ['renewal', /gia han|het ky cuoc|het cuoc|den han/],
  ['installation-process', /ky thuat.*goi|goi truoc.*30|len he thong|nhan viec|tho.*qua|ky thuat.*qua/],
  ['installation-fee', /phi (lap|hoa mang|ban dau)|mat phi.*lap|lap.*mat phi/],
  ['installation-time', /lap.*(bao lau|may phut|nhanh|lau)|khi nao.*lap|bao gio.*lap/],
  ['price', /gia|bao nhieu|cuoc|thang bao nhieu|goi.*k\b/],
  ['promotion', /khuyen mai|uu dai|tang.*thang|mien phi|free|giam/],
  ['billing-term', /dong.*thang|6 thang|sau thang|12 thang|1 nam|mot nam|tung thang|hang thang/],
  ['house-type', /nha (cap 4|tang|may tang|thong thuong)|phong tro|o tro|lau|tret|gac|lung/],
  ['speed-plan', /mang manh|toc do|mbps|netvt|meshvt|goi nao|goi gi|phu hop/],
  ['tv', /tivi|ti vi|truyen hinh|smart tv|dau box|app/],
  ['camera', /camera|cam\b|xoay|ngoai troi/],
  ['wifi-coverage', /phu song|song wifi|wifi.*tang|mesh|bo phat|cuc phat/],
  ['address-region', /dia chi|o dau|khu vuc|quan|huyen|phuong|xa|thon|hcm|ha noi|da nang|hue/],
  ['signup', /dang ky|dang ki|chot|lap mang|lap wifi|lay goi/],
  ['phone', /so dien thoai|sdt|lien he/],
  ['location-pin', /dinh vi|vi tri|location|map/],
  ['identity', /cccd|can cuoc|mat truoc|mat sau/],
  ['payment', /chuyen khoan|thanh toan|stk|tai khoan|bill/],
  ['complaint-objection', /dat|mac|khong|ko |k |yeu|lag|chap chon|lua dao|huy/],
]

function category(text: string) {
  const value = norm(text)
  return categories.find(([, re]) => re.test(value))?.[0] ?? 'other'
}

const conversationRows = db.prepare('SELECT account, body FROM conversations').all() as Array<{ account: string; body: Uint8Array }>
const conversations = conversationRows.flatMap((row) => {
  const body = decrypt<StoredConversation>(row.body)
  return body ? [{ account: row.account, ...body }] : []
})
const nameByThread = new Map<string, string>(conversations.map(c => [`${c.account}:${c.type}:${c.id}`, c.name || '']))

const messageRows = db.prepare('SELECT account, at, body FROM messages ORDER BY account, at').all() as Array<{ account: string; at: number; body: Uint8Array }>
const messages = messageRows.flatMap((row) => {
  const body = decrypt<StoredMessage>(row.body)
  return body ? [{ account: row.account, ...body }] : []
})

const personal = messages.filter(m => m.type === 'personal' && (m.text?.trim() || '').length > 0)
const groups = new Map<string, typeof personal>()
for (const m of personal) {
  const keyName = `${m.account}:personal:${m.threadId}`
  const list = groups.get(keyName) ?? []
  list.push(m)
  groups.set(keyName, list)
}

type Turn = { self: boolean; text: string; at: number }
type Pair = { category: string; customer: string; operator: string; thread: string }
const pairs: Pair[] = []
for (const [thread, list] of groups) {
  list.sort((a, b) => a.timestamp - b.timestamp)
  const turns: Turn[] = []
  for (const m of list) {
    const text = m.text?.trim()
    if (!text) continue
    const previous = turns.at(-1)
    if (previous && previous.self === m.self && m.timestamp - previous.at <= 5 * 60_000) {
      previous.text += `\n${text}`
      previous.at = m.timestamp
    } else turns.push({ self: m.self, text, at: m.timestamp })
  }
  for (let i = 0; i < turns.length - 1; i++) {
    if (turns[i]!.self || !turns[i + 1]!.self) continue
    const customer = redact(turns[i]!.text)
    const operator = redact(turns[i + 1]!.text)
    if (!customer || !operator) continue
    pairs.push({ category: category(customer), customer, operator, thread: nameByThread.get(thread) || thread.slice(-12) })
  }
}

const counts = new Map<string, number>()
for (const pair of pairs) counts.set(pair.category, (counts.get(pair.category) ?? 0) + 1)
const topCategories = [...counts.entries()].sort((a, b) => b[1] - a[1])

console.log(JSON.stringify({
  totals: {
    conversations: conversations.length,
    personalConversations: conversations.filter(c => c.type === 'personal').length,
    storedMessages: messages.length,
    personalTextMessages: personal.length,
    customerOperatorPairs: pairs.length,
  },
  categories: topCategories,
  examples: Object.fromEntries(topCategories.map(([name]) => [name, pairs.filter(p => p.category === name).slice(0, name === 'other' ? 80 : 20).map(({ customer, operator }) => ({ customer, operator }))])),
}, null, 2))

db.close()
