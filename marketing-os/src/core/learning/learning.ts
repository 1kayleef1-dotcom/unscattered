/**
 * Copy performance memory → Marketing Intelligence Model.
 *
 * Every performance record is joined back to the copy decisions that
 * produced it (strategy, angle, proof type, CTA style, offer type,
 * sequence kind, theme). For each segment and decision we estimate the
 * rate with a Beta posterior shrunk toward the segment baseline, compare it
 * with every other option on the same dimension, and keep the result as a
 * `Learning` with an explicit effect size, probability and sample size.
 * Experiment-backed learnings are marked as such and outrank observational
 * ones. Generated copy is never assumed to be good: only performance moves it.
 */
import { LANDING_STRATEGY_LABELS } from '../strategy/landing.ts'
import { AD_ANGLE_LABELS } from '../strategy/ads.ts'
import { METRIC_LABELS, primaryRateFor, rateParts, sumMetrics } from '../performance/metrics.ts'
import type {
  Asset,
  AssetTags,
  AssetVersion,
  Channel,
  ID,
  Learning,
  LearningDimension,
  MetricKey,
  PerformanceRecord,
  Workspace,
} from '../types.ts'
import { betaInterval, betaMean, betaPosterior, probabilityBBeatsA, signedPct } from '../util/stats.ts'

const DIMENSIONS: { dim: LearningDimension; tag: keyof AssetTags }[] = [
  { dim: 'strategy', tag: 'strategy' },
  { dim: 'angle', tag: 'angle' },
  { dim: 'proof_type', tag: 'proofType' },
  { dim: 'cta', tag: 'ctaStyle' },
  { dim: 'offer_type', tag: 'offerType' },
  { dim: 'sequence_kind', tag: 'sequenceKind' },
  { dim: 'theme', tag: 'theme' },
]

export const DIMENSION_LABELS: Record<LearningDimension, string> = {
  strategy: 'page strategy',
  angle: 'ad angle',
  proof_type: 'proof type',
  cta: 'CTA',
  offer_type: 'offer framing',
  sequence_kind: 'sequence type',
  theme: 'message theme',
  channel: 'channel',
}

const CTA_LABELS: Record<string, string> = { demo: 'demo CTA', call: '“book a call” CTA', trial: 'trial CTA', buy: 'buy CTA', learn: 'learn-more CTA', download: 'download CTA' }
const OFFER_LABELS: Record<string, string> = { discount: 'discount offers', value: 'value framing', guarantee: 'guarantee framing', bonus: 'bonus offers', none: 'no offer' }

export function valueLabel(dim: LearningDimension, value: string): string {
  switch (dim) {
    case 'strategy':
      return `${(LANDING_STRATEGY_LABELS as Record<string, string>)[value] ?? value} pages`
    case 'angle':
      return `the ${((AD_ANGLE_LABELS as Record<string, string>)[value] ?? value).toLowerCase()} angle`
    case 'proof_type':
      return `${value.replace('_', ' ')} proof`
    case 'cta':
      return CTA_LABELS[value] ?? value
    case 'offer_type':
      return OFFER_LABELS[value] ?? value
    case 'theme':
      return `“${value}” messaging`
    default:
      return value.replace('_', ' ')
  }
}

/** Resolve the tags that produced a record: version tags, then section meta (ad angle), then asset tags. */
export function tagsForRecord(asset: Asset, version: AssetVersion | undefined, variantKey?: string): AssetTags {
  const base = { ...asset.tags, ...(version?.tags ?? {}) }
  if (!variantKey || !version) return base
  const section = version.content.sections.find((s) => s.id === variantKey)
  const angle = section?.meta?.angle as AssetTags['angle'] | undefined
  const offerType = section?.meta?.offerType as AssetTags['offerType'] | undefined
  const theme = section?.meta?.theme as string | undefined
  return { ...base, ...(angle ? { angle } : {}), ...(offerType ? { offerType } : {}), ...(theme ? { theme } : {}) }
}

type ChannelGroup = 'web' | 'email' | 'ads' | 'social'

function groupOf(asset: Asset): ChannelGroup {
  if (asset.channel === 'web') return 'web'
  if (asset.channel === 'email') return 'email'
  if (asset.type === 'ad_set' || asset.type === 'creative_concept') return 'ads'
  return 'social'
}

