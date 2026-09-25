import {
  closingSlots,
  type AdvisorEntities,
  type AdvisorIntent,
  type BotQuestionKind,
  type ClosingSlot,
  type ConversationStage,
  type ConversationState,
  type PricingZone,
} from '../domain/model.ts'

export interface ConversationStateUpdate {
  stage?: ConversationStage
  intents?: AdvisorIntent[]
  entities?: AdvisorEntities
  zone?: PricingZone
  recommendedPlan?: string
  selectedPlan?: string
  pricingImagesSent?: boolean
  optionalServicesReviewed?: boolean
  televisionInterested?: boolean
  televisionSelected?: boolean
  cameraInterested?: boolean
  cameraSelected?: boolean
  lastBotQuestion?: BotQuestionKind
}

export function createConversationState(conversationId: string): ConversationState {
  return {
    conversationId,
    stage: 'NEW',
    pricingImagesSent: false,
    optionalServicesReviewed: false,
    collectedSlots: [],
    missingSlots: [...closingSlots],
  }
}

function collectedSlots(state: ConversationState): ClosingSlot[] {
  const collected: ClosingSlot[] = []
  if (state.package?.selected) collected.push('package')
  if (state.payment?.term) collected.push('paymentTerm')
  if (state.customer?.installationAddress) collected.push('address')
  if (state.customer?.phone) collected.push('phone')
  if (state.customer?.locationReceived) collected.push('locationPin')
  if (state.customer?.cccdFrontReceived) collected.push('cccdFront')
  if (state.customer?.cccdBackReceived) collected.push('cccdBack')
  return collected
}

export function refreshClosingSlots(state: ConversationState): ConversationState {
  const collected = collectedSlots(state)
  return {
    ...state,
    collectedSlots: collected,
    missingSlots: closingSlots.filter(slot => !collected.includes(slot)),
  }
}

function hasResolvedHouse(state: ConversationState) {
  if (!state.house || state.house.type === 'UNKNOWN') return false
  if (state.house.type === 'MULTI_FLOOR') return Boolean(state.house.floors)
  return true
}

/**
 * Advances only through stages whose required facts are already known.
 * NEW and WAIT_CUSTOMER_INTERACTION require an explicit external event, so
 * they never advance implicitly from stale history.
 */
export function reconcileConversationStage(input: ConversationState): ConversationState {
  const state = refreshClosingSlots(input)
  let stage = state.stage
  for (let guard = 0; guard < 20; guard += 1) {
    const previous = stage
    switch (stage) {
      case 'NEW':
      case 'WAIT_CUSTOMER_INTERACTION':
      case 'DONE':
        return { ...state, stage }
      case 'DETERMINE_LOCATION':
        if (state.location?.zone === 'INNER' || state.location?.zone === 'OUTER') stage = 'SEND_PRICE_TABLE'
        break
      case 'SEND_PRICE_TABLE':
        if (state.pricingImagesSent) stage = 'DISCOVER_HOUSE'
        break
      case 'DISCOVER_HOUSE':
        if (hasResolvedHouse(state)) stage = 'RECOMMEND_PACKAGE'
        break
      case 'RECOMMEND_PACKAGE':
        if (state.package?.selected) stage = 'PACKAGE_SELECTED'
        break
      case 'PACKAGE_SELECTED':
        stage = 'SELECT_PAYMENT'
        break
      case 'SELECT_PAYMENT':
        if (state.payment?.term) stage = 'OPTIONAL_SERVICES'
        break
      case 'OPTIONAL_SERVICES':
        if (state.optionalServicesReviewed) stage = 'COLLECT_ADDRESS'
        break
      case 'COLLECT_ADDRESS':
        if (state.customer?.installationAddress) stage = 'COLLECT_PHONE'
        break
      case 'COLLECT_PHONE':
        if (state.customer?.phone) stage = 'COLLECT_LOCATION'
        break
      case 'COLLECT_LOCATION':
        if (state.customer?.locationReceived) stage = 'COLLECT_ID'
        break
      case 'COLLECT_ID':
        if (state.customer?.cccdFrontReceived && state.customer.cccdBackReceived) stage = 'READY_TO_ORDER'
        break
      case 'READY_TO_ORDER':
        return { ...state, stage }
    }
    if (stage === previous) return { ...state, stage }
  }
  return { ...state, stage }
}

