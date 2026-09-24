import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractEntities } from '../../server/advisor/nlp/entity-extractor.ts'

test('phase 4 extracts floor count including ground plus upper floors', () => {
  assert.deepEqual(extractEntities('Nhà 3 tầng').floors, 3)
  assert.deepEqual(extractEntities('Nhà một tầng').floors, 1)
  assert.deepEqual(extractEntities('Nhà 1 trệt 2 lầu').floors, 3)
  assert.deepEqual(extractEntities('Nhà 1 trệt 3 lầu').floors, 4)
  assert.equal(extractEntities('Nhà có gác lửng').floors, undefined)
})

test('phase 4 extracts normalized Vietnamese phone without treating IDs as phones', () => {
  assert.equal(extractEntities('SĐT em +84 900 000 000').phone, '0900000000')
  assert.equal(extractEntities('CCCD 123456789012').phone, undefined)
})

test('phase 4 payment entity requires a selection intent or payment-question context', () => {
  assert.equal(extractEntities('1 năm').paymentTerm, undefined)
  assert.equal(extractEntities('1 năm', { lastBotQuestion: 'PAYMENT_TERM' }).paymentTerm, '12_MONTHS')
  assert.equal(extractEntities('Dạ 6 tháng thôi ạ', { lastBotQuestion: 'PAYMENT_TERM' }).paymentTerm, '6_MONTHS')
  assert.equal(extractEntities('em đóng từng tháng').paymentTerm, 'MONTHLY')
  assert.equal(extractEntities('đóng từng tháng được không').paymentTerm, undefined)
})

test('phase 4 extracts selected package, house type and usage separately', () => {
  const entities = extractEntities('Nhà 3 tầng, mạng phải mạnh, em lấy MESHVT2')
  assert.equal(entities.floors, 3)
  assert.equal(entities.houseType, 'MULTI_FLOOR')
  assert.equal(entities.heavyUsage, true)
  assert.equal(entities.plan, 'MESHVT2')
})

test('phase 4 extracts location and full address only when wording supports it', () => {
  const labeled = extractEntities('Địa chỉ lắp đặt: 12/10 Trịnh Cương, Phường Hương Thủy - Thừa Thiên Huế')
  assert.match(labeled.locationText ?? '', /Trịnh Cương/)
  assert.equal(labeled.installationAddress, labeled.locationText)
  const area = extractEntities('Em ở Bình Thạnh')
  assert.equal(area.locationText, 'Bình Thạnh')
  assert.equal(area.installationAddress, undefined)
})

test('phase 4 records only CCCD receipt sides, never the document number', () => {
  const entities = extractEntities('Em gửi 2 mặt CCCD 123456789012')
  assert.deepEqual(entities.cccdSides, ['FRONT', 'BACK'])
  assert.ok(!Object.values(entities).includes('123456789012'))
})

test('phase 4 recognizes map/location receipt without storing the map as an address', () => {
  const entities = extractEntities('https://maps.app.goo.gl/eU3ynrHYBMJ3yXWq9?g_st=ic em gửi định vị đây')
  assert.equal(entities.locationPinReceived, true)
  assert.equal(entities.installationAddress, undefined)
})
