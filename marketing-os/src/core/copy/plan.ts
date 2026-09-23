/**
 * Asset planning: strategy → section specs.
 *
 * The strategy engines decide *what* each part of an asset must do and
 * *why*. This module turns those decisions into `SectionSpec`s — the exact
 * sections and blocks a copy model must fill — plus the rationale and the
 * tags that later connect this copy to performance. The copy model (local
 * or Claude) never decides strategy on its own; it writes to a plan.
 */
import { AD_ANGLE_LABELS, PLATFORM_SPECS, evaluateAngles, type AngleCandidate } from '../strategy/ads.ts'
import { EMAIL_JOB_LABELS, planSequence, type EmailJob } from '../strategy/email.ts'
import { LANDING_STRATEGY_LABELS, planLandingPage } from '../strategy/landing.ts'
import { planSocial, type SocialIdea } from '../strategy/social.ts'
import type {
  AssetTags,
  AssetType,
  BrandBrain,
  Channel,
  CustomerLanguageIndex,
  GenerationParams,
  Learning,
  MarketingBrief,
  MetricKey,
  Rationale,
} from '../types.ts'

export interface BlockSpec {
  key: string
  label: string
  maxChars?: number
  guidance: string
}

export interface SectionSpec {
  id: string
  kind: string
  title: string
  purpose: string
  blocks: BlockSpec[]
  meta?: Record<string, string | number>
  rationale?: string
}

export interface AssetPlan {
  assetType: AssetType
  channel: Channel
  sections: SectionSpec[]
  rationale: Rationale
  tags: AssetTags
  creativeConcept: string
  primaryMetric: MetricKey
  secondaryMetrics: MetricKey[]
  strategyLabel: string
  /** Theme the asset must be built around, when the problem solver set one. */
  focusTheme?: string
}

export type PlanOptions = Partial<Omit<GenerationParams, 'assetType' | 'channel' | 'segmentId' | 'goal'>>

export interface PlanContext {
  brand: BrandBrain
  language: CustomerLanguageIndex
  learnings: Learning[]
  brief: MarketingBrief
  existingThemes: string[]
}

const LANDING_BLOCKS: Record<string, BlockSpec[]> = {
  hero: [
    { key: 'headline', label: 'Headline', maxChars: 90, guidance: 'The central promise or problem, specific, no hype.' },
    { key: 'subheadline', label: 'Subheadline', maxChars: 200, guidance: 'How, for whom, and why believe it.' },
    { key: 'cta', label: 'Primary CTA', maxChars: 30, guidance: 'Verb-first, the next step.' },
    { key: 'support', label: 'Support line', maxChars: 120, guidance: 'One line of proof or risk reduction under the CTA.' },
  ],
  objections: [
    { key: 'intro', label: 'Intro', maxChars: 120, guidance: 'Acknowledge that hesitation is reasonable.' },
    { key: 'items', label: 'Objections & answers', guidance: 'Each objection in the customer’s words, then a specific answer with proof.' },
  ],
  faq: [{ key: 'items', label: 'Questions & answers', guidance: 'Plain answers to remaining questions.' }],
  final_cta: [
    { key: 'headline', label: 'Headline', maxChars: 90, guidance: 'Restate the promise.' },
    { key: 'body', label: 'Body', maxChars: 200, guidance: 'Remove the last bit of friction.' },
    { key: 'cta', label: 'CTA', maxChars: 30, guidance: 'Same CTA as the hero.' },
  ],
}

function defaultBlocks(kind: string): BlockSpec[] {
  return (
    LANDING_BLOCKS[kind] ?? [
      { key: 'headline', label: 'Section headline', maxChars: 90, guidance: 'The one idea of this section.' },
      { key: 'body', label: 'Body', guidance: 'Specific, grounded in the brief’s evidence.' },
    ]
  )
}

function ctaStyle(cta: string): AssetTags['ctaStyle'] {
  if (/demo|walkthrough|see it/i.test(cta)) return 'demo'
  if (/call|talk|strategy/i.test(cta)) return 'call'
  if (/trial|try|start free/i.test(cta)) return 'trial'
  if (/buy|order|get started/i.test(cta)) return 'buy'
  if (/download|calculat|get the/i.test(cta)) return 'download'
  return 'learn'
}

