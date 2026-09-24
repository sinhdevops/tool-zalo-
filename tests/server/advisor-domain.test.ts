import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  advisorActions,
  advisorIntents,
  closingSlots,
  conversationStages,
  type ConversationState,
  type DecisionTrace,
} from '../../server/advisor/domain/model.ts'

test('phase 1 domain model exposes the complete conversation stages', () => {
  assert.deepEqual(conversationStages, [
    'NEW',
    'WAIT_CUSTOMER_INTERACTION',
    'DETERMINE_LOCATION',
    'SEND_PRICE_TABLE',
    'DISCOVER_HOUSE',
    'RECOMMEND_PACKAGE',
    'PACKAGE_SELECTED',
    'SELECT_PAYMENT',
    'OPTIONAL_SERVICES',
    'COLLECT_ADDRESS',
    'COLLECT_PHONE',
    'COLLECT_LOCATION',
    'COLLECT_ID',
    'READY_TO_ORDER',
    'DONE',
  ])
})

test('phase 1 domain model includes all required v1 intents and actions', () => {
  for (const intent of [
    'GREETING', 'ASK_PRICE', 'ASK_RECOMMENDATION', 'PROVIDE_LOCATION', 'HOUSE_NORMAL',
    'PROVIDE_FLOOR_COUNT', 'NEED_FAST_INTERNET', 'ASK_MONTHLY_PAYMENT', 'SELECT_PAYMENT',
    'ASK_INSTALLATION_FEE', 'ASK_INSTALLATION_TIME', 'ASK_TV', 'TV_TOO_EXPENSIVE',
    'ASK_CAMERA', 'SELECT_PACKAGE', 'PROVIDE_ADDRESS', 'PROVIDE_PHONE', 'PROVIDE_LOCATION_PIN',
    'PROVIDE_CCCD_FRONT', 'PROVIDE_CCCD_BACK', 'AFFIRM', 'DENY', 'UNCLEAR',
  ]) assert.ok(advisorIntents.includes(intent as typeof advisorIntents[number]), intent)

  for (const action of [
    'ANSWER_INSTALLATION_FEE', 'ANSWER_INSTALLATION_TIME', 'ANSWER_CAMERA', 'ANSWER_TV',
    'RECOMMEND_PACKAGE', 'ASK_LOCATION', 'ASK_HOUSE_TYPE', 'ASK_PAYMENT', 'ASK_ADDRESS',
    'ASK_PHONE', 'ASK_LOCATION_PIN', 'ASK_CCCD', 'SEND_PRICING_IMAGES',
    'APPLY_RETENTION_DISCOUNT', 'COMPLETE_ORDER',
  ]) assert.ok(advisorActions.includes(action as typeof advisorActions[number]), action)
})

test('phase 1 closing slots match the sales completion contract', () => {
  assert.deepEqual(closingSlots, ['package', 'paymentTerm', 'address', 'phone', 'locationPin', 'cccdFront', 'cccdBack'])
})

test('phase 1 state and trace can represent a context-aware decision', () => {
  const state: ConversationState = {
    conversationId: 'test-conversation',
    stage: 'DISCOVER_HOUSE',
    pricingImagesSent: true,
    optionalServicesReviewed: false,
    lastBotQuestion: 'HOUSE_TYPE',
    lastIntent: ['PROVIDE_LOCATION'],
    collectedSlots: [],
    missingSlots: [...closingSlots],
  }
  const trace: DecisionTrace = {
    input: { rawText: 'thông thường thôi', normalizedText: 'thông thường thôi' },
    previousQuestion: 'HOUSE_TYPE',
    intents: [{ intent: 'HOUSE_NORMAL', confidence: 0.99, source: 'PREVIOUS_QUESTION' }],
    entities: { houseType: 'NORMAL' },
    stateBefore: state,
    stateAfter: { ...state, house: { type: 'NORMAL', floors: 1 }, stage: 'RECOMMEND_PACKAGE' },
    matchedRules: [{ id: 'package.normal', category: 'PACKAGE' }],
    decision: { action: 'RECOMMEND_PACKAGE', reason: 'normal-house' },
    templateId: 'recommend.netvt1',
    finalResponse: 'Dạ nhà mình dùng gói NETVT1 là phù hợp ạ.',
  }
  assert.equal(trace.intents[0]?.intent, 'HOUSE_NORMAL')
  assert.equal(trace.stateAfter.house?.type, 'NORMAL')
  assert.equal(trace.decision.action, 'RECOMMEND_PACKAGE')
})