/** Metrics each channel group's learnings are judged on. */
function metricsFor(group: ChannelGroup, channel: Channel): MetricKey[] {
  if (group === 'email') return ['click_rate']
  if (group === 'web') return ['qualified_cvr']
  if (group === 'ads') return ['ctr', 'qualified_cvr']
  return [primaryRateFor(channel)]
}

const WHERE: Record<ChannelGroup, string> = { web: 'on the web', email: 'in email', ads: 'in ads', social: 'in social' }

/** More specific decisions first: when dimensions move together, report the most actionable one. */
const DIMENSION_PRIORITY: LearningDimension[] = ['strategy', 'angle', 'proof_type', 'offer_type', 'sequence_kind', 'cta', 'theme', 'channel']

/**
 * When two dimensions changed together (e.g. a new page changed strategy,
 * CTA and theme at once) their records are identical and the data cannot
 * say which one mattered. Keep one learning and say so, instead of
 * reporting three "findings" that are really one.
 */
function mergeConfounded(learnings: Learning[]): Learning[] {
  const groups = new Map<string, Learning[]>()
  for (const l of learnings) {
    const key = `${l.segmentId}|${l.channelGroup}|${l.metric}|${l.sampleSize}|${l.posteriorRate.toFixed(6)}`
    groups.set(key, [...(groups.get(key) ?? []), l])
  }
  const out: Learning[] = []
  for (const g of groups.values()) {
    if (g.length === 1) {
      out.push(g[0])
      continue
    }
    const sorted = [...g].sort((a, b) => DIMENSION_PRIORITY.indexOf(a.dimension) - DIMENSION_PRIORITY.indexOf(b.dimension))
    const [keep, ...rest] = sorted
    out.push({
      ...keep,
      confounded: rest.map((r) => valueLabel(r.dimension, r.value)),
      statement: `${keep.statement} Confounded with ${rest.map((r) => valueLabel(r.dimension, r.value)).join(' and ')} — they changed together; test separately to isolate.`,
    })
  }
  return out
}

interface Bucket {
  successes: number
  trials: number
  assetIds: Set<ID>
}