function proofTag(brief: MarketingBrief): AssetTags['proofType'] {
  return brief.proof[0]?.kind ?? 'none'
}

export function planAsset(assetType: AssetType, channel: Channel, ctx: PlanContext, opts: PlanOptions = {}): AssetPlan {
  return { ...planInner(assetType, channel, ctx, opts), focusTheme: opts.focusTheme }
}

function planInner(assetType: AssetType, channel: Channel, ctx: PlanContext, opts: PlanOptions): AssetPlan {
  const { brief, brand } = ctx
  const offer = brand.offers.find((o) => o.id === brief.offer.id) ?? brand.offers[0]
  const baseTags: AssetTags = { ctaStyle: ctaStyle(brief.cta), proofType: proofTag(brief), theme: opts.focusTheme ?? brief.problemTheme, offerType: offer.guarantee ? 'guarantee' : 'value' }

  switch (assetType) {
    case 'landing_page': {
      const competitorMentions = Object.values(ctx.language.competitorMentions).reduce((a, b) => a + b, 0)
      const lp = planLandingPage({
        brief,
        offer,
        trafficSource: opts.trafficSource ?? brief.trafficSource ?? 'paid_social',
        learnings: ctx.learnings,
        competitorMentions,
        forced: opts.strategy,
        focusTheme: opts.focusTheme,
      })
      if (opts.sectionsOnly?.length) lp.sections = lp.sections.filter((s) => opts.sectionsOnly!.includes(s.kind))
      return {
        assetType,
        channel: 'web',
        sections: lp.sections.map((s, i) => ({ id: `s${i + 1}_${s.kind}`, kind: s.kind, title: s.title, purpose: s.purpose, blocks: defaultBlocks(s.kind) })),
        rationale: {
          summary: lp.explanation,
          decisions: [
            { decision: `Structure: ${LANDING_STRATEGY_LABELS[lp.strategy]}`, why: lp.ranked[0].reasons.join('; '), evidence: brief.evidence.slice(0, 4) },
            ...lp.adjustments.map((a) => ({ decision: a.split(':')[0], why: a.split(':').slice(1).join(':').trim(), evidence: [] })),
            ...(opts.strategy ? [{ decision: `Strategy requested: ${LANDING_STRATEGY_LABELS[opts.strategy]}`, why: `Set by the request (${opts.focusTheme ? 'problem solver' : 'user'}), not chosen by the engine; its full ranking is under alternatives.`, evidence: [] }] : []),
          ],
          alternativesConsidered: lp.ranked.slice(1, 4).map((r) => ({ option: LANDING_STRATEGY_LABELS[r.strategy], score: r.score, why: r.reasons.slice(0, 2).join('; ') })),
        },
        tags: { ...baseTags, strategy: lp.strategy },
        creativeConcept: `${LANDING_STRATEGY_LABELS[lp.strategy]} page: ${brief.message.split('.')[0]}`,
        primaryMetric: 'qualified_cvr',
        secondaryMetrics: ['cvr'],
        strategyLabel: LANDING_STRATEGY_LABELS[lp.strategy],
      }
    }

    case 'email_sequence': {
      const kind = opts.sequenceKind ?? 'lead_nurture'
      const seq = planSequence(kind, brief, offer)
      if (opts.singleEmailJob) {
        seq.emails = [{ index: 1, day: 0, job: opts.singleEmailJob as EmailJob, proofId: opts.sourceProofId ?? brief.proof[0]?.proofId, purpose: `${EMAIL_JOB_LABELS[opts.singleEmailJob as EmailJob] ?? 'Email'} — standalone send` }]
        seq.narrative = `A single ${EMAIL_JOB_LABELS[opts.singleEmailJob as EmailJob]?.toLowerCase() ?? 'email'} for ${brief.audience.name}, carrying the source message to the list.`
        seq.reasoning = ['Repurposed as one standalone email rather than a sequence.']
      }
      return {
        assetType,
        channel: 'email',
        sections: seq.emails.map((e) => ({
          id: `e${e.index}`,
          kind: e.job,
          title: `Email ${e.index} · Day ${e.day} · ${EMAIL_JOB_LABELS[e.job]}`,
          purpose: e.purpose,
          meta: { day: e.day, job: e.job, ...(e.objectionTheme ? { objection: e.objectionTheme } : {}), ...(e.proofId ? { proofId: e.proofId } : {}), ...(e.branch ? { branch: e.branch } : {}) },
          blocks: [
            { key: 'subject', label: 'Subject', maxChars: 60, guidance: 'Specific, curiosity or benefit, no clickbait.' },
            { key: 'preview', label: 'Preview text', maxChars: 90, guidance: 'Extends the subject.' },
            { key: 'body', label: 'Body', guidance: 'One idea, one CTA. Plain, personal, peer-to-peer.' },
            { key: 'cta', label: 'CTA', maxChars: 40, guidance: 'Verb-first.' },
          ],
        })),
        rationale: {
          summary: seq.narrative,
          decisions: [
            { decision: `${seq.emails.length} emails over ${seq.emails[seq.emails.length - 1]?.day ?? 0} days`, why: seq.reasoning.join(' '), evidence: brief.evidence.filter((e) => e.kind === 'insight').slice(0, 4) },
            { decision: 'Segmentation', why: seq.segmentation.join('; '), evidence: [] },
            { decision: 'Exit & branch rules', why: seq.exitRules.join('; '), evidence: [] },
            { decision: 'Personalization', why: seq.personalization.join(', '), evidence: [] },
          ],
        },
        tags: { ...baseTags, sequenceKind: kind },
        creativeConcept: `${seq.blueprint.label}: ${seq.blueprint.goal}`,
        primaryMetric: 'click_rate',
        secondaryMetrics: ['open_rate', 'unsubscribe_rate', 'qualified_cvr'],
        strategyLabel: seq.blueprint.label,
      }
    }

    case 'ad_set':
    case 'creative_concept': {
      const candidates = evaluateAngles(brief, ctx.learnings, { count: opts.variationCount ?? 3, require: opts.angles })
      const selected = candidates.filter((c) => c.selected)
      const spec = PLATFORM_SPECS[channel] ?? PLATFORM_SPECS.meta!
      const isConcept = assetType === 'creative_concept'
      return {
        assetType,
        channel,
        sections: selected.map((c, i) => ({
          id: `v${String.fromCharCode(65 + i)}`,
          kind: c.angle,
          title: `${isConcept ? 'Concept' : 'Variation'} ${String.fromCharCode(65 + i)} · ${AD_ANGLE_LABELS[c.angle]} angle`,
          purpose: c.hypothesis,
          meta: angleMeta(c, brief),
          rationale: c.reason,
          blocks: isConcept ? conceptBlocks() : spec.fields.flatMap((f) => (f.count ? Array.from({ length: f.count }, (_, n) => ({ key: `${f.key}_${n + 1}`, label: `${f.label} ${n + 1}`, maxChars: f.max, guidance: spec.notes })) : [{ key: f.key, label: f.label, maxChars: f.max, guidance: spec.notes }])),
        })),
        rationale: {
          summary: `${selected.length} strategically distinct angles for ${brief.audience.name} on ${spec.label}. Each is a hypothesis with its own success metric, so the test teaches us something regardless of which wins.`,
          decisions: selected.map((c) => ({ decision: `${AD_ANGLE_LABELS[c.angle]} angle`, why: `${c.reason} Hypothesis: ${c.hypothesis}`, evidence: brief.evidence.filter((e) => (c.proofId ? e.id === c.proofId : e.kind === 'insight')).slice(0, 2) })),
          alternativesConsidered: candidates.filter((c) => !c.selected).map((c) => ({ option: AD_ANGLE_LABELS[c.angle], score: Math.round(c.score), why: c.reason })),
        },
        tags: { ...baseTags, angle: selected[0]?.angle },
        creativeConcept: selected.map((c) => AD_ANGLE_LABELS[c.angle]).join(' vs. '),
        primaryMetric: selected.some((c) => c.metric === 'qualified_cvr') ? 'qualified_cvr' : 'ctr',
        secondaryMetrics: ['ctr', 'cac'],
        strategyLabel: `${selected.length} angles`,
      }
    }

    case 'video_script': {
      const cand = evaluateAngles(brief, ctx.learnings, { count: 2, require: opts.angles })
      const selected = cand.filter((c) => c.selected).slice(0, opts.variationCount ?? 2)
      return {
        assetType,
        channel,
        sections: selected.map((c, i) => ({
          id: `vid${i + 1}`,
          kind: c.angle,
          title: `Script ${i + 1} · ${AD_ANGLE_LABELS[c.angle]} angle · ~30s`,
          purpose: c.hypothesis,
          meta: angleMeta(c, brief),
          rationale: c.reason,
          blocks: [
            { key: 'hook', label: 'Hook (0–3s)', maxChars: 90, guidance: 'Visual + verbal; must work on mute.' },
            { key: 'scene_1', label: 'Scene 1 — the problem', guidance: 'VISUAL: … / VO or DIALOGUE: …' },
            { key: 'pattern_interrupt', label: 'Pattern interrupt', guidance: 'A cut, reveal or contrast that resets attention.' },
            { key: 'scene_2', label: 'Scene 2 — the turn', guidance: 'Show the mechanism, not a feature tour.' },
            { key: 'proof', label: 'Proof', guidance: 'A number or customer line on screen.' },
            { key: 'cta', label: 'CTA', maxChars: 60, guidance: 'Spoken and on screen.' },
          ],
        })),
        rationale: {
          summary: `Short-form scripts built on the ${selected.map((c) => AD_ANGLE_LABELS[c.angle].toLowerCase()).join(' and ')} angles.`,
          decisions: selected.map((c) => ({ decision: `${AD_ANGLE_LABELS[c.angle]} script`, why: c.hypothesis, evidence: [] })),
        },
        tags: { ...baseTags, angle: selected[0]?.angle },
        creativeConcept: 'Person-to-camera, lo-fi, captioned',
        primaryMetric: 'ctr',
        secondaryMetrics: ['engagement_rate'],
        strategyLabel: 'Short-form video',
      }
    }

    case 'social_post':
    case 'carousel':
    case 'thread': {
      const ideas = planSocial(ctx, { count: opts.variationCount ?? (assetType === 'social_post' ? 4 : 1), platforms: opts.platforms ?? [channel], sourceProofId: opts.sourceProofId })
      return {
        assetType,
        channel,
        sections: ideas.map((idea, i) => socialSection(assetType, idea, i)),
        rationale: {
          summary: `Content planned from real inputs — customer questions, stories, data and opinions — each tied to a business objective. Topics already covered recently were skipped.`,
          decisions: ideas.map((idea) => ({ decision: `${idea.sourceLabel}: ${idea.topic}`, why: `${idea.objective} — ${idea.why}`, evidence: idea.evidence })),
        },
        tags: { ...baseTags, theme: ideas[0]?.theme },
        creativeConcept: ideas.map((i) => i.sourceLabel).join(', '),
        primaryMetric: 'engagement_rate',
        secondaryMetrics: ['ctr'],
        strategyLabel: `${ideas.length} post${ideas.length === 1 ? '' : 's'}`,
      }
    }

    case 'sales_enablement': {
      const sections: SectionSpec[] = [
        { id: 'se_talk', kind: 'talk_track', title: 'Talk track', purpose: 'The 30-second story a rep tells.', blocks: [{ key: 'body', label: 'Talk track', guidance: 'Problem → insight → how we solve it → proof → next step.' }] },
        { id: 'se_disc', kind: 'discovery', title: 'Discovery questions', purpose: 'Questions that surface the pains we solve.', blocks: [{ key: 'body', label: 'Questions', guidance: 'Open questions tied to top pains.' }] },
        ...brief.objections.map((o, i) => ({ id: `se_obj${i + 1}`, kind: 'objection', title: `Objection: ${o.theme}`, purpose: `Handle “${o.customerWords}”`, meta: { objection: o.theme }, blocks: [{ key: 'body', label: 'Response', guidance: 'Acknowledge, reframe, prove, confirm.' }] })),
        { id: 'se_proof', kind: 'proof', title: 'Proof to share', purpose: 'Evidence the rep can send after the call.', blocks: [{ key: 'body', label: 'Proof points', guidance: 'Approved proof only.' }] },
      ]
      return {
        assetType,
        channel: 'sales',
        sections,
        rationale: { summary: `Sales enablement for ${brief.audience.name}, built from the same brief as the campaign so reps say what the marketing says.`, decisions: brief.objections.map((o) => ({ decision: `Objection handler: ${o.theme}`, why: `Customers say “${o.customerWords}”.`, evidence: o.evidence })) },
        tags: baseTags,
        creativeConcept: 'Sales one-pager',
        primaryMetric: 'qualified_cvr',
        secondaryMetrics: ['pipeline'],
        strategyLabel: 'Sales enablement',
      }
    }
  }
}

