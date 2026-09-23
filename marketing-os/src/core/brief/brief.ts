/**
 * Brief builder — the copywriter "thinks before writing".
 *
 * Every important asset starts from a Marketing Brief assembled from the
 * Brand Brain, the customer language index, the central messaging model
 * and what the business has learned from past performance. Every field
 * carries the evidence it came from; anything the brief cannot ground in
 * data is listed in `gaps` instead of being invented.
 */
import { bestQuote, insightsFor } from '../language/customerLanguage.ts'
import type {
  Channel,
  EvidenceRef,
  ID,
  Insight,
  Learning,
  MarketingBrief,
  MessagingModel,
  Proof,
  TrafficSource,
  Workspace,
} from '../types.ts'
import { clause, coverage, lowerFirst } from '../util/text.ts'

/** Vocabulary that links customer themes to proof and pillars. */
export const THEME_VOCAB: Record<string, string> = {
  'Unclear ROI': 'roi payback pays itself months hours saved late fees discount cost value',
  Price: 'payback pays itself cost price months value hours saved',
  'Implementation effort': 'live days implementation erp changes kickoff it signed weeks guarantee',
  'Manual work & time': 'close days weekend hours manual approvals email',
  'Errors & accuracy': 'duplicate payments caught accuracy',
  'Visibility & control': 'where every invoice stands visibility status',
  'Approvals & bottlenecks': 'approvals owner deadline email inbox approval time',
  'Close speed': 'close month-end days weekend',
  Integrations: 'erp netsuite quickbooks xero sync',
  'Audit & compliance': 'audit paper trail auditors',
  Security: 'security soc it signed',
  'Vendor relationships': 'late payments vendors fees',
  'Scaling with growth': 'entities volume invoices',
  'Stress & confidence': 'trust calm weekend peace',
}

/** How a theme reads inside a sentence ("the real cost of manual AP"). */
const THEME_PHRASES: Record<string, string> = {
  'Unclear ROI': 'an unclear ROI',
  Price: 'the price',
  'Implementation effort': 'a painful rollout',
  'Manual work & time': 'manual AP',
  'Errors & accuracy': 'payment errors',
  'Visibility & control': 'not knowing where invoices stand',
  'Approvals & bottlenecks': 'stalled approvals',
  'Close speed': 'a slow close',
  Integrations: 'disconnected systems',
  'Audit & compliance': 'audit scrambles',
  Security: 'security reviews',
  'Vendor relationships': 'paying vendors late',
  'Scaling with growth': 'growing invoice volume',
  'Stress & confidence': 'month-end stress',
}

export function themePhrase(theme: string | undefined, fallback = 'this'): string {
  if (!theme) return fallback
  return THEME_PHRASES[theme] ?? theme.toLowerCase()
}

export function themeText(insight: Pick<Insight, 'theme'> & { quotes?: { text: string }[] }): string {
  return `${insight.theme} ${THEME_VOCAB[insight.theme] ?? ''} ${(insight.quotes ?? []).slice(0, 3).map((q) => q.text).join(' ')}`
}

/** Proof that best answers a theme, with a relevance score. */
export function proofForTheme(proofs: Proof[], theme: string, extraText = ''): { proof: Proof; score: number }[] {
  const needle = `${theme} ${THEME_VOCAB[theme] ?? ''} ${extraText}`
  return proofs
    .map((proof) => ({ proof, score: coverage(needle, `${proof.title} ${proof.detail} ${proof.metric?.label ?? ''}`) }))
    .filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score)
}

export interface BriefInput {
  segmentId: ID
  offerId?: ID
  channel: Channel
  goal: string
  trafficSource?: TrafficSource
  messagingModelId?: ID
  /** A theme to build the message around (e.g. from the problem solver). */
  focusTheme?: string
}

function proofRank(proof: Proof, learnings: Learning[]): number {
  const kindBoost = learnings
    .filter((l) => l.dimension === 'proof_type' && l.value === proof.kind)
    .reduce((s, l) => s + l.effect, 0)
  const specificity = proof.metric ? 1 : 0
  const named = proof.customer ? 0.5 : 0
  return specificity + named + kindBoost * 3
}

export function relevantLearnings(ws: Workspace, segmentId: ID): Learning[] {
  return ws.learnings
    .filter((l) => l.segmentId === segmentId && l.confidence !== 'low' && l.direction !== 'neutral')
    .sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect))
}

export function findMessaging(ws: Workspace, segmentId: ID, offerId: ID, id?: ID): MessagingModel | undefined {
  if (id) return ws.messaging.find((m) => m.id === id)
  return ws.messaging.find((m) => m.segmentId === segmentId && m.offerId === offerId) ?? ws.messaging.find((m) => m.segmentId === segmentId)
}

