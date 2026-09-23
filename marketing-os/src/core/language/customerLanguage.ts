/**
 * Customer Language Engine.
 *
 * Turns raw customer sources (reviews, sales calls, support tickets, CRM
 * notes, surveys...) into a structured index of what customers actually
 * say: pains, desired outcomes, objections, buying triggers, emotions,
 * reasons for choosing or rejecting the company, competitor mentions and
 * product requests — each backed by verbatim quotes.
 *
 * Two stages:
 *   1. Tagging — each sentence gets insight kinds + a theme. The built-in
 *      tagger is cue-based and runs offline; an LLM tagger (see
 *      server/index.ts `/api/extract`) returns the same `TaggedSentence`
 *      shape and is preferred when configured.
 *   2. Aggregation — tagged sentences are clustered into themed insights
 *      with frequency, segment spread and a 30-day trend.
 */
import type {
  Competitor,
  CustomerLanguageIndex,
  CustomerSource,
  ID,
  Insight,
  InsightKind,
  ISODate,
  Phrase,
  Quote,
} from '../types.ts'
import { inWindow } from '../util/dates.ts'
import { newId } from '../util/id.ts'
import { STOPWORDS, clause, contentWords, ngrams, sentences, similarity, stem, words } from '../util/text.ts'

export interface TaggedSentence {
  sourceId: ID
  text: string
  kinds: InsightKind[]
  /** Zero or more themes; a sentence about price *and* ROI counts toward both. */
  themes: string[]
  competitors: string[]
}

export const INSIGHT_KIND_LABELS: Record<InsightKind, string> = {
  pain: 'Pain point',
  desired_outcome: 'Desired outcome',
  objection: 'Objection',
  buying_trigger: 'Buying trigger',
  emotion: 'Emotional motivation',
  reason_chose: 'Why they chose us',
  reason_rejected: 'Why they rejected us',
  competitor_mention: 'Competitor mentioned',
  product_request: 'Product request',
}

