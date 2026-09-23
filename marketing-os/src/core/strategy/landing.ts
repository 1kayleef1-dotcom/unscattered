/**
 * Landing page strategy engine.
 *
 * Chooses a strategic approach (problem-led, outcome-led, proof-led,
 * demo-led, comparison-led, education-led, product-led) by scoring each
 * against the audience's awareness and sophistication, the traffic source,
 * price and purchase complexity, the evidence available and what has
 * already worked for this segment. Then assembles a section structure for
 * that approach — adding or dropping sections based on the brief, never
 * forcing every page into the same template — and explains every choice.
 */
import type { LandingStrategy, Learning, MarketingBrief, Offer, TrafficSource } from '../types.ts'

export const LANDING_STRATEGY_LABELS: Record<LandingStrategy, string> = {
  problem_led: 'Problem-led',
  outcome_led: 'Outcome-led',
  proof_led: 'Proof-led',
  demo_led: 'Demo-led',
  comparison_led: 'Comparison-led',
  education_led: 'Education-led',
  product_led: 'Product-led',
}

export interface LandingContext {
  brief: MarketingBrief
  offer: Offer
  trafficSource: TrafficSource
  learnings: Learning[]
  competitorMentions: number
  /** Force a strategy (user override); still scored for the explanation. */
  forced?: LandingStrategy
  /** Theme the page must be built around (e.g. "Unclear ROI"). */
  focusTheme?: string
}

export interface StrategyScore {
  strategy: LandingStrategy
  score: number
  reasons: string[]
}

const COLD_TRAFFIC: TrafficSource[] = ['paid_social', 'outbound', 'referral']
const HIGH_INTENT: TrafficSource[] = ['paid_search', 'direct', 'retargeting', 'email']

export function scoreStrategies(ctx: LandingContext): StrategyScore[] {
  const { brief, offer, trafficSource, learnings } = ctx
  const s = (strategy: LandingStrategy) => ({ strategy, score: 0, reasons: [] as string[] })
  const scores: Record<LandingStrategy, StrategyScore> = {
    problem_led: s('problem_led'),
    outcome_led: s('outcome_led'),
    proof_led: s('proof_led'),
    demo_led: s('demo_led'),
    comparison_led: s('comparison_led'),
    education_led: s('education_led'),
    product_led: s('product_led'),
  }
  const add = (k: LandingStrategy, pts: number, why: string) => {
    scores[k].score += pts
    scores[k].reasons.push(`${pts > 0 ? '+' : ''}${pts} ${why}`)
  }

  // Awareness: how far the reader is from knowing about this offer.
  switch (brief.awareness) {
    case 'unaware':
      add('education_led', 3, 'unaware audience needs the problem explained first')
      add('problem_led', 2, 'naming an unrecognized problem earns attention')
      add('product_led', -3, 'unaware readers are not ready for product detail')
      break
    case 'problem_aware':
      add('problem_led', 3, 'problem-aware readers respond to seeing their pain named precisely')
      add('education_led', 1, 'they still need to learn solutions exist')
      break
    case 'solution_aware':
      add('outcome_led', 2, 'solution-aware readers compare outcomes between options')
      add('comparison_led', 2, 'they are actively weighing alternatives')
      add('proof_led', 1, 'they need a reason to believe this option over others')
      break
    case 'product_aware':
      add('proof_led', 3, 'product-aware readers need proof it works for people like them')
      add('demo_led', 2, 'seeing it is the next step for someone who knows the product')
      break
    case 'most_aware':
      add('product_led', 3, 'most-aware readers only need the offer and the next step')
      add('demo_led', 1, 'a direct path to trying it')
      break
  }

  // Sophistication: jaded markets discount claims and reward proof and specificity.
  if (brief.sophistication >= 4) {
    add('proof_led', 2, `sophistication ${brief.sophistication}: the market has heard every claim, proof beats promises`)
    add('outcome_led', -1, 'generic outcome promises are discounted in a sophisticated market')
  } else if (brief.sophistication <= 2) {
    add('outcome_led', 2, `sophistication ${brief.sophistication}: a clear, big outcome still lands`)
  }

  // Traffic source & intent.
  if (COLD_TRAFFIC.includes(trafficSource)) {
    add('problem_led', 2, `${trafficSource.replace('_', ' ')} traffic is cold and interrupted — lead with their problem`)
    add('education_led', 1, 'cold traffic benefits from context')
    add('demo_led', -1, 'asking cold traffic for a demo too early')
  }
  if (HIGH_INTENT.includes(trafficSource)) {
    add('demo_led', 1, `${trafficSource.replace('_', ' ')} traffic has intent — shorten the path to action`)
    add('product_led', 1, 'high-intent visitors want specifics')
  }
  if (trafficSource === 'paid_search' && ctx.competitorMentions >= 2) {
    add('comparison_led', 2, 'search traffic plus frequent competitor mentions suggests comparison intent')
  }

  // Price & purchase complexity.
  if (offer.priceTier === 'enterprise' || offer.priceTier === 'high' || offer.purchaseComplexity === 'complex') {
    add('proof_led', 2, 'high price and complex purchase: buyers must justify it internally')
    add('demo_led', 2, 'complex products sell through a guided demo')
    add('product_led', -2, 'self-serve product pages under-serve a complex purchase')
  }
  if (offer.priceTier === 'low' && offer.purchaseComplexity === 'simple') {
    add('product_led', 2, 'low price, simple purchase: remove friction')
  }

  // Evidence available.
  const strongProof = brief.proof.filter((p) => p.kind === 'case_study' || p.kind === 'metric').length
  if (strongProof >= 2) add('proof_led', 2, `${strongProof} pieces of quantified proof available for this segment`)
  if (strongProof === 0) add('proof_led', -4, 'no quantified proof for this segment')
  if (brief.competitors.length === 0 && brief.alternatives.length === 0) add('comparison_led', -3, 'nothing documented to compare against')
  if (ctx.competitorMentions >= 3) add('comparison_led', 1, `competitors mentioned ${ctx.competitorMentions} times in customer conversations`)

  // Objections: many, strong objections favour pages that answer them head-on.
  const topObjection = brief.objections[0]
  if (topObjection && /roi|price|cost/i.test(topObjection.theme)) {
    add('proof_led', 2, `top objection is “${topObjection.theme}” — answer it with economic proof`)
  }
  if (topObjection && /implementation/i.test(topObjection.theme)) {
    add('demo_led', 1, 'implementation anxiety is best answered by showing the process')
  }

  // Focus theme from the problem solver.
  if (ctx.focusTheme && /roi|price/i.test(ctx.focusTheme)) {
    add('proof_led', 3, `problem solver asked for a page built around “${ctx.focusTheme}”`)
  }

  // What has already worked for this segment.
  for (const l of learnings.filter((l) => l.dimension === 'strategy')) {
    const k = l.value as LandingStrategy
    if (!(k in scores)) continue
    const pts = Math.round(Math.max(-3, Math.min(3, l.effect * 6)))
    if (pts !== 0) add(k, pts, `learned: ${l.statement}`)
  }

  const ranked = Object.values(scores).sort((a, b) => b.score - a.score)
  if (ctx.forced) {
    const forced = ranked.find((r) => r.strategy === ctx.forced)!
    return [forced, ...ranked.filter((r) => r !== forced)]
  }
  return ranked
}

