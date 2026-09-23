import { indexSources } from '../language/customerLanguage.ts'
import { seedBrand } from '../seed/brand.ts'
import { seedSources } from '../seed/sources.ts'
import type { Workspace } from '../types.ts'

export const NOW = '2026-09-23T08:00:00.000Z'

export function baseWorkspace(now = NOW): Workspace {
  const brand = seedBrand(now)
  const sources = seedSources(now)
  return {
    schemaVersion: 1,
    brand,
    sources,
    language: indexSources(sources, brand.competitors, now),
    messaging: [],
    assets: [],
    performance: [],
    experiments: [],
    learnings: [],
    problems: [],
    plans: [],
    approvals: [],
    agentRuns: [],
    recommendations: [],
    activity: [],
    now,
  }
}
