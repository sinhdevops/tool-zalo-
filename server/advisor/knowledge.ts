import { readFileSync } from 'node:fs'
import { knowledgeSchema } from './types.ts'
import type { Knowledge } from './types.ts'
export function loadKnowledge(): Knowledge {
  const filename = process.env.ADVISOR_KNOWLEDGE_FILE
  if (!filename) return knowledgeSchema.parse({ version: 'unconfigured', regionRulesApproved: false, offers: [] })
  return knowledgeSchema.parse(JSON.parse(readFileSync(filename, 'utf8').replace(/^\uFEFF/, '')))
}
