/**
 * Ad angle engine.
 *
 * Variations differ by *strategic angle*, not adjectives. Each angle has
 * evidence requirements; an angle without supporting evidence is rejected
 * with a reason rather than written anyway. Every selected angle carries a
 * testable hypothesis, a creative direction and the metric that will judge it.
 */
import type { AdAngle, Channel, Learning, MarketingBrief, MetricKey } from '../types.ts'

export const AD_ANGLE_LABELS: Record<AdAngle, string> = {
  problem: 'Problem',
  outcome: 'Outcome',
  proof: 'Proof',
  contrarian: 'Contrarian',
  curiosity: 'Curiosity',
  objection: 'Objection',
  comparison: 'Comparison',
  specificity: 'Specificity',
  urgency: 'Urgency',
  social_proof: 'Social proof',
}

export interface PlatformSpec {
  channel: Channel
  label: string
  fields: { key: string; label: string; max: number; count?: number }[]
  notes: string
}

export const PLATFORM_SPECS: Partial<Record<Channel, PlatformSpec>> = {
  meta: {
    channel: 'meta',
    label: 'Meta (Facebook/Instagram)',
    fields: [
      { key: 'primary', label: 'Primary text', max: 125 },
      { key: 'headline', label: 'Headline', max: 40 },
      { key: 'description', label: 'Description', max: 30 },
      { key: 'cta_button', label: 'CTA button', max: 20 },
    ],
    notes: 'Primary text truncates at ~125 characters; the first line must carry the hook.',
  },
  google: {
    channel: 'google',
    label: 'Google Responsive Search',
    fields: [
      { key: 'headline', label: 'Headline', max: 30, count: 3 },
      { key: 'description', label: 'Description', max: 90, count: 2 },
    ],
    notes: 'Headlines are mixed and matched; each must stand alone.',
  },
  linkedin: {
    channel: 'linkedin',
    label: 'LinkedIn Sponsored Content',
    fields: [
      { key: 'intro', label: 'Intro text', max: 150 },
      { key: 'headline', label: 'Headline', max: 70 },
      { key: 'cta_button', label: 'CTA button', max: 20 },
    ],
    notes: 'Professional feed: specificity and peer proof outperform hype.',
  },
  tiktok: {
    channel: 'tiktok',
    label: 'TikTok',
    fields: [
      { key: 'hook', label: 'On-screen hook (0–2s)', max: 60 },
      { key: 'caption', label: 'Caption', max: 100 },
    ],
    notes: 'Native, lo-fi, person-to-camera; the hook is visual and verbal.',
  },
  youtube: {
    channel: 'youtube',
    label: 'YouTube in-stream',
    fields: [
      { key: 'hook', label: 'First 5 seconds (before skip)', max: 90 },
      { key: 'headline', label: 'Headline', max: 15 },
      { key: 'cta_button', label: 'CTA', max: 10 },
    ],
    notes: 'Assume they skip at 5s: the hook must deliver the whole idea.',
  },
}

export interface AngleCandidate {
  angle: AdAngle
  selected: boolean
  score: number
  reason: string
  hypothesis: string
  creative: string
  metric: MetricKey
  evidenceNote: string
  objectionTheme?: string
  proofId?: string
}