function angleMeta(c: AngleCandidate, brief: MarketingBrief): Record<string, string | number> {
  return {
    angle: c.angle,
    hypothesis: c.hypothesis,
    creative: c.creative,
    metric: c.metric,
    audience: brief.audience.name,
    ...(c.objectionTheme ? { objection: c.objectionTheme } : {}),
    ...(c.proofId ? { proofId: c.proofId } : {}),
  }
}

function conceptBlocks(): BlockSpec[] {
  return [
    { key: 'visual', label: 'Visual', guidance: 'What is on screen.' },
    { key: 'hook', label: 'Hook', maxChars: 80, guidance: 'The first thing they read or hear.' },
    { key: 'message', label: 'Primary message', maxChars: 120, guidance: 'The one idea.' },
    { key: 'support', label: 'Supporting copy', maxChars: 200, guidance: 'Proof or mechanism.' },
    { key: 'cta', label: 'CTA', maxChars: 30, guidance: 'Verb-first.' },
  ]
}

function socialSection(assetType: AssetType, idea: SocialIdea, i: number): SectionSpec {
  const meta = { platform: idea.platform, source: idea.source, objective: idea.objective, theme: idea.theme, topic: idea.topic }
  if (assetType === 'carousel') {
    return {
      id: `c${i + 1}`,
      kind: idea.source,
      title: `Carousel · ${idea.topic}`,
      purpose: idea.why,
      meta,
      blocks: [1, 2, 3, 4, 5, 6].map((n) => ({ key: `slide_${n}`, label: `Slide ${n}`, maxChars: 140, guidance: n === 1 ? 'Hook slide.' : n === 6 ? 'CTA slide.' : 'One point per slide.' })).concat([{ key: 'caption', label: 'Caption', maxChars: 300, guidance: 'Context + CTA.' }]),
    }
  }
  if (assetType === 'thread') {
    return {
      id: `t${i + 1}`,
      kind: idea.source,
      title: `Thread · ${idea.topic}`,
      purpose: idea.why,
      meta,
      blocks: [1, 2, 3, 4, 5].map((n) => ({ key: `post_${n}`, label: `Post ${n}`, maxChars: 280, guidance: n === 1 ? 'Hook that promises the payoff.' : n === 5 ? 'Takeaway + CTA.' : 'One step of the story.' })),
    }
  }
  return {
    id: `p${i + 1}`,
    kind: idea.source,
    title: `${idea.platformLabel} · ${idea.sourceLabel}`,
    purpose: `${idea.objective}: ${idea.topic}`,
    meta,
    rationale: idea.why,
    blocks: [
      { key: 'hook', label: 'Hook', maxChars: 120, guidance: 'The line that earns the “see more”.' },
      { key: 'body', label: 'Body', maxChars: idea.platform === 'x' ? 280 : 1300, guidance: 'Specific, grounded, useful even without clicking.' },
      { key: 'cta', label: 'CTA', maxChars: 80, guidance: 'Soft for awareness, direct for conversion.' },
    ],
  }
}
