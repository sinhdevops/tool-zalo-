export const conversationStages = [
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
] as const

export type ConversationStage = typeof conversationStages[number]

export const advisorIntents = [
  'GREETING',
  'ASK_PRICE',
  'ASK_PACKAGE',
  'ASK_RECOMMENDATION',
  'PROVIDE_LOCATION',
  'HOUSE_NORMAL',
  'HOUSE_ROOM',
  'HOUSE_LEVEL_1',
  'HOUSE_MULTI_FLOOR',
  'PROVIDE_FLOOR_COUNT',
  'NEED_NORMAL_INTERNET',
  'NEED_FAST_INTERNET',
  'ASK_MONTHLY_PAYMENT',
  'ASK_6_MONTH',
  'ASK_12_MONTH',
  'SELECT_PAYMENT',
  'ASK_INSTALLATION_FEE',
  'ASK_INSTALLATION_TIME',
  'ASK_TV',
  'TV_TOO_EXPENSIVE',
  'TV_NORMAL',
  'TV_SMART',
  'ASK_CAMERA',
  'SELECT_PACKAGE',
  'PROVIDE_ADDRESS',
  'PROVIDE_PHONE',
  'PROVIDE_LOCATION_PIN',
  'PROVIDE_CCCD_FRONT',
  'PROVIDE_CCCD_BACK',
  'AFFIRM',
  'DENY',
  'UNCLEAR',
] as const

export type AdvisorIntent = typeof advisorIntents[number]
export type IntentSource = 'RULE' | 'DICTIONARY' | 'PREVIOUS_QUESTION' | 'SEMANTIC' | 'FALLBACK'

export interface IntentResult {
  intent: AdvisorIntent
  confidence: number
  source: IntentSource
  evidence?: string[]
}

export interface NormalizedMessage {
  rawText: string
  normalizedText: string
}

export type PricingZone = 'INNER' | 'OUTER' | 'UNKNOWN'
export type HouseType = 'ROOM' | 'LEVEL_1' | 'NORMAL' | 'MULTI_FLOOR' | 'UNKNOWN'
export type PaymentTerm = 'MONTHLY' | '6_MONTHS' | '12_MONTHS'
export type TelevisionType = 'NORMAL_TV' | 'SMART_TV'
export type CccdSide = 'FRONT' | 'BACK'

export const closingSlots = [
  'package',
  'paymentTerm',
  'address',
  'phone',
  'locationPin',
  'cccdFront',
  'cccdBack',
] as const

export type ClosingSlot = typeof closingSlots[number]

export type BotQuestionKind =
  | 'LOCATION'
  | 'HOUSE_TYPE'
  | 'FLOOR_COUNT'
  | 'PAYMENT_TERM'
  | 'TV_TYPE'
  | 'ADDRESS'
  | 'PHONE'
  | 'LOCATION_PIN'
  | 'CCCD'
  | 'CLARIFICATION'

export interface AdvisorEntities {
  floors?: number
  phone?: string
  paymentTerm?: PaymentTerm
  plan?: string
  locationText?: string
  installationAddress?: string
  houseType?: HouseType
  heavyUsage?: boolean
  televisionType?: TelevisionType
  locationPinReceived?: boolean
  cccdSides?: CccdSide[]
}

export interface ConversationState {
  conversationId: string
  stage: ConversationStage
  location?: {
    raw?: string
    province?: string
    district?: string
    ward?: string
    zone?: PricingZone
  }
  house?: {
    type?: HouseType
    floors?: number
    heavyUsage?: boolean
  }
  package?: {
    recommended?: string
    selected?: string
  }
  payment?: {
    term?: PaymentTerm
  }
  television?: {
    interested?: boolean
    type?: TelevisionType
    selected?: boolean
  }
  camera?: {
    interested?: boolean
    selected?: boolean
  }
  optionalServicesReviewed: boolean
  customer?: {
    phone?: string
    installationAddress?: string
    locationReceived?: boolean
    cccdFrontReceived?: boolean
    cccdBackReceived?: boolean
  }
  pricingImagesSent: boolean
  lastBotQuestion?: BotQuestionKind
  lastIntent?: AdvisorIntent[]
  collectedSlots: ClosingSlot[]
  missingSlots: ClosingSlot[]
}

export const advisorActions = [
  'ANSWER_PRICE',
  'ANSWER_PACKAGE',
  'ANSWER_INSTALLATION_FEE',
  'ANSWER_INSTALLATION_TIME',
  'ANSWER_CAMERA',
  'ANSWER_TV',
  'RECOMMEND_PACKAGE',
  'ASK_LOCATION',
  'ASK_HOUSE_TYPE',
  'ASK_FLOOR_COUNT',
  'ASK_PAYMENT',
  'ASK_ADDRESS',
  'ASK_PHONE',
  'ASK_LOCATION_PIN',
  'ASK_CCCD',
  'SEND_PRICING_IMAGES',
  'APPLY_RETENTION_DISCOUNT',
  'ASK_CLARIFICATION',
  'COMPLETE_ORDER',
  'HANDOFF',
  'WAIT',
  'SKIP',
] as const

export type AdvisorAction = typeof advisorActions[number]

export interface ActionDecision {
  action: AdvisorAction
  reason: string
  templateId?: string
  requiresSellerApproval?: boolean
  resumeStage?: ConversationStage
}

export type RuleCategory = 'LOCATION' | 'PACKAGE' | 'PAYMENT' | 'CAMERA' | 'TV' | 'INSTALLATION' | 'CLOSING' | 'FLOW'

export interface RuleMatch {
  id: string
  category: RuleCategory
  details?: Record<string, string | number | boolean | null>
}

export interface DecisionTrace {
  input: NormalizedMessage
  previousQuestion?: BotQuestionKind
  intents: IntentResult[]
  entities: AdvisorEntities
  stateBefore: ConversationState
  stateAfter: ConversationState
  matchedRules: RuleMatch[]
  decision: ActionDecision
  templateId?: string
  finalResponse?: string
}

export interface PackageRuleConfig {
  normalPlan: string
  heavyUsagePlan: string
  floorPackageMapping: Readonly<Record<number, string>>
  floorDeviceMapping: Readonly<Record<number, number>>
  maximumConfiguredFloors: number
}

export interface PaymentRuleConfig {
  allowedTermsByPlanFamily: Readonly<Record<'NETVT' | 'MESHVT', readonly PaymentTerm[]>>
  preferredPromptTerms: readonly ['6_MONTHS', '12_MONTHS']
  bonusMonths: Readonly<Partial<Record<PaymentTerm, number>>>
}

export interface CameraRuleConfig {
  minimumPaymentMonths: number
  monthlyFeeByPlan: Readonly<Record<string, number>>
  installationIncluded: boolean
}

export interface TelevisionRuleConfig {
  boxMonthlyPrice: number
  smartAppMonthlyPrice: number
  smartAppMaximumDevices: number
}

export interface InstallationRuleConfig {
  standardFee: number
  maximumRetentionDiscount: number
  minimumPrepaidMonthsForRetentionDiscount: number
  requiresSellerApproval: boolean
  estimatedMinutes: number
}

export interface ViettelBusinessRuleConfig {
  package: PackageRuleConfig
  payment: PaymentRuleConfig
  camera: CameraRuleConfig
  television: TelevisionRuleConfig
  installation: InstallationRuleConfig
}
