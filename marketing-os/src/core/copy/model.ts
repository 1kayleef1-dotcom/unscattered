/**
 * Copy models: who writes the words.
 *
 * `LocalCopyModel` runs offline and only uses workspace evidence.
 * `RemoteCopyModel` calls the proxy in `server/` which calls Claude with
 * separate writer, reviser and critic prompts. The browser never holds an
 * API key. Every remote response is validated against the plan; on any
 * failure the pipeline falls back to the local model and records that on
 * the version, so it is always clear what produced a piece of copy.
 */
import type { TaggedSentence } from '../language/customerLanguage.ts'
import type { AssetContent, AssetType, BrandBrain, Channel, Competitor, CritiqueCheck, CustomerSource, MarketingBrief } from '../types.ts'
import { writeLocally } from './localWriter.ts'
import type { AssetPlan } from './plan.ts'

export interface WriteRequest {
  assetType: AssetType
  channel: Channel
  plan: AssetPlan
  brief: MarketingBrief
  brand: BrandBrain
  instructions?: string
}

export interface ReviseRequest extends WriteRequest {
  content: AssetContent
  failedChecks: CritiqueCheck[]
}

export interface CritiqueRequest {
  assetType: AssetType
  content: AssetContent
  brief: MarketingBrief
  brand: BrandBrain
}

export interface CopyModel {
  id: string
  label: string
  write(req: WriteRequest): Promise<AssetContent>
  /** Optional model-driven revision; the pipeline uses rule-based revision otherwise. */
  revise?(req: ReviseRequest): Promise<AssetContent>
  /** Optional independent critic with a different prompt and context. */
  critique?(req: CritiqueRequest): Promise<CritiqueCheck[]>
  /** Optional LLM tagging for the customer language engine. */
  tagSources?(sources: CustomerSource[], competitors: Competitor[]): Promise<TaggedSentence[]>
}

export class LocalCopyModel implements CopyModel {
  id = 'local'
  label = 'Offline composer (evidence-only)'
  async write(req: WriteRequest): Promise<AssetContent> {
    return writeLocally({ plan: req.plan, brief: req.brief, brand: req.brand, instructions: req.instructions })
  }
}

/** Keep only the parts of the Brand Brain a writer or critic needs. */
export function brandContext(brand: BrandBrain) {
  return {
    company: brand.company,
    oneLiner: brand.oneLiner,
    positioning: brand.positioning,
    voice: brand.voice,
    approvedClaims: brand.claims.filter((c) => c.status === 'approved').map((c) => c.text),
    prohibitedClaims: brand.claims.filter((c) => c.status === 'prohibited').map((c) => c.text),
    proof: brand.proof.map((p) => ({ id: p.id, kind: p.kind, title: p.title, detail: p.detail, metric: p.metric, customer: p.customer })),
    offers: brand.offers.map((o) => ({ id: o.id, name: o.name, description: o.description, cta: o.cta, outcomes: o.outcomes, features: o.features, guarantee: o.guarantee })),
    pillars: brand.pillars,
  }
}

function isContent(value: unknown, plan?: AssetPlan): value is AssetContent {
  if (!value || typeof value !== 'object' || !Array.isArray((value as AssetContent).sections)) return false
  const sections = (value as AssetContent).sections
  if (!sections.every((s) => s && typeof s.id === 'string' && Array.isArray(s.blocks) && s.blocks.every((b) => typeof b.key === 'string' && typeof b.text === 'string'))) return false
  if (plan && sections.length !== plan.sections.length) return false
  return true
}

/** Re-attach plan metadata the model is not trusted to echo back faithfully. */
function alignToPlan(content: AssetContent, plan: AssetPlan): AssetContent {
  return {
    sections: plan.sections.map((spec, i) => {
      const got = content.sections.find((s) => s.id === spec.id) ?? content.sections[i]
      return {
        id: spec.id,
        kind: spec.kind,
        title: spec.title,
        meta: spec.meta,
        rationale: got?.rationale ?? spec.rationale ?? spec.purpose,
        blocks: spec.blocks.map((b) => {
          const block = got?.blocks.find((x) => x.key === b.key)
          return { key: b.key, label: b.label, text: block?.text ?? '', evidence: block?.evidence }
        }),
      }
    }),
  }
}

export class RemoteCopyModel implements CopyModel {
  id = 'claude'
  label = 'Claude (via proxy)'
  private endpoint: string
  private timeoutMs: number
  constructor(endpoint: string, timeoutMs = 120_000) {
    this.endpoint = endpoint
    this.timeoutMs = timeoutMs
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const res = await fetch(`${this.endpoint.replace(/\/$/, '')}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      if (!res.ok) throw new Error(`${path} returned ${res.status}`)
      return (await res.json()) as T
    } finally {
      clearTimeout(timer)
    }
  }

  async write(req: WriteRequest): Promise<AssetContent> {
    const out = await this.post<{ content: unknown }>('/api/write', { ...req, brand: brandContext(req.brand) })
    if (!isContent(out.content, req.plan)) throw new Error('Writer returned malformed content')
    return alignToPlan(out.content, req.plan)
  }

  async revise(req: ReviseRequest): Promise<AssetContent> {
    const out = await this.post<{ content: unknown }>('/api/revise', { ...req, brand: brandContext(req.brand) })
    if (!isContent(out.content, req.plan)) throw new Error('Reviser returned malformed content')
    return alignToPlan(out.content, req.plan)
  }

  async critique(req: CritiqueRequest): Promise<CritiqueCheck[]> {
    const out = await this.post<{ checks: CritiqueCheck[] }>('/api/critique', { ...req, brand: brandContext(req.brand) })
    if (!Array.isArray(out.checks)) throw new Error('Critic returned malformed checks')
    const dims = new Set(['strategic', 'persuasion', 'brand', 'quality'])
    return out.checks
      .filter((c) => c && dims.has(c.dimension) && typeof c.score === 'number')
      .map((c) => ({ ...c, score: Math.max(0, Math.min(5, c.score)), passed: c.score >= 3, severity: c.severity ?? 'minor' }))
  }

  async tagSources(sources: CustomerSource[], competitors: Competitor[]): Promise<TaggedSentence[]> {
    const out = await this.post<{ tagged: TaggedSentence[] }>('/api/extract', { sources, competitors: competitors.map((c) => ({ name: c.name, aliases: c.aliases ?? [] })) })
    if (!Array.isArray(out.tagged)) throw new Error('Extractor returned malformed output')
    const ids = new Set(sources.map((s) => s.id))
    return out.tagged.filter((t) => ids.has(t.sourceId) && Array.isArray(t.kinds) && typeof t.text === 'string').map((t) => ({ ...t, themes: t.themes ?? [], competitors: t.competitors ?? [] }))
  }
}

export function modelFor(endpoint?: string): CopyModel {
  return endpoint ? new RemoteCopyModel(endpoint) : new LocalCopyModel()
}