export function evaluateAngles(
  brief: MarketingBrief,
  learnings: Learning[],
  opts: { count?: number; require?: AdAngle[]; exclude?: AdAngle[] } = {},
): AngleCandidate[] {
  const seg = brief.audience.name
  const topObjection = brief.objections[0]
  const metricProof = brief.proof.find((p) => p.kind === 'metric' || p.kind === 'case_study')
  const socialProof = brief.proof.find((p) => p.kind === 'review_rating' || p.kind === 'testimonial' || p.kind === 'logo')
  const statusQuo = brief.alternatives[0]?.split(' — ')[0]
  const competitor = brief.competitors[0]
  const pain = brief.problem
  const learned = (a: AdAngle) => learnings.find((l) => l.dimension === 'angle' && l.value === a)

  const c = (angle: AdAngle, available: boolean, base: number, fields: Omit<AngleCandidate, 'angle' | 'selected' | 'score'>): AngleCandidate => {
    const l = learned(angle)
    const score = available ? base + (l ? l.effect * 10 : 0) : -100
    return {
      angle,
      selected: false,
      score,
      ...fields,
      reason: available ? `${fields.reason}${l ? ` Learned: ${l.statement}` : ''}` : fields.reason,
    }
  }

  const candidates: AngleCandidate[] = [
    c('problem', Boolean(pain), 6, {
      reason: 'A customer-sourced pain point exists.',
      hypothesis: `${seg} will stop scrolling for their own words: ${pain}.`,
      creative: 'Their quote as on-screen text over the moment of pain (inbox full of approval requests at month-end).',
      metric: 'ctr',
      evidenceNote: pain,
    }),
    c('outcome', Boolean(brief.desiredOutcome), 5, {
      reason: 'A clear desired outcome exists.',
      hypothesis: `Showing the after-state (“${brief.desiredOutcome}”) outperforms describing the product for ${seg}.`,
      creative: 'Before/after split: the last week of the month, then and now.',
      metric: 'ctr',
      evidenceNote: brief.desiredOutcome,
    }),
    c('proof', Boolean(metricProof), brief.sophistication >= 4 ? 8 : 5, {
      reason: metricProof ? `Quantified proof available (${metricProof.text}); sophistication ${brief.sophistication} rewards proof.` : 'No quantified proof for this segment.',
      hypothesis: `At sophistication ${brief.sophistication}, ${seg} discount claims; a named result will lift qualified conversion.`,
      creative: metricProof ? `Customer result as the visual: ${metricProof.text}.` : '',
      metric: 'qualified_cvr',
      evidenceNote: metricProof?.text ?? '',
      proofId: metricProof?.proofId,
    }),
    c('objection', Boolean(topObjection), topObjection ? 6 + Math.min(3, topObjection.evidence.length) : 0, {
      reason: topObjection ? `“${topObjection.theme}” is the leading objection.` : 'No objections captured.',
      hypothesis: topObjection
        ? `${seg} hesitate because of “${topObjection.theme}” (customers say: “${topObjection.customerWords}”). Answering it before the click lifts qualified conversion.`
        : '',
      creative: topObjection ? `Name the objection in the hook, then show the answer: ${topObjection.response}` : '',
      metric: 'qualified_cvr',
      evidenceNote: topObjection?.customerWords ?? '',
      objectionTheme: topObjection?.theme,
    }),
    c('contrarian', Boolean(statusQuo), 4, {
      reason: statusQuo ? `A status-quo alternative (${statusQuo}) to challenge.` : 'No status-quo alternative documented.',
      hypothesis: `${seg} believe ${statusQuo ?? 'the status quo'} is free; reframing its hidden cost creates urgency without discounting.`,
      creative: `“${statusQuo ?? 'Your current process'} isn’t free.” Tally the hours on screen.`,
      metric: 'ctr',
      evidenceNote: brief.alternatives[0] ?? '',
    }),
    c('specificity', Boolean(metricProof), 5, {
      reason: metricProof ? 'A specific number is available.' : 'No approved numbers.',
      hypothesis: `A precise number (“${metricProof?.text ?? ''}”) reads as more credible than a rounded promise for ${seg}.`,
      creative: 'One big number, nothing else on the frame.',
      metric: 'ctr',
      evidenceNote: metricProof?.text ?? '',
      proofId: metricProof?.proofId,
    }),
    c('social_proof', Boolean(socialProof), 4, {
      reason: socialProof ? `Social proof available (${socialProof.text}).` : 'No reviews, logos or testimonials tagged.',
      hypothesis: `Peer validation reduces perceived risk for ${seg} early in the journey.`,
      creative: socialProof ? `Rating/testimonial card: ${socialProof.text}.` : '',
      metric: 'ctr',
      evidenceNote: socialProof?.text ?? '',
      proofId: socialProof?.proofId,
    }),
    c('comparison', Boolean(competitor), 3, {
      reason: competitor ? `Direct competitor ${competitor.name} appears in customer conversations.` : 'No direct competitor documented.',
      hypothesis: `Prospects comparing ${competitor?.name ?? 'alternatives'} respond to a clear contrast on ${competitor?.angle.split(';')[0] ?? 'fit'}.`,
      creative: 'Side-by-side: named alternative category vs. us, on the two criteria buyers cite.',
      metric: 'qualified_cvr',
      evidenceNote: competitor?.angle ?? '',
    }),
    c('curiosity', Boolean(metricProof), 3, {
      reason: 'A surprising, true fact can open a loop.',
      hypothesis: `An open loop anchored in a true result earns clicks from ${seg} without overclaiming.`,
      creative: 'Question hook with the answer on the landing page.',
      metric: 'ctr',
      evidenceNote: metricProof?.text ?? '',
    }),
    c('urgency', false, 0, {
      reason: 'No genuine deadline or time-bound offer recorded — refusing to invent scarcity.',
      hypothesis: '',
      creative: '',
      metric: 'cvr',
      evidenceNote: '',
    }),
  ]

  const exclude = new Set(opts.exclude ?? [])
  const require = new Set(opts.require ?? [])
  const ranked = candidates.filter((x) => !exclude.has(x.angle)).sort((a, b) => b.score - a.score)
  const count = opts.count ?? 3
  let picked = 0
  for (const cand of ranked) {
    if ((require.has(cand.angle) && cand.score > -100) || (picked < count && cand.score > 0)) {
      cand.selected = true
      picked += 1
    }
  }
  return ranked
}
