import { z } from 'zod'

export const closingSchema = z.object({
  active: z.boolean().default(false),
  plan: z.string().regex(/^(NETVT|MESHVT)\d+$/i).optional(),
  paymentMonths: z.union([z.literal(1), z.literal(6), z.literal(12)]).optional(),
  address: z.object({ detail: z.string().trim().min(1).max(500), ward: z.string().trim().min(1).max(150), province: z.string().trim().min(1).max(150) }).optional(),
  phone: z.string().regex(/^0[35789]\d{8}$/).optional(),
  location: z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180), confirmedInstallationSite: z.literal(true) }).optional(),
  cccdFrontMessageId: z.string().trim().min(1).max(100).optional(),
  cccdBackMessageId: z.string().trim().min(1).max(100).optional(),
}).strict()

export const advisorInputSchema = z.object({
  messages: z.array(z.object({ id: z.string().min(1).max(100), role: z.enum(['customer', 'operator', 'bot']), text: z.string().max(6000), at: z.number().int().nonnegative() })).min(1).max(100),
  // Explicit facts supplied by the application, never inferred from a customer's instructions.
  facts: z.object({ address: z.string().max(500).optional(), plan: z.string().max(40).optional(), home: z.object({ floors: z.number().int().min(1).max(100).optional(), homeType: z.enum(['single-storey', 'room', 'multi-storey']).optional(), strongNetwork: z.boolean().optional(), unclearFloors: z.boolean().optional() }).optional(), service: z.enum(['internet', 'internet-tv']).optional(), salutation: z.enum(['anh', 'chị', 'anh/chị']).default('anh/chị') }).default({ salutation: 'anh/chị' }),
  paused: z.boolean().default(false),
  outreach: z.object({ phase: z.enum(['new', 'waiting', 'active']), event: z.enum(['setup', 'reply', 'heart', 'friend-accepted']) }).optional(),
  closing: closingSchema.optional(),
  handledMessageIds: z.array(z.string().max(100)).max(100).default([]),
}).strict()
export type AdvisorInput = z.infer<typeof advisorInputSchema>
export const knowledgeSchema = z.object({
  version: z.string().min(1),
  regionRulesApproved: z.boolean().default(false),
  confirmedOuterProvinces: z.array(z.string().min(2)).default(['Thừa Thiên Huế', 'Huế', 'Đà Nẵng']),
  offers: z.array(z.object({
    id: z.string().min(1), plan: z.string().min(1), region: z.enum(['inner', 'outer']), service: z.enum(['internet', 'internet-tv']).default('internet'),
    monthlyPrice: z.number().int().positive(), installationFee: z.number().int().nonnegative(),
    devices: z.number().int().positive(), minMbps: z.number().positive(),
    validFrom: z.string().datetime(), validUntil: z.string().datetime(), approved: z.boolean(),
  })).default([]),
}).strict()
export type Knowledge = z.infer<typeof knowledgeSchema>
export type Region = { value: 'inner' | 'outer' | 'unknown'; matched: string[]; verified: boolean; reason: string }
export type Intent = 'price' | 'recommend' | 'fee' | 'promotion' | 'schedule' | 'payment' | 'invoice' | 'complaint' | 'human' | 'stop' | 'signup' | 'greeting' | 'other'
export interface Draft {
  mode: 'draft-only'; action: 'draft' | 'handoff' | 'wait' | 'skip'; reply: string | null;
  intent: Intent[]; missing: string[]; reasons: string[]; sourceMessageIds: string[];
  knowledgeVersion: string; region: Region; facts: AdvisorInput['facts']; offerId?: string;
  priceSheet?: { id: string; path: string; service: 'internet' | 'internet-tv' };
  priceSheets?: { id: string; path: string; service: 'internet' | 'internet-tv' }[];
  recommendation?: { plan?: string; devices?: number; reason: string };
  tvAddon?: { kind: 'box' | 'app'; monthlyPrice: number; maxDevices?: number };
  billingTerm?: { paidMonths: number; bonusMonths: number };
  installationFee?: { quoted: number; maximumDiscount?: number; minimumFee?: number };
  cameraAddon?: { monthlyFee: number; minimumMonths: number; baseMonthlyPrice?: number; totalMonthlyPrice?: number };
  closingChecklist?: { complete: boolean; missing: string[]; nextQuestion: string | null };
  outreachPhase?: 'waiting' | 'active';
  outgoing?: ({ kind: 'text'; text: string } | { kind: 'image'; path: string; label: string })[];
}
