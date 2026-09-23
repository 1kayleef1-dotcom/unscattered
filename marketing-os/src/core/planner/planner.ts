/**
 * Campaign planner — "create everything I need".
 *
 * Takes a plain-language goal ("We're launching our new product next
 * month", "I want to sell this product to dentists"), classifies it,
 * investigates what the workspace actually knows about the audience
 * (customers, conversations, proof, objections, competitors), states the
 * gaps honestly, and produces a campaign plan: positioning, an offer
 * recommendation, a messaging model, and workstreams of assets in
 * dependency order. Consequential steps are marked for approval.
 */
import { bestQuote, indexSources, insightsFor } from '../language/customerLanguage.ts'
import type {
  AdAngle,
  AssetType,
  CampaignPlan,
  Channel,
  EvidenceRef,
  GoalKind,
  ID,
  LandingStrategy,
  PlannedAsset,
  Segment,
  SequenceKind,
  Workspace,
} from '../types.ts'
import { newId } from '../util/id.ts'
import { capitalize, clause, stem, words } from '../util/text.ts'
import { createMessagingModel } from '../messaging/messaging.ts'
import { log } from '../ops.ts'

export const GOAL_LABELS: Record<GoalKind, string> = {
  launch: 'Product launch',
  new_segment: 'New segment',
  conversion: 'Conversion',
  retention: 'Retention',
  reactivation: 'Reactivation',
  pipeline: 'Pipeline',
  awareness: 'Awareness',
}

export function classifyGoal(goal: string): { kind: GoalKind; audience?: string } {
  const g = goal.toLowerCase()
  const audience = g.match(/\b(?:sell(?:ing)?(?: \w+){0,3} to|target(?:ing)?|reach(?:ing)?|expand(?:ing)? into|for)\s+(?:the\s+)?([a-z][a-z -]{2,40}?)(?:\s+(?:market|segment|space|industry))?(?:[.,!?]|$| next| this| in )/)?.[1]?.trim()
  if (/\b(launch|launching|release|new product|go[- ]to[- ]market|gtm)\b/.test(g)) return { kind: 'launch', audience }
  if (audience && /\b(sell|target|reach|expand)\b/.test(g)) return { kind: 'new_segment', audience }
  if (/\b(churn|retain|retention|renewal|renew|onboard|adoption|activation)\b/.test(g)) return { kind: 'retention', audience }
  if (/\b(win back|win-back|reactivat|dormant|lapsed|churned)\b/.test(g)) return { kind: 'reactivation', audience }
  if (/\b(conversion|convert|landing page|sign-?ups? (dropped|fell)|cvr)\b/.test(g)) return { kind: 'conversion', audience }
  if (/\b(pipeline|leads|demos|meetings|sql|mql)\b/.test(g)) return { kind: 'pipeline', audience }
  return { kind: 'awareness', audience }
}

function matchSegment(ws: Workspace, text: string): Segment | undefined {
  const t = text.toLowerCase()
  return ws.brand.segments.find((s) => [s.name, ...s.keywords, ...s.industries].some((k) => k.length > 2 && t.includes(k.toLowerCase())))
}

/** Terms that identify an audience in free text: "dentists" → dentist, dental, dent… */
function audienceTerms(audience: string): string[] {
  const base = words(audience).filter((w) => w.length > 2)
  const stems = base.map(stem)
  // A short root catches related forms: dentist → "dent" matches dental, dentistry.
  const prefixes = stems.map((s) => (s.length >= 6 ? s.slice(0, 4) : s))
  return Array.from(new Set([...base, ...stems, ...prefixes]))
}

function textMatches(text: string, terms: string[]): boolean {
  const ws = words(text)
  return ws.some((w) => terms.some((t) => w.startsWith(t)))
}

interface PlanRecipe {
  name: string
  purpose: string
  assets: { type: AssetType; channel: Channel; purpose: string; strategy?: LandingStrategy; sequenceKind?: SequenceKind; angles?: AdAngle[]; consequential: boolean; after?: number }[]
}