const CUES: Record<InsightKind, RegExp[]> = {
  pain: [
    /\b(struggl|frustrat|wast|nightmare|painful|pain|hate|tired of|sick of|chasing|chase|manual(ly)?|by hand|slow|mistake|error|late fees?|behind|drowning|bottleneck|can't see|no visibility|lost track|keeps? (breaking|failing)|takes (us )?(hours|days|forever)|every (single )?month)\w*/i,
  ],
  desired_outcome: [
    /\b(want(ed)? to|wish|would love|need(ed)? (to|a way)|goal (is|was)|so that|if only|looking for|hoping|all i want|ideally|dream)\b/i,
    /\b(close (the books|month-end) (faster|in)|on time|in one place|without (chasing|spreadsheets))\b/i,
  ],
  objection: [
    /\b(too expensive|expensive|price|pricing|cost(s|ly)?|budget|afford|roi|payback|worth (it|the)|not sure|unsure|worried|concern(ed)?|risk(y)?|hesitant|skeptic\w*|switching|migrat\w*|implementation|disrupt\w*|learning curve|security|compliance|it team|our it|don't have (the )?time|no bandwidth|already have|locked in)\b/i,
  ],
  buying_trigger: [
    /\b(after (we|our)|when (we|our)|audit|grew|growing|doubled|hired|new (cfo|controller|vp|head)|year-end|last straw|finally|acquisition|acquired|funding|raised|scal(e|ing)|expan\w+|new (office|location|entity))\b/i,
  ],
  emotion: [
    /\b(stress\w*|anxious|anxiety|embarrass\w*|relie[fv]\w*|confident|confidence|scared|afraid|dread\w*|love (it|how|that)|peace of mind|sleep|overwhelm\w*|exhaust\w*|panic\w*|proud|nervous)\b/i,
  ],
  reason_chose: [
    /\b(chose|picked|went with (you|them|tallyforge)|decided on|sold (us|me)|the reason (we|i)|won us over|deciding factor|why we (bought|signed|switched))\b/i,
  ],
  reason_rejected: [
    /\b(went with (another|a competitor|[A-Z]\w+ instead)|chose .* instead|didn't (buy|move forward|sign)|passed on|decided against|not (right )?now|lost (the deal|to)|stayed with|no decision)\b/i,
  ],
  competitor_mention: [],
  product_request: [
    /\b(would be (great|nice) if|feature request|integrat(e|ion) with|support for|wish it (had|could)|can you add|missing|doesn't (support|have)|roadmap)\b/i,
  ],
}

/**
 * Domain-general themes. Sentences that match none fall back to clustering
 * by shared vocabulary, so business-specific themes still emerge.
 */
const THEMES: { theme: string; pattern: RegExp }[] = [
  { theme: 'Unclear ROI', pattern: /\b(roi|payback|worth (it|the)|justify|return on|pay for itself|value for)\b/i },
  { theme: 'Price', pattern: /\b(too expensive|expensive|price|pricing|cost(s|ly)?|budget|afford|cheaper)\b/i },
  { theme: 'Implementation effort', pattern: /\b(implement\w*|switching|migrat\w*|onboard\w*|set ?up|disrupt\w*|rollout|go-live|learning curve|it team|our it)\b/i },
  { theme: 'Manual work & time', pattern: /\b(manual(ly)?|by hand|hours|days|forever|time-consuming|copy(ing)? and past|re-?key\w*|data entry|chasing|chase)\b/i },
  { theme: 'Errors & accuracy', pattern: /\b(mistake|error|duplicate|wrong|accura\w*|typo|double[- ]pa(id|y)|fraud)\b/i },
  { theme: 'Visibility & control', pattern: /\b(visib\w*|can't see|no idea|in one place|dashboard|track\w*|status|where things stand|cash position|forecast)\b/i },
  { theme: 'Approvals & bottlenecks', pattern: /\b(approv\w*|sign[- ]off|bottleneck|stuck|waiting on|inbox|email threads?)\b/i },
  { theme: 'Close speed', pattern: /\b(month[- ]end|close (the books|faster)|closing|close in)\b/i },
  { theme: 'Integrations', pattern: /\b(integrat\w*|sync\w*|netsuite|quickbooks|xero|erp|api|connect(s|ed)? to)\b/i },
  { theme: 'Audit & compliance', pattern: /\b(audit\w*|compliance|sox|controls?|paper trail|auditors?)\b/i },
  { theme: 'Security', pattern: /\b(secur\w*|soc ?2|permissions|access control)\b/i },
  { theme: 'Support & service', pattern: /\b(support|customer success|respons\w*|helpful|answered|service)\b/i },
  { theme: 'Ease of use', pattern: /\b(easy|intuitive|simple|user[- ]friendly|clunky|confusing|complicated)\b/i },
  { theme: 'Vendor relationships', pattern: /\b(vendors?|suppliers?|late fees?|paid late|pay(ing)? late)\b/i },
  { theme: 'Scaling with growth', pattern: /\b(grew|growing|doubled|scal\w*|volume|more entities|expan\w*)\b/i },
  { theme: 'Stress & confidence', pattern: /\b(stress\w*|anxious|sleep|peace of mind|confiden\w*|panic\w*|dread\w*|overwhelm\w*)\b/i },
]

function detectCompetitors(text: string, competitors: Competitor[]): string[] {
  const found: string[] = []
  for (const c of competitors) {
    const names = [c.name, ...(c.aliases ?? [])]
    if (names.some((n) => n.length > 2 && new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(text))) {
      found.push(c.name)
    }
  }
  return found
}

/** Offline, cue-based tagger. */
export function tagSources(sources: CustomerSource[], competitors: Competitor[]): TaggedSentence[] {
  const out: TaggedSentence[] = []
  for (const source of sources) {
    for (const sentence of sentences(source.text)) {
      if (words(sentence).length < 4) continue
      const kinds = (Object.keys(CUES) as InsightKind[]).filter((k) => CUES[k].some((re) => re.test(sentence)))
      const comps = detectCompetitors(sentence, competitors)
      if (comps.length > 0) kinds.push('competitor_mention')
      // Lost/won outcomes turn neutral statements into reasons.
      if (source.outcome === 'lost' && kinds.includes('objection') && !kinds.includes('reason_rejected')) kinds.push('reason_rejected')
      if (source.outcome === 'won' && source.kind === 'sales_call' && /\b(because|reason|convinced|sold)\b/i.test(sentence) && !kinds.includes('reason_chose')) {
        kinds.push('reason_chose')
      }
      if (source.kind === 'testimonial' && kinds.length === 0) kinds.push('reason_chose')
      if (kinds.length === 0) continue
      const themes = THEMES.filter((t) => t.pattern.test(sentence)).map((t) => t.theme)
      out.push({ sourceId: source.id, text: sentence, kinds: Array.from(new Set(kinds)), themes, competitors: comps })
    }
  }
  return out
}

function labelFromWords(texts: string[]): string {
  const counts = new Map<string, number>()
  for (const t of texts) for (const w of new Set(contentWords(t))) counts.set(w, (counts.get(w) ?? 0) + 1)
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([w]) => w)
  return top.length ? top.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' & ') : 'Other'
}

function summarizeInsight(kind: InsightKind, theme: string, quotes: Quote[], sourceKinds: number): string {
  const n = quotes.length
  const spread = sourceKinds > 1 ? ` across ${sourceKinds} source types` : ''
  return `${INSIGHT_KIND_LABELS[kind]}: “${theme}” — ${n} mention${n === 1 ? '' : 's'}${spread}.`
}

/** Aggregate tagged sentences into themed insights. */
export function buildIndex(
  tagged: TaggedSentence[],
  sources: CustomerSource[],
  now: ISODate,
): CustomerLanguageIndex {
  const sourceById = new Map(sources.map((s) => [s.id, s]))
  const insights: Insight[] = []

  const kinds = Object.keys(INSIGHT_KIND_LABELS) as InsightKind[]
  for (const kind of kinds) {
    const pool = tagged.filter((t) => t.kinds.includes(kind))
    // Group: explicit theme first, otherwise greedy vocabulary clustering.
    const groups = new Map<string, TaggedSentence[]>()
    const unthemed: TaggedSentence[][] = []
    for (const t of pool) {
      const keys = kind === 'competitor_mention' && t.competitors.length > 0 ? t.competitors : t.themes
      if (keys.length > 0) {
        for (const key of keys) groups.set(key, [...(groups.get(key) ?? []), t])
        continue
      }
      const cluster = unthemed.find((c) => c.some((m) => similarity(m.text, t.text) >= 0.2))
      if (cluster) cluster.push(t)
      else unthemed.push([t])
    }
    for (const cluster of unthemed) {
      if (cluster.length < 2) continue
      groups.set(labelFromWords(cluster.map((c) => c.text)), cluster)
    }

    for (const [theme, members] of groups) {
      const seen = new Set<string>()
      const quotes: Quote[] = []
      for (const m of members) {
        const src = sourceById.get(m.sourceId)
        if (!src) continue
        const key = `${m.sourceId}:${m.text}`
        if (seen.has(key)) continue
        seen.add(key)
        quotes.push({ sourceId: src.id, sourceKind: src.kind, text: clause(m.text), date: src.date, segmentId: src.segmentId })
      }
      if (quotes.length === 0) continue
      const dates = quotes.map((q) => q.date).sort()
      const recent = quotes.filter((q) => inWindow(q.date, now, 30)).length
      const prior = quotes.filter((q) => inWindow(q.date, now, 60, 30)).length
      const segmentIds = Array.from(new Set(quotes.map((q) => q.segmentId).filter((s): s is ID => Boolean(s))))
      const competitors = Array.from(new Set(members.flatMap((m) => m.competitors)))
      insights.push({
        id: newId('ins'),
        kind,
        theme,
        summary: summarizeInsight(kind, theme, quotes, new Set(quotes.map((q) => q.sourceKind)).size),
        quotes,
        frequency: new Set(quotes.map((q) => q.sourceId)).size,
        segmentIds,
        competitors,
        firstSeen: dates[0],
        lastSeen: dates[dates.length - 1],
        trend: (recent + 1) / (prior + 1),
      })
    }
  }

  insights.sort((a, b) => b.frequency - a.frequency)

  const competitorMentions: Record<string, number> = {}
  for (const t of tagged) for (const c of t.competitors) competitorMentions[c] = (competitorMentions[c] ?? 0) + 1

  return {
    insights,
    phrases: extractPhrases(tagged),
    competitorMentions,
    builtAt: now,
    sourceCount: sources.length,
  }
}

/** Recurring multi-word phrases customers use, counted once per source. */
export function extractPhrases(tagged: TaggedSentence[]): Phrase[] {
  const counts = new Map<string, { sources: Set<ID>; kinds: Set<InsightKind> }>()
  for (const t of tagged) {
    const tokens = words(t.text)
    for (const n of [2, 3, 4]) {
      for (const g of ngrams(tokens, n)) {
        const parts = g.split(' ')
        if (STOPWORDS.has(parts[0]) || STOPWORDS.has(parts[parts.length - 1])) continue
        if (parts.filter((p) => !STOPWORDS.has(p)).length < 2) continue
        const entry = counts.get(g) ?? { sources: new Set(), kinds: new Set() }
        entry.sources.add(t.sourceId)
        t.kinds.forEach((k) => entry.kinds.add(k))
        counts.set(g, entry)
      }
    }
  }
  const phrases = [...counts.entries()]
    .filter(([, v]) => v.sources.size >= 2)
    .map(([text, v]) => ({ text, count: v.sources.size, kinds: [...v.kinds] }))
    .sort((a, b) => b.count * b.text.length - a.count * a.text.length)

  // Drop phrases fully contained in a longer phrase with the same count.
  return phrases
    .filter((p) => !phrases.some((q) => q !== p && q.count >= p.count && q.text.includes(p.text)))
    .slice(0, 40)
}

export function indexSources(sources: CustomerSource[], competitors: Competitor[], now: ISODate): CustomerLanguageIndex {
  return buildIndex(tagSources(sources, competitors), sources, now)
}

// ---------------------------------------------------------------------------
// Queries used by the brief builder, problem solver and planner
// ---------------------------------------------------------------------------

export function insightsFor(
  index: CustomerLanguageIndex,
  opts: { kinds?: InsightKind[]; segmentId?: ID; minFrequency?: number } = {},
): Insight[] {
  return index.insights
    .filter((i) => !opts.kinds || opts.kinds.includes(i.kind))
    .filter((i) => (opts.minFrequency ?? 1) <= i.frequency)
    .map((i) => {
      if (!opts.segmentId) return i
      const quotes = i.quotes.filter((q) => q.segmentId === opts.segmentId)
      return { ...i, quotes, frequency: new Set(quotes.map((q) => q.sourceId)).size }
    })
    .filter((i) => i.frequency > 0)
    .sort((a, b) => b.frequency - a.frequency || b.trend - a.trend)
}

/** The best single customer quote for an insight: on-theme, short, concrete, first person, from a high-signal source. */
export function bestQuote(insight: Insight): Quote | undefined {
  const theme = THEMES.find((t) => t.theme === insight.theme)?.pattern
  return [...insight.quotes].sort((a, b) => quoteScore(b, theme) - quoteScore(a, theme))[0]
}

const SOURCE_WEIGHT: Partial<Record<Quote['sourceKind'], number>> = { sales_call: 2, review: 1.5, testimonial: 1.5, survey: 1, crm_note: 0, email: 0.5, support: 0.5, chat: -1 }

function quoteScore(q: Quote, theme?: RegExp): number {
  const n = words(q.text).length
  let score = 10 - Math.abs(n - 14) * 0.4
  if (/\b(i|we|our|my)\b/i.test(q.text)) score += 2
  if (/\d/.test(q.text)) score += 1
  if (theme?.test(q.text)) score += 3
  return score + (SOURCE_WEIGHT[q.sourceKind] ?? 0)
}

/** Insights whose quotes mention any of the given terms. */
export function searchInsights(index: CustomerLanguageIndex, terms: string[]): Insight[] {
  const stemsWanted = new Set(terms.flatMap((t) => words(t)).map(stem))
  return index.insights.filter((i) =>
    i.quotes.some((q) => words(q.text).some((w) => stemsWanted.has(stem(w)))) || stemsWanted.has(stem(i.theme.toLowerCase())),
  )
}

/** Theme co-occurrence inside the same source, e.g. "Price" appears with "Unclear ROI". */
export function coOccurrence(index: CustomerLanguageIndex, themeA: string, themeB: string): number {
  const a = index.insights.filter((i) => i.theme === themeA).flatMap((i) => i.quotes.map((q) => q.sourceId))
  const b = new Set(index.insights.filter((i) => i.theme === themeB).flatMap((i) => i.quotes.map((q) => q.sourceId)))
  const sa = new Set(a)
  if (sa.size === 0) return 0
  let both = 0
  for (const id of sa) if (b.has(id)) both += 1
  return both / sa.size
}