export function buildBrief(ws: Workspace, input: BriefInput): MarketingBrief {
  const { brand, language } = ws
  const segment = brand.segments.find((s) => s.id === input.segmentId) ?? brand.segments[0]
  const offer = brand.offers.find((o) => o.id === input.offerId) ?? brand.offers.find((o) => o.kind === 'product') ?? brand.offers[0]
  const persona = brand.personas.find((p) => p.segmentId === segment.id)
  const messaging = findMessaging(ws, segment.id, offer.id, input.messagingModelId)
  const learnings = relevantLearnings(ws, segment.id)
  const evidence: EvidenceRef[] = []
  const gaps: string[] = []

  // PROBLEM — the most frequent pain in this segment, in customers' words.
  const pains = insightsFor(language, { kinds: ['pain'], segmentId: segment.id })
  const focusPain = input.focusTheme ? pains.find((p) => p.theme === input.focusTheme) : undefined
  const topPain = focusPain ?? pains[0]
  let problem = brand.positioning.problem
  let problemQuote: string | undefined
  if (topPain) {
    const q = bestQuote(topPain)
    problemQuote = q ? clause(q.text) : undefined
    problem = `${topPain.theme}: “${problemQuote ?? topPain.theme}”`
    evidence.push({ kind: 'insight', id: topPain.id, note: `${topPain.frequency} customer${topPain.frequency === 1 ? '' : 's'} describe${topPain.frequency === 1 ? 's' : ''} this pain` })
  } else {
    gaps.push(`No customer-sourced pain points for ${segment.name}; problem taken from positioning.`)
  }

  // DESIRED OUTCOME
  const outcomes = insightsFor(language, { kinds: ['desired_outcome'], segmentId: segment.id })
  const outcomeInsight = outcomes[0]
  const desiredOutcome = offer.outcomes[0] ?? (outcomeInsight ? clause(bestQuote(outcomeInsight)?.text ?? '') : '')
  if (outcomeInsight) evidence.push({ kind: 'insight', id: outcomeInsight.id, note: 'Desired outcome in customer words' })

  // OBJECTIONS — ranked by frequency and trend, each paired with a response grounded in proof.
  const segmentProof = brand.proof.filter((p) => p.segmentIds.includes(segment.id))
  const objectionInsights = insightsFor(language, { kinds: ['objection', 'reason_rejected'], segmentId: segment.id })
  const byTheme = new Map<string, Insight>()
  for (const i of objectionInsights) {
    const prev = byTheme.get(i.theme)
    if (!prev || prev.frequency < i.frequency) byTheme.set(i.theme, i)
  }
  const rankedObjections = [...byTheme.values()]
    .sort((a, b) => b.frequency * Math.min(b.trend, 3) - a.frequency * Math.min(a.trend, 3))
    .sort((a, b) => (a.theme === input.focusTheme ? -1 : b.theme === input.focusTheme ? 1 : 0))
    .slice(0, 4)
  const objections = rankedObjections.map((ins) => {
    const quote = bestQuote(ins)
    const answer = proofForTheme(segmentProof, ins.theme, ins.quotes.map((q) => q.text).join(' '))[0]
    const pillar = brand.pillars
      .map((p) => ({ p, s: coverage(`${ins.theme} ${THEME_VOCAB[ins.theme] ?? ''}`, `${p.name} ${p.statement}`) }))
      .sort((a, b) => b.s - a.s)[0]
    const refs: EvidenceRef[] = [{ kind: 'insight', id: ins.id, note: `${ins.frequency} mentions, trend ×${ins.trend.toFixed(1)}` }]
    if (answer) refs.push({ kind: 'proof', id: answer.proof.id, note: answer.proof.title })
    const response = answer
      ? `${pillar && pillar.s > 0 ? `${pillar.p.statement} ` : ''}Proof: ${answer.proof.title}.`
      : pillar && pillar.s > 0
        ? pillar.p.statement
        : ''
    if (!response) gaps.push(`No proof or pillar answers the “${ins.theme}” objection yet.`)
    return { theme: ins.theme, customerWords: quote ? clause(quote.text) : ins.theme, response, evidence: refs, answerId: answer?.proof.id }
  })
    // Objections with the same proven answer are one objection to the buyer: merge them.
    .reduce<(MarketingBrief['objections'][number] & { answerId?: string })[]>((acc, o) => {
      const twin = o.answerId ? acc.find((x) => x.answerId === o.answerId) : undefined
      if (twin) {
        twin.theme = `${twin.theme} / ${o.theme}`
        twin.evidence = [...twin.evidence, ...o.evidence.filter((e) => !twin.evidence.some((t) => t.id === e.id))]
      } else acc.push(o)
      return acc
    }, [])
    .map(({ answerId: _answerId, ...o }) => o)
  if (objections.length === 0) gaps.push(`No objections captured for ${segment.name}. Add sales-call notes or lost-deal reasons.`)
  for (const o of objections) evidence.push(...o.evidence)

  // ALTERNATIVES & COMPETITORS
  const alternatives = brand.competitors
    .filter((c) => c.kind !== 'direct')
    .map((c) => `${c.name} — ${c.weaknesses[0] ?? c.positioning}`)
  const competitors = brand.competitors
    .filter((c) => c.kind === 'direct')
    .sort((a, b) => (language.competitorMentions[b.name] ?? 0) - (language.competitorMentions[a.name] ?? 0))
    .map((c) => ({ name: c.name, angle: `${c.weaknesses[0] ?? ''}; we win on: ${brand.positioning.differentiator}` }))

  // PROOF — segment proof ranked by specificity and by what has worked here before.
  const proof = [...segmentProof]
    .sort((a, b) => proofRank(b, learnings) - proofRank(a, learnings))
    .map((p) => ({ proofId: p.id, kind: p.kind, text: p.metric ? `${p.title} (${p.metric.label}: ${p.metric.value})` : p.title }))
  if (proof.length === 0) gaps.push(`No proof tagged for ${segment.name}. Copy will avoid specific claims until proof is added.`)
  for (const p of proof.slice(0, 3)) evidence.push({ kind: 'proof', id: p.proofId, note: p.text })

  // MESSAGE & CTA — the central messaging model wins; otherwise the best pillar.
  const focusPillar = input.focusTheme
    ? brand.pillars
        .map((p) => ({ p, s: coverage(`${input.focusTheme} ${THEME_VOCAB[input.focusTheme!] ?? ''}`, `${p.name} ${p.statement}`) }))
        .sort((a, b) => b.s - a.s)[0]
    : undefined
  const pillar =
    focusPillar && focusPillar.s > 0
      ? focusPillar.p
      : brand.pillars.find((p) => p.segmentIds.includes(segment.id)) ?? brand.pillars[0]
  const message =
    input.focusTheme && focusPillar && focusPillar.s > 0
      ? `${focusPillar.p.name}. ${focusPillar.p.statement}`
      : messaging?.coreMessage ?? (pillar ? `${pillar.name}. ${pillar.statement}` : brand.positioning.statement)
  const ctaLearning = learnings.find((l) => l.dimension === 'cta' && l.direction === 'strong')
  const cta = messaging?.cta ?? offer.cta
  if (messaging) evidence.push({ kind: 'source', id: messaging.id, note: `Messaging model v${messaging.version}` })

  // CUSTOMER LANGUAGE — phrases and quotes the copy should reuse.
  const customerPhrases = [
    ...(persona ? [persona.quote] : []),
    ...[topPain, ...rankedObjections.slice(0, 2)].filter((i): i is Insight => Boolean(i)).map((i) => clause(bestQuote(i)?.text ?? '')),
    ...language.phrases.slice(0, 6).map((p) => p.text),
  ].filter((p, i, arr) => p && arr.indexOf(p) === i)

  if (!offer.price) gaps.push(`${offer.name} has no price recorded; pricing-dependent structure decisions are estimates.`)
  if (ws.sources.filter((s) => s.segmentId === segment.id).length < 3) {
    gaps.push(`Fewer than 3 customer sources for ${segment.name}; customer language is thin.`)
  }

  const learningNotes = learnings.slice(0, 5).map((l) => ({ statement: l.statement, learningId: l.id }))
  for (const l of learningNotes) evidence.push({ kind: 'learning', id: l.learningId, note: l.statement })
  if (ctaLearning) evidence.push({ kind: 'learning', id: ctaLearning.id, note: `Best CTA so far: ${ctaLearning.value}` })

  const grounded = evidence.length
  const confidence = Math.max(0.2, Math.min(0.95, 0.3 + grounded * 0.05 - gaps.length * 0.07))

  return {
    offer: { id: offer.id, name: offer.name, summary: offer.description },
    audience: { segmentId: segment.id, name: segment.name, description: segment.description, persona: persona?.name },
    problem,
    problemTheme: topPain?.theme,
    problemQuote,
    desiredOutcome,
    awareness: segment.awareness,
    sophistication: segment.sophistication,
    objections,
    alternatives,
    competitors,
    proof,
    positioning: messaging?.positioning ?? brand.positioning.statement,
    message,
    cta,
    channel: input.channel,
    trafficSource: input.trafficSource,
    voice: { tone: brand.voice.tone, traits: brand.voice.traits, avoid: brand.voice.wordsToAvoid },
    customerPhrases,
    learnings: learningNotes,
    evidence,
    gaps,
    confidence,
  }
}

/** One-line human summary of a brief, used in rationale and UI. */
export function briefHeadline(brief: MarketingBrief): string {
  return `${brief.audience.name} · ${brief.awareness.replace('_', '-')} · sophistication ${brief.sophistication} · ${lowerFirst(brief.message.split('.')[0])}`
}