export interface PlannedSection {
  kind: string
  title: string
  purpose: string
}

const BASE: Record<LandingStrategy, string[]> = {
  problem_led: ['hero', 'problem', 'cost_of_inaction', 'solution', 'benefits', 'case_study', 'objections', 'risk_reversal', 'final_cta'],
  outcome_led: ['hero', 'outcomes', 'how_it_works', 'benefits', 'testimonials', 'objections', 'final_cta'],
  proof_led: ['hero', 'social_proof', 'case_study', 'results', 'how_it_works', 'testimonials', 'objections', 'risk_reversal', 'final_cta'],
  demo_led: ['hero', 'demo_preview', 'how_it_works', 'implementation', 'testimonials', 'faq', 'final_cta'],
  comparison_led: ['hero', 'comparison', 'switching', 'case_study', 'objections', 'faq', 'final_cta'],
  education_led: ['hero', 'education', 'problem', 'framework', 'solution', 'case_study', 'final_cta'],
  product_led: ['hero', 'features', 'benefits', 'social_proof', 'pricing', 'faq', 'final_cta'],
}

const SECTION_META: Record<string, { title: string; purpose: string }> = {
  hero: { title: 'Hero', purpose: 'Earn the next five seconds: headline, subheadline, primary CTA.' },
  problem: { title: 'Problem', purpose: 'Name the problem in the customer’s own words.' },
  cost_of_inaction: { title: 'Cost of doing nothing', purpose: 'Make the status quo expensive.' },
  solution: { title: 'Solution', purpose: 'Introduce the mechanism that solves it.' },
  outcomes: { title: 'Outcomes', purpose: 'Show life after the problem is solved.' },
  benefits: { title: 'Benefits', purpose: 'Translate features into outcomes the reader cares about.' },
  features: { title: 'Features', purpose: 'Specifics for readers who already know what they want.' },
  how_it_works: { title: 'How it works', purpose: 'Make the path concrete and low-effort.' },
  social_proof: { title: 'Social proof', purpose: 'Signal that people like the reader already trust this.' },
  testimonials: { title: 'Testimonials', purpose: 'Let customers make the claims.' },
  case_study: { title: 'Case study', purpose: 'One specific story with a measurable result.' },
  results: { title: 'Results', purpose: 'The numbers, each tied to approved proof.' },
  roi: { title: 'The economics', purpose: 'Make the economic value explicit: cost of manual work vs. payback.' },
  objections: { title: 'Objection handling', purpose: 'Answer the reasons people hesitate, in their words.' },
  comparison: { title: 'Comparison', purpose: 'Contrast against the real alternatives.' },
  switching: { title: 'Switching', purpose: 'Remove fear of the move itself.' },
  implementation: { title: 'Implementation', purpose: 'Show exactly what rollout looks like.' },
  demo_preview: { title: 'Demo preview', purpose: 'Show the product doing the job.' },
  education: { title: 'The insight', purpose: 'Teach something that reframes the problem.' },
  framework: { title: 'The framework', purpose: 'A memorable model the reader can use.' },
  pricing: { title: 'Pricing', purpose: 'Clear price and what is included.' },
  faq: { title: 'FAQ', purpose: 'Catch remaining questions before they become exits.' },
  risk_reversal: { title: 'Risk reversal', purpose: 'Make saying yes feel safe.' },
  final_cta: { title: 'Final CTA', purpose: 'Restate the promise and ask once more.' },
}