export function computeLearnings(ws: Workspace, opts: { priorStrength?: number } = {}): Learning[] {
  const k = opts.priorStrength ?? 400
  const assets = new Map(ws.assets.map((a) => [a.id, a]))
  const experimentVersions = new Map<string, ID>()
  for (const e of ws.experiments.filter((e) => e.status === 'concluded')) for (const v of e.variants) experimentVersions.set(v.versionId, e.id)

  // (segment, channelGroup, metric, dimension) -> value -> bucket
  const groups = new Map<string, Map<string, Bucket>>()
  const keyOf = (seg: ID, channelGroup: string, metric: MetricKey, dim: LearningDimension) => `${seg}|${channelGroup}|${metric}|${dim}`

  for (const r of ws.performance) {
    const asset = assets.get(r.assetId)
    if (!asset) continue
    const version = asset.versions.find((v) => v.id === r.versionId)
    const tags = tagsForRecord(asset, version, r.variantKey)
    const channelGroup = groupOf(asset)
    for (const metric of metricsFor(channelGroup, r.channel)) {
      const parts = rateParts(r.metrics, metric)
      if (!parts || parts.trials === 0) continue
      for (const { dim, tag } of DIMENSIONS) {
        const value = tags[tag]
        if (!value || value === 'none') continue
        const gk = keyOf(r.segmentId, channelGroup, metric, dim)
        const g = groups.get(gk) ?? new Map<string, Bucket>()
        const b = g.get(String(value)) ?? { successes: 0, trials: 0, assetIds: new Set<ID>() }
        b.successes += parts.successes
        b.trials += parts.trials
        b.assetIds.add(asset.id)
        g.set(String(value), b)
        groups.set(gk, g)
      }
    }
  }

  const learnings: Learning[] = []
  for (const [gk, values] of groups) {
    if (values.size < 2) continue // nothing to compare against
    const [segmentId, channelGroup, metric, dim] = gk.split('|') as [ID, string, MetricKey, LearningDimension]
    const total = [...values.values()].reduce((acc, b) => ({ s: acc.s + b.successes, n: acc.n + b.trials }), { s: 0, n: 0 })
    const baseline = total.n ? total.s / total.n : 0
    if (baseline === 0) continue
    const prior = { alpha: baseline * k, beta: (1 - baseline) * k }
    for (const [value, b] of values) {
      const post = betaPosterior(b.successes, b.trials, prior)
      const rest = betaPosterior(total.s - b.successes, total.n - b.trials, prior)
      const pBetter = probabilityBBeatsA(rest, post)
      const rate = betaMean(post)
      const effect = rate / baseline - 1
      const confidence: Learning['confidence'] = (pBetter > 0.97 || pBetter < 0.03) && b.trials > 2000 ? 'high' : pBetter > 0.88 || pBetter < 0.12 ? 'medium' : 'low'
      const direction: Learning['direction'] = effect > 0.06 && pBetter > 0.85 ? 'strong' : effect < -0.06 && pBetter < 0.15 ? 'weak' : 'neutral'
      const segName = ws.brand.segments.find((s) => s.id === segmentId)?.name ?? segmentId
      const expIds = [...b.assetIds].flatMap((id) => assets.get(id)?.versions.map((v) => experimentVersions.get(v.id)).filter((x): x is ID => Boolean(x)) ?? [])
      const where = WHERE[channelGroup as ChannelGroup]
      learnings.push({
        id: `lrn_${segmentId}_${channelGroup}_${metric}_${dim}_${value}`.replace(/[^a-z0-9_]/gi, '_'),
        segmentId,
        channel: channelGroup === 'ads' || channelGroup === 'social' ? undefined : (channelGroup as Channel),
        channelGroup: channelGroup as ChannelGroup,
        dimension: dim,
        value,
        metric,
        baselineRate: baseline,
        posteriorRate: rate,
        interval: betaInterval(post),
        effect,
        probabilityBetter: pBetter,
        sampleSize: b.trials,
        confidence,
        direction,
        source: expIds.length ? 'experiment' : 'observational',
        evidence: { experimentIds: Array.from(new Set(expIds)), assetIds: [...b.assetIds] },
        statement:
          direction === 'neutral'
            ? `${segName}: ${valueLabel(dim, value)} perform about average ${where} (${signedPct(effect)} ${METRIC_LABELS[metric]}).`
            : `${segName} respond${direction === 'strong' ? ' better' : ' worse'} to ${valueLabel(dim, value)} ${where}: ${signedPct(effect)} ${METRIC_LABELS[metric]} vs. average (n=${b.trials.toLocaleString()}).`,
        updatedAt: ws.now,
      })
    }
  }
  return mergeConfounded(learnings).sort((a, b) => Math.abs(b.effect) * (b.confidence === 'high' ? 2 : 1) - Math.abs(a.effect) * (a.confidence === 'high' ? 2 : 1))
}

export interface IntelligenceModel {
  segmentId: ID
  segmentName: string
  strong: Learning[]
  weak: Learning[]
  best: Partial<Record<LearningDimension, Learning>>
  summary: string[]
}

export function intelligenceModel(ws: Workspace, segmentId: ID): IntelligenceModel {
  const ls = ws.learnings.filter((l) => l.segmentId === segmentId && l.confidence !== 'low')
  const strong = ls.filter((l) => l.direction === 'strong').sort((a, b) => b.effect - a.effect)
  const weak = ls.filter((l) => l.direction === 'weak').sort((a, b) => a.effect - b.effect)
  const best: Partial<Record<LearningDimension, Learning>> = {}
  for (const l of strong) if (!best[l.dimension] || best[l.dimension]!.effect < l.effect) best[l.dimension] = l
  const segmentName = ws.brand.segments.find((s) => s.id === segmentId)?.name ?? segmentId
  const summary = [
    ...strong.slice(0, 3).map((l) => `Strong: ${valueLabel(l.dimension, l.value)} (${signedPct(l.effect)} ${METRIC_LABELS[l.metric]})`),
    ...weak.slice(0, 2).map((l) => `Weak: ${valueLabel(l.dimension, l.value)} (${signedPct(l.effect)} ${METRIC_LABELS[l.metric]})`),
  ]
  return { segmentId, segmentName, strong, weak, best, summary }
}

/** Aggregate performance for a version (or a variant inside it). */
export function versionPerformance(records: PerformanceRecord[], versionId: ID, variantKey?: string) {
  return sumMetrics(records.filter((r) => r.versionId === versionId && (variantKey === undefined || r.variantKey === variantKey)))
}