function recipes(kind: GoalKind, topObjectionIsEconomic: boolean): PlanRecipe[] {
  const lp = (strategy: LandingStrategy | undefined, purpose: string) => ({ type: 'landing_page' as const, channel: 'web' as const, purpose, strategy, consequential: true })
  switch (kind) {
    case 'launch':
      return [
        { name: 'Landing page & lead capture', purpose: 'A home for launch traffic that captures intent before launch day.', assets: [lp(undefined, 'Launch page with lead capture')] },
        { name: 'Email', purpose: 'Build anticipation, then convert in the launch window.', assets: [{ type: 'email_sequence', channel: 'email', purpose: 'Launch sequence', sequenceKind: 'launch', consequential: true, after: 0 }, { type: 'email_sequence', channel: 'email', purpose: 'Lead nurture for sign-ups who don’t buy at launch', sequenceKind: 'lead_nurture', consequential: true, after: 0 }] },
        { name: 'Paid & retargeting', purpose: 'Reach the segment, then bring back visitors who didn’t convert.', assets: [{ type: 'ad_set', channel: 'linkedin', purpose: 'Launch ad angles', consequential: true, after: 0 }, { type: 'ad_set', channel: 'meta', purpose: 'Meta ad angles', consequential: true, after: 0 }, { type: 'creative_concept', channel: 'meta', purpose: 'Retargeting creative', angles: ['objection', 'proof'], consequential: true, after: 0 }] },
        { name: 'Social & video', purpose: 'Earn attention and trust before and after launch day.', assets: [{ type: 'social_post', channel: 'linkedin', purpose: 'Launch-week LinkedIn posts', consequential: false }, { type: 'thread', channel: 'x', purpose: 'Launch thread', consequential: false }, { type: 'video_script', channel: 'tiktok', purpose: 'Short-form launch video', consequential: false }] },
        { name: 'Sales enablement & follow-up', purpose: 'Sales tells the same story; demo attendees get a structured follow-up.', assets: [{ type: 'sales_enablement', channel: 'sales', purpose: 'Launch talk track and objection handling', consequential: false }, { type: 'email_sequence', channel: 'email', purpose: 'Demo follow-up', sequenceKind: 'demo_followup', consequential: true }] },
      ]
    case 'new_segment':
      return [
        { name: 'Landing page', purpose: 'A page that speaks to this segment in its own words.', assets: [lp('problem_led', 'Segment-specific landing page')] },
        { name: 'Ads & retargeting', purpose: 'Test which angle this new segment responds to.', assets: [{ type: 'ad_set', channel: 'meta', purpose: 'Ad angles for the segment', consequential: true, after: 0 }, { type: 'ad_set', channel: 'linkedin', purpose: 'LinkedIn ad angles', consequential: true, after: 0 }, { type: 'creative_concept', channel: 'meta', purpose: 'Retargeting creative', angles: ['objection', 'proof'], consequential: true, after: 0 }] },
        { name: 'Email nurture', purpose: 'Move captured leads to a conversation.', assets: [{ type: 'email_sequence', channel: 'email', purpose: 'Segment nurture sequence', sequenceKind: topObjectionIsEconomic ? 'lead_magnet_followup' : 'lead_nurture', consequential: true, after: 0 }] },
        { name: 'Social', purpose: 'Show up where this segment already talks.', assets: [{ type: 'social_post', channel: 'linkedin', purpose: 'Segment-specific posts', consequential: false }] },
        { name: 'Sales enablement', purpose: 'Give sales the segment’s language and proof.', assets: [{ type: 'sales_enablement', channel: 'sales', purpose: 'Segment talk track', consequential: false }] },
      ]
    case 'conversion':
      return [
        { name: 'Page challenger', purpose: 'A new page version to test against the current one.', assets: [lp(topObjectionIsEconomic ? 'proof_led' : undefined, 'Challenger page')] },
        { name: 'Ads & retargeting', purpose: 'Answer the main objection before the click.', assets: [{ type: 'ad_set', channel: 'linkedin', purpose: 'Objection-led ads', angles: ['objection', 'proof'], consequential: true }, { type: 'creative_concept', channel: 'meta', purpose: 'Retargeting creative', angles: ['objection'], consequential: true }] },
        { name: 'Follow-up', purpose: 'Recover visitors who showed intent.', assets: [{ type: 'email_sequence', channel: 'email', purpose: 'Demo follow-up', sequenceKind: 'demo_followup', consequential: true }] },
      ]
    case 'retention':
      return [
        { name: 'Onboarding & activation', purpose: 'Reach first value fast and make it a habit.', assets: [{ type: 'email_sequence', channel: 'email', purpose: 'Onboarding', sequenceKind: 'onboarding', consequential: true }, { type: 'email_sequence', channel: 'email', purpose: 'Activation', sequenceKind: 'activation', consequential: true }] },
        { name: 'Renewal & rescue', purpose: 'Make value explicit before renewal; catch at-risk accounts early.', assets: [{ type: 'email_sequence', channel: 'email', purpose: 'Renewal', sequenceKind: 'renewal', consequential: true }, { type: 'email_sequence', channel: 'email', purpose: 'Churn prevention', sequenceKind: 'churn_prevention', consequential: true }] },
        { name: 'Expansion', purpose: 'Grow accounts that are hitting their limits.', assets: [{ type: 'email_sequence', channel: 'email', purpose: 'Upsell', sequenceKind: 'upsell', consequential: true }] },
      ]
    case 'reactivation':
      return [
        { name: 'Recovery emails', purpose: 'Bring back churned customers and dormant leads.', assets: [{ type: 'email_sequence', channel: 'email', purpose: 'Win-back', sequenceKind: 'win_back', consequential: true }, { type: 'email_sequence', channel: 'email', purpose: 'Dormant lead reactivation', sequenceKind: 'reactivation', consequential: true }] },
        { name: 'Retargeting', purpose: 'Stay visible to past visitors.', assets: [{ type: 'creative_concept', channel: 'meta', purpose: 'Win-back creative', angles: ['proof', 'outcome'], consequential: true }] },
      ]
    case 'pipeline':
      return [
        { name: 'Demand capture', purpose: 'Turn existing intent into meetings.', assets: [lp('demo_led', 'Demo page'), { type: 'ad_set', channel: 'google', purpose: 'Search ads', consequential: true, after: 0 }, { type: 'ad_set', channel: 'linkedin', purpose: 'LinkedIn ads', consequential: true, after: 0 }] },
        { name: 'Nurture & follow-up', purpose: 'Convert leads and demo attendees.', assets: [{ type: 'email_sequence', channel: 'email', purpose: 'Lead magnet follow-up', sequenceKind: 'lead_magnet_followup', consequential: true }, { type: 'email_sequence', channel: 'email', purpose: 'Demo follow-up', sequenceKind: 'demo_followup', consequential: true }] },
        { name: 'Sales enablement', purpose: 'Arm reps with the same message.', assets: [{ type: 'sales_enablement', channel: 'sales', purpose: 'Talk track', consequential: false }] },
      ]
    default:
      return [
        { name: 'Social', purpose: 'Build attention with content grounded in real customer material.', assets: [{ type: 'social_post', channel: 'linkedin', purpose: 'LinkedIn posts', consequential: false }, { type: 'thread', channel: 'x', purpose: 'X thread', consequential: false }, { type: 'carousel', channel: 'instagram', purpose: 'Instagram carousel', consequential: false }] },
        { name: 'Video', purpose: 'Short-form reach.', assets: [{ type: 'video_script', channel: 'tiktok', purpose: 'Short video scripts', consequential: false }] },
      ]
  }
}