/** Applies extracted facts without interpreting business policy. */
export function updateConversationState(current: ConversationState, update: ConversationStateUpdate): ConversationState {
  const entities = update.entities ?? {}
  const next: ConversationState = {
    ...current,
    stage: update.stage ?? current.stage,
    pricingImagesSent: current.pricingImagesSent || Boolean(update.pricingImagesSent),
    optionalServicesReviewed: current.optionalServicesReviewed || Boolean(update.optionalServicesReviewed),
    lastIntent: update.intents ? [...update.intents] : current.lastIntent,
    lastBotQuestion: update.lastBotQuestion ?? current.lastBotQuestion,
    location: (entities.locationText !== undefined || update.zone !== undefined || current.location)
      ? {
          ...current.location,
          raw: entities.locationText ?? current.location?.raw,
          zone: update.zone ?? current.location?.zone,
        }
      : undefined,
    house: (entities.houseType !== undefined || entities.floors !== undefined || entities.heavyUsage !== undefined || current.house)
      ? {
          ...current.house,
          type: entities.houseType ?? current.house?.type,
          floors: entities.floors ?? current.house?.floors,
          heavyUsage: entities.heavyUsage ?? current.house?.heavyUsage,
        }
      : undefined,
    package: (update.recommendedPlan !== undefined || update.selectedPlan !== undefined || entities.plan !== undefined || current.package)
      ? {
          ...current.package,
          recommended: update.recommendedPlan ?? current.package?.recommended,
          selected: update.selectedPlan ?? entities.plan ?? current.package?.selected,
        }
      : undefined,
    payment: (entities.paymentTerm !== undefined || current.payment)
      ? { ...current.payment, term: entities.paymentTerm ?? current.payment?.term }
      : undefined,
    television: (update.televisionInterested !== undefined || update.televisionSelected !== undefined || entities.televisionType !== undefined || current.television)
      ? {
          ...current.television,
          interested: update.televisionInterested ?? current.television?.interested,
          selected: update.televisionSelected ?? current.television?.selected,
          type: entities.televisionType ?? current.television?.type,
        }
      : undefined,
    camera: (update.cameraInterested !== undefined || update.cameraSelected !== undefined || current.camera)
      ? {
          ...current.camera,
          interested: update.cameraInterested ?? current.camera?.interested,
          selected: update.cameraSelected ?? current.camera?.selected,
        }
      : undefined,
    customer: (entities.phone !== undefined || entities.installationAddress !== undefined || entities.locationPinReceived !== undefined || entities.cccdSides !== undefined || current.customer)
      ? {
          ...current.customer,
          phone: entities.phone ?? current.customer?.phone,
          installationAddress: entities.installationAddress ?? current.customer?.installationAddress,
          locationReceived: entities.locationPinReceived ?? current.customer?.locationReceived,
          cccdFrontReceived: entities.cccdSides?.includes('FRONT') ? true : current.customer?.cccdFrontReceived,
          cccdBackReceived: entities.cccdSides?.includes('BACK') ? true : current.customer?.cccdBackReceived,
        }
      : undefined,
  }
  return reconcileConversationStage(next)
}

export function startAfterCustomerInteraction(state: ConversationState): ConversationState {
  if (state.stage !== 'NEW' && state.stage !== 'WAIT_CUSTOMER_INTERACTION') return state
  return reconcileConversationStage({ ...state, stage: 'DETERMINE_LOCATION' })
}

export function markOpeningSent(state: ConversationState): ConversationState {
  if (state.stage !== 'NEW') return state
  return { ...state, stage: 'WAIT_CUSTOMER_INTERACTION' }
}

export function markOrderDone(state: ConversationState): ConversationState {
  return state.stage === 'READY_TO_ORDER' ? { ...state, stage: 'DONE' } : state
}
