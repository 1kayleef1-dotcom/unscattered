/**
 * Social content planner.
 *
 * Social content is planned from real material — questions customers ask,
 * customer stories, the company's own data, a point of view against the
 * status quo, product insights — and each post is tied to an objective.
 * Themes already covered by existing social assets are deprioritised so
 * the feed does not turn into "5 tips" on repeat.
 */
import { bestQuote, insightsFor } from '../language/customerLanguage.ts'
import type { BrandBrain, Channel, CustomerLanguageIndex, EvidenceRef, Learning, MarketingBrief } from '../types.ts'
import { clause } from '../util/text.ts'

export type SocialSource = 'audience_question' | 'customer_story' | 'data' | 'opinion' | 'product_insight' | 'founder'

export const SOCIAL_SOURCE_LABELS: Record<SocialSource, string> = {
  audience_question: 'Audience question',
  customer_story: 'Customer story',
  data: 'Data point',
  opinion: 'Point of view',
  product_insight: 'Product insight',
  founder: 'Founder perspective',
}

const PLATFORM_LABELS: Partial<Record<Channel, string>> = {
  linkedin: 'LinkedIn',
  x: 'X',
  instagram: 'Instagram',
  threads: 'Threads',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  meta: 'Facebook',
}

export interface SocialIdea {
  platform: Channel
  platformLabel: string
  source: SocialSource
  sourceLabel: string
  topic: string
  theme: string
  objective: 'Awareness' | 'Consideration' | 'Conversion' | 'Trust'
  why: string
  evidence: EvidenceRef[]
  material: { quote?: string; proofId?: string; question?: string; stance?: string; feature?: string }
}

interface Ctx {
  brand: BrandBrain
  language: CustomerLanguageIndex
  learnings: Learning[]
  brief: MarketingBrief
  existingThemes: string[]
}

export function planSocial(ctx: Ctx, opts: { count: number; platforms: Channel[]; sourceProofId?: string }): SocialIdea[] {
  const { brand, language, brief } = ctx
  const seg = brief.audience.segmentId
  const ideas: (SocialIdea & { score: number })[] = []
  const platforms = opts.platforms.length ? opts.platforms : ['linkedin' as Channel]
  const recentlyCovered = new Set(ctx.existingThemes)

  // Questions and objections customers raise → answer them publicly.
  for (const ins of insightsFor(language, { kinds: ['objection', 'product_request'], segmentId: seg }).slice(0, 4)) {
    const q = bestQuote(ins)
    if (!q) continue
    ideas.push({
      platform: platforms[0], platformLabel: '', source: 'audience_question', sourceLabel: SOCIAL_SOURCE_LABELS.audience_question,
      topic: `Answering “${clause(q.text)}”`, theme: ins.theme, objective: 'Consideration',
      why: `${ins.frequency} prospects raised “${ins.theme}”; answering it in public pre-handles it before sales calls.`,
      evidence: [{ kind: 'insight', id: ins.id, note: ins.summary }], material: { quote: clause(q.text), question: ins.theme },
      score: ins.frequency * Math.min(ins.trend, 3),
    })
  }
  // Customer stories.
  for (const p of brand.proof.filter((p) => p.kind === 'case_study' && p.segmentIds.includes(seg))) {
    ideas.push({
      platform: platforms[0], platformLabel: '', source: 'customer_story', sourceLabel: SOCIAL_SOURCE_LABELS.customer_story,
      topic: p.title, theme: 'Customer story', objective: 'Trust',
      why: 'A specific story with a measurable result is the most credible content we can publish.',
      evidence: [{ kind: 'proof', id: p.id, note: p.title }], material: { proofId: p.id }, score: 6,
    })
  }
  // Data points.
  for (const p of brand.proof.filter((p) => p.kind === 'metric' && p.segmentIds.includes(seg)).slice(0, 2)) {
    ideas.push({
      platform: platforms[0], platformLabel: '', source: 'data', sourceLabel: SOCIAL_SOURCE_LABELS.data,
      topic: p.title, theme: p.metric?.label ?? 'Data', objective: 'Awareness',
      why: 'Our own data is content nobody else can publish.',
      evidence: [{ kind: 'proof', id: p.id, note: p.title }], material: { proofId: p.id }, score: 5,
    })
  }
  // A point of view against the status quo.
  const statusQuo = brand.competitors.find((c) => c.kind === 'status_quo')
  if (statusQuo) {
    ideas.push({
      platform: platforms[0], platformLabel: '', source: 'opinion', sourceLabel: SOCIAL_SOURCE_LABELS.opinion,
      topic: `${statusQuo.name} isn’t free`, theme: 'Status quo', objective: 'Awareness',
      why: `Challenging “${statusQuo.positioning.toLowerCase()}” gives the audience a reason to re-evaluate without a sales pitch.`,
      evidence: [], material: { stance: statusQuo.weaknesses.join('; ') }, score: 4.5,
    })
  }
  // Product insight tied to the top pain.
  const offer = brand.offers.find((o) => o.id === brief.offer.id)
  const feature = offer?.features[0]
  if (feature) {
    ideas.push({
      platform: platforms[0], platformLabel: '', source: 'product_insight', sourceLabel: SOCIAL_SOURCE_LABELS.product_insight,
      topic: `Why we built ${feature.name.toLowerCase()} this way`, theme: brief.problemTheme ?? feature.name, objective: 'Consideration',
      why: `Connects a product decision to the pain customers name most (${brief.problemTheme ?? 'top pain'}).`,
      evidence: [], material: { feature: `${feature.name}: ${feature.benefit}` }, score: 3.5,
    })
  }
  ideas.push({
    platform: platforms[0], platformLabel: '', source: 'founder', sourceLabel: SOCIAL_SOURCE_LABELS.founder,
    topic: brand.mission, theme: 'Mission', objective: 'Trust',
    why: 'Founder-voice posts explain why the company exists; they build trust with buyers who will meet the team.',
    evidence: [], material: {}, score: 2.5,
  })

  for (const i of ideas) if (recentlyCovered.has(i.theme)) i.score -= 3
  // Repurposing: the source proof leads, everything else is secondary.
  if (opts.sourceProofId) {
    const p = brand.proof.find((x) => x.id === opts.sourceProofId)
    if (p) {
      ideas.unshift({
        platform: platforms[0], platformLabel: '', source: p.kind === 'metric' ? 'data' : 'customer_story', sourceLabel: SOCIAL_SOURCE_LABELS[p.kind === 'metric' ? 'data' : 'customer_story'],
        topic: p.title, theme: 'Customer story', objective: 'Trust', why: 'Repurposed from a source asset: same message, adapted to the channel.',
        evidence: [{ kind: 'proof', id: p.id, note: p.title }], material: { proofId: p.id }, score: 100,
      })
    }
  }

  return ideas
    .sort((a, b) => b.score - a.score)
    .slice(0, opts.count)
    .map(({ score: _score, ...idea }, i) => {
      const platform = platforms[i % platforms.length]
      return { ...idea, platform, platformLabel: PLATFORM_LABELS[platform] ?? platform }
    })
}