export interface LandingPlan {
  strategy: LandingStrategy
  ranked: StrategyScore[]
  sections: PlannedSection[]
  adjustments: string[]
  explanation: string
}

export function planLandingPage(ctx: LandingContext): LandingPlan {
  const ranked = scoreStrategies(ctx)
  const strategy = ranked[0].strategy
  const kinds = [...BASE[strategy]]
  const adjustments: string[] = []
  const { brief, offer } = ctx

  const insertBefore = (kind: string, before: string, why: string) => {
    if (kinds.includes(kind)) return
    const at = kinds.indexOf(before)
    kinds.splice(at === -1 ? kinds.length - 1 : at, 0, kind)
    adjustments.push(`Added ${SECTION_META[kind].title}: ${why}`)
  }
  const remove = (kind: string, why: string) => {
    if (!kinds.includes(kind)) return
    kinds.splice(kinds.indexOf(kind), 1)
    adjustments.push(`Dropped ${SECTION_META[kind].title}: ${why}`)
  }

  const economic = brief.objections.some((o) => /roi|price|cost/i.test(o.theme)) || (ctx.focusTheme && /roi|price/i.test(ctx.focusTheme))
  if (economic) insertBefore('roi', kinds.includes('objections') ? 'objections' : 'final_cta', 'price/ROI is a leading objection, so the economics get their own section')
  if (brief.objections.length >= 3) insertBefore('faq', 'final_cta', `${brief.objections.length} distinct objections — the long tail goes in an FAQ`)
  if (brief.objections.some((o) => /implementation|switch/i.test(o.theme)) && !kinds.includes('implementation')) {
    insertBefore('implementation', kinds.includes('objections') ? 'objections' : 'final_cta', 'implementation anxiety shows up in customer conversations')
  }
  if (offer.guarantee && !kinds.includes('risk_reversal')) insertBefore('risk_reversal', 'final_cta', `a guarantee exists (“${offer.guarantee}”)`)
  if ((offer.priceTier === 'enterprise' || offer.purchaseComplexity === 'complex') && kinds.includes('pricing')) {
    remove('pricing', 'enterprise pricing is quoted on a call; a price table would anchor without context')
  }
  if (brief.proof.length === 0) {
    remove('case_study', 'no case study for this segment')
    remove('results', 'no approved numbers for this segment')
    remove('testimonials', 'no testimonials for this segment')
  }
  if (!brief.proof.some((p) => p.kind === 'testimonial')) remove('testimonials', 'no testimonial tagged for this segment')

  const sections = kinds.map((k) => ({ kind: k, ...SECTION_META[k] }))
  const winner = ranked[0]
  const runnerUp = ranked[1]
  const explanation =
    `${LANDING_STRATEGY_LABELS[strategy]} scored ${winner.score} (next: ${LANDING_STRATEGY_LABELS[runnerUp.strategy]} at ${runnerUp.score}). ` +
    `Top reasons: ${winner.reasons.filter((r) => r.startsWith('+')).slice(0, 3).map((r) => r.replace(/^\+\d+ /, '')).join('; ')}.`

  return { strategy, ranked, sections, adjustments, explanation }
}
