import { knowledgeSchema } from './types.ts'
import { priceSheets } from './price-sheets.ts'
// Isolated test catalog from the user's price images, never used by the live draft API.
export function testKnowledge() {
  return knowledgeSchema.parse({ version: 'test-user-images', regionRulesApproved: true, offers: priceSheets.flatMap(sheet => Object.entries(sheet.prices).map(([plan, price]) => ({
    id: `${sheet.id}-${plan}`, plan, region: sheet.region, service: sheet.service, monthlyPrice: price,
    installationFee: 300000, devices: plan.startsWith('MESH') ? Number(plan.at(-1)) + 1 : 1, minMbps: 300,
    validFrom: '2020-01-01T00:00:00Z', validUntil: '2100-01-01T00:00:00Z', approved: true,
  }))) })
}