export interface PlanResult {
  ws: Workspace
  plan: CampaignPlan
}

export function createCampaignPlan(wsIn: Workspace, goal: string, opts: { segmentId?: ID; offerId?: ID } = {}): PlanResult {
  let ws = wsIn
  const { kind, audience } = classifyGoal(goal)
  const investigation: CampaignPlan['investigation'] = []
  const gaps: string[] = []
  let proposedSegment: Segment | undefined

  // --- Who is this for? -----------------------------------------------------
  let segment = (opts.segmentId && ws.brand.segments.find((s) => s.id === opts.segmentId)) || (audience ? matchSegment(ws, audience) : undefined) || matchSegment(ws, goal)
  if (!segment && audience && kind === 'new_segment') {
    const terms = audienceTerms(audience)
    const matchedSources = ws.sources.filter((s) => textMatches(`${s.title} ${s.text} ${s.customer ?? ''}`, terms))
    const matchedProof = ws.brand.proof.filter((p) => textMatches(`${p.title} ${p.detail} ${p.customer ?? ''}`, terms))
    const name = capitalize(audience)
    proposedSegment = {
      id: `seg_${terms[1] ?? terms[0]}`.replace(/[^a-z0-9_]/g, '_'),
      name,
      description: `${name} — proposed from the goal “${goal}”. ${matchedSources.length ? `Grounded in ${matchedSources.length} existing conversation(s).` : 'No existing customer data yet.'}`,
      awareness: matchedSources.length ? 'problem_aware' : 'unaware',
      sophistication: 2,
      industries: [audience],
      jobTitles: [],
      priority: 'exploratory',
      keywords: terms,
    }
    segment = proposedSegment
    investigation.push({
      question: `What do we already know about ${audience}?`,
      finding: matchedSources.length
        ? `${matchedSources.length} existing conversation(s) involve ${audience}: ${matchedSources.map((s) => s.customer ?? s.title).join(', ')}. Outcomes: ${matchedSources.map((s) => s.outcome ?? 'unknown').join(', ')}.`
        : `No customers or conversations mention ${audience}.`,
      evidence: matchedSources.map((s) => ({ kind: 'source' as const, id: s.id, note: s.title })),
    })
    investigation.push({
      question: 'Do we have proof that works for them?',
      finding: matchedProof.length ? `Yes: ${matchedProof.map((p) => p.title).join('; ')}.` : 'No proof specific to this audience.',
      evidence: matchedProof.map((p) => ({ kind: 'proof' as const, id: p.id, note: p.title })),
    })
    if (!matchedProof.length) gaps.push(`No ${audience} case study or testimonial. Recommend collecting one before scaling spend.`)
    if (matchedSources.length < 5) gaps.push(`Only ${matchedSources.length} conversation(s) with ${audience}. Awareness and objections are provisional — schedule 5 customer interviews.`)
    gaps.push('Segment size and channel reach are not in the workspace; validate before committing budget.')

    // Register the segment and attribute the matching evidence to it.
    const brand = {
      ...ws.brand,
      segments: [...ws.brand.segments, proposedSegment],
      proof: ws.brand.proof.map((p) => (matchedProof.includes(p) ? { ...p, segmentIds: Array.from(new Set([...p.segmentIds, proposedSegment!.id])) } : p)),
    }
    const sources = ws.sources.map((s) => (matchedSources.includes(s) ? { ...s, segmentId: proposedSegment!.id } : s))
    ws = { ...ws, brand, sources, language: indexSources(sources, brand.competitors, ws.now) }
    ws = log(ws, 'segment', `Proposed segment “${name}” created; ${matchedSources.length} source(s) and ${matchedProof.length} proof item(s) attributed to it.`)
  }
  if (!segment) {
    segment = ws.brand.segments.find((s) => s.priority === 'primary') ?? ws.brand.segments[0]
    if (audience) gaps.push(`Could not match “${audience}” to a segment; planned for ${segment.name}.`)
  }

  const offer = ws.brand.offers.find((o) => o.id === opts.offerId) ?? ws.brand.offers.find((o) => o.kind === 'product') ?? ws.brand.offers[0]

  // --- What do they say? ------------------------------------------------------
  const pains = insightsFor(ws.language, { kinds: ['pain'], segmentId: segment.id }).slice(0, 2)
  const objections = insightsFor(ws.language, { kinds: ['objection', 'reason_rejected'], segmentId: segment.id }).slice(0, 3)
  investigation.push({
    question: 'What problem are they experiencing?',
    finding: pains.length ? pains.map((p) => `${p.theme}: “${clause(bestQuote(p)?.text ?? '')}”`).join(' · ') : `No pain points captured for ${segment.name}; using positioning: ${ws.brand.positioning.problem}.`,
    evidence: pains.map((p) => ({ kind: 'insight' as const, id: p.id, note: p.summary })),
  })
  investigation.push({
    question: 'Why haven’t they bought?',
    finding: objections.length ? objections.map((o) => `${o.theme} (${o.frequency})`).join(', ') : 'No objections captured yet.',
    evidence: objections.map((o) => ({ kind: 'insight' as const, id: o.id, note: o.summary })),
  })
  const comps = Object.entries(ws.language.competitorMentions).sort((a, b) => b[1] - a[1])
  investigation.push({ question: 'What else could they choose?', finding: comps.length ? comps.map(([n, c]) => `${n} (${c})`).join(', ') : 'No competitors mentioned.', evidence: [] })
  const learned = ws.learnings.filter((l) => l.segmentId === segment!.id && l.direction !== 'neutral' && l.confidence !== 'low').slice(0, 3)
  if (learned.length) investigation.push({ question: 'What has worked before?', finding: learned.map((l) => l.statement).join(' '), evidence: learned.map((l) => ({ kind: 'learning' as const, id: l.id, note: l.statement })) })

  const economic = objections.some((o) => /roi|price/i.test(o.theme))
  const segProof = ws.brand.proof.filter((p) => p.segmentIds.includes(segment!.id))
  const leadProof = segProof.find((p) => p.kind === 'case_study') ?? segProof[0]

  // --- Positioning, offer, messaging -----------------------------------------
  const positioning = `For ${segment.name.toLowerCase()} who ${pains[0] ? `struggle with ${pains[0].theme.toLowerCase()}` : ws.brand.positioning.problem.toLowerCase()}, ${ws.brand.company} is the ${ws.brand.positioning.category} that ${ws.brand.positioning.differentiator.charAt(0).toLowerCase()}${ws.brand.positioning.differentiator.slice(1)}${leadProof ? ` — as ${leadProof.customer ?? 'customers'} found: ${leadProof.metric ? `${leadProof.metric.label} ${leadProof.metric.value}` : leadProof.title}` : ''}.`
  const calc = ws.brand.offers.find((o) => o.kind === 'lead_magnet')
  const offerRecommendation = economic && calc
    ? `Lead with ${calc.name} as the entry offer (price/ROI is the leading objection), then ${offer.cta.toLowerCase()}. Keep ${offer.guarantee ? `the guarantee (“${offer.guarantee}”)` : 'risk reversal'} visible.`
    : `${offer.name} with “${offer.cta}” as the primary CTA${offer.guarantee ? `, backed by “${offer.guarantee}”` : ''}.`

  const created = createMessagingModel(ws, {
    name: `${segment.name} · ${GOAL_LABELS[kind]}`,
    segmentId: segment.id,
    offerId: offer.id,
    coreMessage: `${ws.brand.pillars[0]?.name ?? ws.brand.company}. ${leadProof ? `${leadProof.customer ?? 'Customers'}: ${leadProof.metric ? `${leadProof.metric.label.toLowerCase()} ${leadProof.metric.value}` : leadProof.title}.` : ws.brand.positioning.differentiator}`,
    supportingPoints: ws.brand.pillars.slice(0, 3).map((p) => `${p.name} — ${p.statement}`),
    proofIds: segProof.slice(0, 3).map((p) => p.id),
    cta: economic && calc ? calc.cta : offer.cta,
  })
  ws = created.ws

  // --- Workstreams ---------------------------------------------------------------
  const workstreams = recipes(kind, economic).map((r) => {
    const assets: PlannedAsset[] = r.assets.map((a) => ({ id: newId('pa'), type: a.type, channel: a.channel, purpose: a.purpose, strategy: a.strategy, sequenceKind: a.sequenceKind, angles: a.angles, dependsOn: [], consequential: a.consequential, status: 'planned' }))
    return { name: r.name, purpose: r.purpose, assets }
  })
  const lpId = workstreams.flatMap((w) => w.assets).find((a) => a.type === 'landing_page')?.id
  if (lpId) for (const a of workstreams.flatMap((w) => w.assets)) if (a.id !== lpId && ['ad_set', 'creative_concept'].includes(a.type)) a.dependsOn = [lpId]

  const plan: CampaignPlan = {
    id: newId('pln'),
    goal,
    kind,
    segmentId: segment.id,
    offerId: offer.id,
    createdAt: ws.now,
    status: 'draft',
    investigation,
    gaps,
    positioning,
    offerRecommendation,
    messagingModelId: created.model.id,
    workstreams: [{ name: 'Positioning & messaging', purpose: 'The central message every asset derives from.', assets: [] }, ...workstreams],
    measurement: {
      primary: kind === 'retention' || kind === 'reactivation' ? 'click_rate' : 'qualified_cvr',
      secondary: kind === 'awareness' ? ['engagement_rate', 'ctr'] : ['ctr', 'cac', 'pipeline'],
      targets: kind === 'new_segment' ? ['Find the winning ad angle within 3 weeks', 'Landing page qualified conversion within 20% of the primary segment', 'First 3 qualified meetings from the segment'] : ['Beat the current baseline on the primary metric', 'Every asset linked to the messaging model'],
      reviewCadence: 'Daily agent check; weekly review of experiments and learnings',
    },
    proposedSegment,
  }
  ws = log({ ...ws, plans: [plan, ...ws.plans] }, 'plan', `Campaign plan created: “${goal}” (${GOAL_LABELS[kind]}, ${workstreams.flatMap((w) => w.assets).length} assets).`, { type: 'plan', id: plan.id })
  return { ws, plan }
}

export function evidenceNotes(e: EvidenceRef[]): string {
  return e.map((x) => x.note).join('; ')
}
