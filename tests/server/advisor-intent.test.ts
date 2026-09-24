import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectIntents, resolveByPreviousQuestion } from '../../server/advisor/nlp/intent-detector.ts'
import { normalizeMessage, normalizeText } from '../../server/advisor/nlp/normalizer.ts'

test('phase 3 normalizer keeps raw text and normalizes common chat abbreviations', () => {
  const message = normalizeMessage('  Đóng từng tháng đc ko anh??  ')
  assert.equal(message.rawText, '  Đóng từng tháng đc ko anh??  ')
  assert.equal(message.normalizedText, 'đóng từng tháng được không anh')
  assert.equal(normalizeText('mạng bthw k cần mạnh'), 'mạng bình thường không cần mạnh')
})

test('phase 3 previous-question resolver handles short house and tv answers', () => {
  assert.equal(resolveByPreviousQuestion('thông thường thôi', 'HOUSE_TYPE')[0]?.intent, 'HOUSE_NORMAL')
  assert.equal(resolveByPreviousQuestion('smart', 'TV_TYPE')[0]?.intent, 'TV_SMART')
  assert.equal(resolveByPreviousQuestion('3', 'FLOOR_COUNT')[0]?.intent, 'PROVIDE_FLOOR_COUNT')
})

test('phase 3 same bare payment text changes meaning only with payment context', () => {
  const withoutContext = detectIntents('1 năm')
  assert.deepEqual(withoutContext.map(item => item.intent), ['UNCLEAR'])
  const withContext = detectIntents('1 năm', { lastBotQuestion: 'PAYMENT_TERM' })
  assert.equal(withContext[0]?.intent, 'SELECT_PAYMENT')
  assert.equal(withContext[0]?.source, 'PREVIOUS_QUESTION')
  assert.ok((withContext[0]?.confidence ?? 0) >= 0.85)
})

test('phase 3 detector supports multiple intents in one customer message', () => {
  const intents = detectIntents('Nhà tôi 3 tầng muốn gắn cam luôn').map(item => item.intent)
  assert.ok(intents.includes('PROVIDE_FLOOR_COUNT'))
  assert.ok(intents.includes('ASK_CAMERA'))
})

test('phase 3 detector covers core direct questions with high confidence', () => {
  for (const [text, expected] of [
    ['phí lắp nhiêu em', 'ASK_INSTALLATION_FEE'],
    ['lắp đặt có lâu không', 'ASK_INSTALLATION_TIME'],
    ['em đóng theo từng tháng đc không anh', 'ASK_MONTHLY_PAYMENT'],
    ['có tặng cam không', 'ASK_CAMERA'],
    ['tư vấn giúp mình gói phù hợp', 'ASK_RECOMMENDATION'],
    ['em lấy gói NETVT1', 'SELECT_PACKAGE'],
  ] as const) {
    const found = detectIntents(text).find(item => item.intent === expected)
    assert.ok(found, `${text} -> ${expected}`)
    assert.ok(found.confidence >= 0.85, `${text} confidence`)
  }
})

test('phase 3 chat-data dictionary learns wording without importing historical business facts', () => {
  const house = detectIntents('em ở nhà thông thường thôi')
  assert.equal(house.find(item => item.intent === 'HOUSE_NORMAL')?.source, 'DICTIONARY')
  const fee = detectIntents('Chi phí lắp đặt thế nào nhỉ')
  assert.ok(fee.some(item => item.intent === 'ASK_INSTALLATION_FEE'))
})

test('phase 3 camera opt-out is denial instead of a camera sales question', () => {
  const intents = detectIntents('em khỏi lấy camera').map(item => item.intent)
  assert.ok(intents.includes('DENY'))
  assert.ok(!intents.includes('ASK_CAMERA'))
})
