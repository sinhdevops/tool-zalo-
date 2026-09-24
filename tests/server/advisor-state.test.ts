import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  createConversationState,
  markOpeningSent,
  markOrderDone,
  startAfterCustomerInteraction,
  updateConversationState,
} from '../../server/advisor/state/conversation-state.ts'
import type { ConversationState } from '../../server/advisor/domain/model.ts'

test('phase 2 state starts with every closing slot missing', () => {
  const state = createConversationState('customer-1')
  assert.equal(state.stage, 'NEW')
  assert.equal(state.pricingImagesSent, false)
  assert.deepEqual(state.missingSlots, ['package', 'paymentTerm', 'address', 'phone', 'locationPin', 'cccdFront', 'cccdBack'])
})

test('phase 2 opening waits for interaction and never advances itself', () => {
  const waiting = markOpeningSent(createConversationState('customer-1'))
  assert.equal(waiting.stage, 'WAIT_CUSTOMER_INTERACTION')
  assert.equal(updateConversationState(waiting, { pricingImagesSent: true }).stage, 'WAIT_CUSTOMER_INTERACTION')
  assert.equal(startAfterCustomerInteraction(waiting).stage, 'DETERMINE_LOCATION')
})

test('phase 2 state keeps early facts and skips already collected closing slots later', () => {
  let state = startAfterCustomerInteraction(markOpeningSent(createConversationState('customer-1')))
  state = updateConversationState(state, {
    zone: 'OUTER',
    pricingImagesSent: true,
    entities: {
      houseType: 'NORMAL',
      floors: 1,
      phone: '0900000000',
      installationAddress: 'Địa chỉ test',
      locationPinReceived: true,
    },
    recommendedPlan: 'NETVT1',
    selectedPlan: 'NETVT1',
  })
  assert.equal(state.stage, 'SELECT_PAYMENT')
  assert.deepEqual(state.collectedSlots, ['package', 'address', 'phone', 'locationPin'])

  state = updateConversationState(state, { entities: { paymentTerm: '12_MONTHS' }, optionalServicesReviewed: true })
  assert.equal(state.stage, 'COLLECT_ID')
  assert.deepEqual(state.missingSlots, ['cccdFront', 'cccdBack'])
})

test('phase 2 state keeps the main stage during an interrupt intent', () => {
  const state = updateConversationState(
    { ...createConversationState('customer-1'), stage: 'DISCOVER_HOUSE' },
    { intents: ['ASK_CAMERA'], cameraInterested: true },
  )
  assert.equal(state.stage, 'DISCOVER_HOUSE')
  assert.equal(state.camera?.interested, true)
  assert.deepEqual(state.lastIntent, ['ASK_CAMERA'])
})

test('phase 2 pricing image flag and sensitive-document receipt are monotonic facts', () => {
  let state: ConversationState = { ...createConversationState('customer-1'), stage: 'COLLECT_ID' }
  state = updateConversationState(state, { pricingImagesSent: true, entities: { cccdSides: ['FRONT'] } })
  state = updateConversationState(state, { pricingImagesSent: false, entities: { cccdSides: ['BACK'] } })
  assert.equal(state.pricingImagesSent, true)
  assert.equal(state.customer?.cccdFrontReceived, true)
  assert.equal(state.customer?.cccdBackReceived, true)
  assert.equal(state.stage, 'READY_TO_ORDER')
  assert.deepEqual(state.missingSlots, ['package', 'paymentTerm', 'address', 'phone', 'locationPin'])
})

test('phase 2 order can finish only from READY_TO_ORDER', () => {
  const start = createConversationState('customer-1')
  assert.equal(markOrderDone(start).stage, 'NEW')
  assert.equal(markOrderDone({ ...start, stage: 'READY_TO_ORDER' }).stage, 'DONE')
})
