/**
 * Builds the demo workspace by running the real engines over 60 days of
 * simulated history — nothing here is hand-typed output except the one
 * deliberately weak "legacy" page and ad set a human wrote before the
 * system existed (so the critic and learning model have something to judge).
 */
import { runAgent } from '../agent/agent.ts'
import { buildBrief } from '../brief/brief.ts'
import { assetFromGeneration, generate, type GenerateInput } from '../copy/pipeline.ts'
import { rulesCritic, scoreCritique } from '../critic/critic.ts'
import { evaluateExperiment } from '../experiments/experiments.ts'
import { indexSources } from '../language/customerLanguage.ts'
import { computeLearnings } from '../learning/learning.ts'
import { demoWorld, simulateRange } from '../performance/simulate.ts'
import type { Asset, AssetContent, AssetVersion, Experiment, MessagingModel, Workspace } from '../types.ts'
import { addDays } from '../util/dates.ts'
import { withDeterministicIds } from '../util/id.ts'
import { seedBrand } from './brand.ts'
import { seedSources } from './sources.ts'

export function defaultNow(): string {
  const d = new Date()
  d.setUTCHours(8, 0, 0, 0)
  return d.toISOString()
}

function emptyWorkspace(now: string): Workspace {
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

function messaging(now: string): MessagingModel[] {
  return [
    {
      id: 'msg_midmarket',
      name: 'Mid-market controllers · Core',
      segmentId: 'seg_midmarket',
      offerId: 'off_platform',
      version: 2,
      coreMessage: 'Every invoice has an owner and a deadline. Month-end closes on time, without the chase.',
      supportingPoints: ['Live in 14 days — no ERP changes', 'Harbor Freightways: close in 4 days instead of 9', '78% fewer late payments'],
      proofIds: ['prf_harbor', 'prf_impl', 'prf_late'],
      cta: 'Book a strategy call',
      updatedAt: addDays(now, -36),
      history: [{ version: 1, coreMessage: 'The AP automation platform for growing finance teams.', supportingPoints: ['Invoice capture', 'Approval workflows', 'ERP sync'], cta: 'Learn more', changedAt: addDays(now, -70), reason: 'V1 feature-led messaging underperformed outcome-led in the page test.' }],
    },
    {
      id: 'msg_enterprise',
      name: 'Enterprise finance ops · Core',
      segmentId: 'seg_enterprise',
      offerId: 'off_platform',
      version: 1,
      coreMessage: 'Consistent approvals across every entity — live in 14 days without touching your ERP.',
      supportingPoints: ['Northwind: live across three entities in under three weeks', 'IT sign-off in one meeting', 'Payback in under 5 months'],
      proofIds: ['prf_northwind', 'prf_impl', 'prf_payback'],
      cta: 'Book a strategy call',
      updatedAt: addDays(now, -55),
      history: [],
    },
  ]
}

async function gen(ws: Workspace, input: GenerateInput, publishedDaysAgo: number, extra: Partial<Asset> = {}): Promise<Asset> {
  const res = await generate(ws, input)
  const publishedAt = addDays(ws.now, -publishedDaysAgo)
  const version: AssetVersion = { ...res.version, createdAt: addDays(publishedAt, -2), status: 'published', publishedAt, approvedBy: 'Dana (Head of Marketing)', approvedAt: addDays(publishedAt, -1), externalRef: { connector: 'demo', externalId: `${input.channel}-${res.version.id}` } }
  const asset = assetFromGeneration({ ...res, version }, input, extra)
  return { ...asset, createdAt: version.createdAt, publishedVersionId: version.id }
}

function legacyVersion(ws: Workspace, content: AssetContent, input: GenerateInput, publishedAt: string, tags: Asset['tags']): AssetVersion {
  const brief = buildBrief(ws, { segmentId: input.segmentId, channel: input.channel, goal: input.goal })
  const critique = scoreCritique(rulesCritic({ content, brief, brand: ws.brand, assetType: input.assetType }), ['rules'], publishedAt)
  return {
    id: `ver_legacy_${input.assetType}_${input.segmentId}`,
    number: 1,
    label: 'V1',
    content,
    brief,
    chain: {
      businessGoal: input.goal,
      objective: 'Legacy copy written before the system existed',
      segmentId: input.segmentId,
      problem: 'Not documented',
      insight: 'Not documented',
      positioning: 'Feature-led',
      message: 'The AP automation platform for growing finance teams.',
      creativeConcept: 'Feature tour',
      cta: 'Learn more',
      measurement: { primaryMetric: input.channel === 'web' ? 'qualified_cvr' : 'ctr', secondary: [] },
      messagingModelId: input.segmentId === 'seg_midmarket' ? 'msg_midmarket' : 'msg_enterprise',
    },
    rationale: { summary: 'Imported legacy copy. No brief or evidence was recorded when it was written.', decisions: [] },
    critique,
    status: 'published',
    createdAt: addDays(publishedAt, -3),
    createdBy: 'user',
    generator: 'Imported (human-written)',
    changeSummary: 'Imported',
    changeReason: 'Existing live copy imported on setup',
    publishedAt,
    messagingVersion: 1,
    tags,
    params: input,
  }
}

const LEGACY_PAGE: AssetContent = {
  sections: [
    { id: 's1_hero', kind: 'hero', title: 'Hero', blocks: [
      { key: 'headline', label: 'Headline', text: 'The AI-powered AP platform that will revolutionize your finance team!' },
      { key: 'subheadline', label: 'Subheadline', text: 'Tallyforge is a best-in-class, end-to-end solution that seamlessly streamlines your invoice workflows and unlocks actionable insights.' },
      { key: 'cta', label: 'Primary CTA', text: 'Learn more' },
      { key: 'support', label: 'Support line', text: 'Trusted by 500+ companies worldwide.' },
    ] },
    { id: 's2_features', kind: 'features', title: 'Features', blocks: [
      { key: 'headline', label: 'Section headline', text: 'A robust feature set for modern finance' },
      { key: 'body', label: 'Body', text: 'Invoice capture. Approval workflows. ERP sync. Vendor portal. Duplicate detection. Audit trail. Reporting dashboards.' },
    ] },
    { id: 's3_social_proof', kind: 'social_proof', title: 'Social proof', blocks: [
      { key: 'headline', label: 'Section headline', text: 'Loved by finance teams' },
      { key: 'body', label: 'Body', text: 'Customers save 10x more time with Tallyforge. It is truly a game-changer.' },
    ] },
    { id: 's4_final_cta', kind: 'final_cta', title: 'Final CTA', blocks: [
      { key: 'headline', label: 'Headline', text: 'Ready to transform your AP?' },
      { key: 'body', label: 'Body', text: 'Join the AP revolution today!' },
      { key: 'cta', label: 'CTA', text: 'Get started today!' },
    ] },
  ],
}

const LEGACY_ENTERPRISE_ADS: AssetContent = {
  sections: [
    { id: 'vA', kind: 'proof', title: 'Variation A · Proof angle', meta: { angle: 'proof', hypothesis: 'Named results reduce perceived risk for enterprise buyers.', metric: 'qualified_cvr' }, blocks: [
      { key: 'intro', label: 'Intro text', text: 'Northwind Components went live across three entities in under three weeks. IT signed off in one meeting.' },
      { key: 'headline', label: 'Headline', text: 'Live in 14 days. No ERP changes.' },
      { key: 'cta_button', label: 'CTA button', text: 'Book a call' },
    ] },
    { id: 'vB', kind: 'offer', title: 'Variation B · Discount', meta: { angle: 'urgency', offerType: 'discount', hypothesis: 'A first-year discount accelerates enterprise decisions.', metric: 'qualified_cvr' }, blocks: [
      { key: 'intro', label: 'Intro text', text: 'Save 20% on your first year of Tallyforge. Offer ends this quarter!' },
      { key: 'headline', label: 'Headline', text: '20% off AP automation' },
      { key: 'cta_button', label: 'CTA button', text: 'Claim offer' },
    ] },
    { id: 'vC', kind: 'outcome', title: 'Variation C · Outcome angle', meta: { angle: 'outcome', hypothesis: 'A faster close is the outcome VPs care about.', metric: 'ctr' }, blocks: [
      { key: 'intro', label: 'Intro text', text: 'Close the books in days, not weeks — across every entity.' },
      { key: 'headline', label: 'Headline', text: 'Close the books in days' },
      { key: 'cta_button', label: 'CTA button', text: 'Learn more' },
    ] },
  ],
}

export async function createSeedWorkspace(now = defaultNow(), opts: { runAgent?: boolean } = {}): Promise<Workspace> {
  return withDeterministicIds(20260923, () => buildSeed(now, opts))
}

async function buildSeed(now: string, opts: { runAgent?: boolean }): Promise<Workspace> {
  let ws: Workspace = { ...emptyWorkspace(now), messaging: messaging(now) }
  const assets: Asset[] = []

  // Mid-market landing page: legacy V1 (feature-led), then generated V2 (outcome-led) won a test.
  const lpInput: GenerateInput = { assetType: 'landing_page', channel: 'web', segmentId: 'seg_midmarket', offerId: 'off_platform', goal: 'Grow qualified demo requests from mid-market controllers', messagingModelId: 'msg_midmarket', trafficSource: 'paid_social' }
  const v1 = legacyVersion(ws, LEGACY_PAGE, { ...lpInput, strategy: 'product_led' }, addDays(now, -60), { strategy: 'product_led', ctaStyle: 'learn', proofType: 'none', theme: 'Features' })
  const v2res = await generate({ ...ws, messaging: ws.messaging.map((m) => (m.id === 'msg_midmarket' ? { ...m, version: 2 } : m)) }, { ...lpInput, strategy: 'outcome_led' })
  const v2: AssetVersion = { ...v2res.version, number: 2, label: 'V2', parentVersionId: v1.id, createdAt: addDays(now, -54), status: 'published', publishedAt: addDays(now, -52), approvedBy: 'Dana (Head of Marketing)', approvedAt: addDays(now, -53), changeSummary: 'Outcome-led rewrite', changeReason: 'V1 scored 38 in critique and lacked proof; rewritten outcome-led from the brief and tested against V1.', externalRef: { connector: 'demo', externalId: 'web-lp-v2' } }
  const lp: Asset = { id: 'ast_lp_midmarket', name: 'Mid-market demo page', type: 'landing_page', channel: 'web', segmentId: 'seg_midmarket', tags: { strategy: 'outcome_led' }, versions: [v1, v2], currentVersionId: v2.id, publishedVersionId: v2.id, createdAt: v1.createdAt }
  assets.push(lp)

  const lpTest: Experiment = {
    id: 'exp_lp_v1_v2',
    name: 'V1 feature-led vs V2 outcome-led',
    hypothesis: 'Mid-market controllers respond to the outcome (a faster, calmer close) more than to a feature list.',
    primaryMetric: 'qualified_cvr',
    segmentId: 'seg_midmarket',
    channel: 'web',
    variants: [
      { key: 'A', label: 'V1 (feature-led)', assetId: lp.id, versionId: v1.id, split: 0.5 },
      { key: 'B', label: 'V2 (outcome-led)', assetId: lp.id, versionId: v2.id, split: 0.5 },
    ],
    status: 'concluded',
    minSamplePerVariant: 3400,
    minimumDetectableEffect: 0.25,
    createdAt: addDays(now, -53),
    startedAt: addDays(now, -52),
    endedAt: addDays(now, -38),
  }

  // Enterprise page (proof-led) and legacy enterprise LinkedIn ads (proof vs discount vs outcome).
  assets.push(await gen(ws, { assetType: 'landing_page', channel: 'web', segmentId: 'seg_enterprise', offerId: 'off_platform', goal: 'Enterprise pipeline', messagingModelId: 'msg_enterprise', trafficSource: 'outbound' }, 50, { id: 'ast_lp_enterprise', name: 'Enterprise page' }))
  const entAdsInput: GenerateInput = { assetType: 'ad_set', channel: 'linkedin', segmentId: 'seg_enterprise', goal: 'Enterprise pipeline', messagingModelId: 'msg_enterprise' }
  const entAdsV1 = legacyVersion(ws, LEGACY_ENTERPRISE_ADS, entAdsInput, addDays(now, -52), { angle: 'proof', ctaStyle: 'call', proofType: 'testimonial', offerType: 'value' })
  assets.push({ id: 'ast_ads_enterprise', name: 'Enterprise LinkedIn ads', type: 'ad_set', channel: 'linkedin', segmentId: 'seg_enterprise', tags: { angle: 'proof' }, versions: [entAdsV1], currentVersionId: entAdsV1.id, publishedVersionId: entAdsV1.id, createdAt: entAdsV1.createdAt })

  // Mid-market ads, nurture sequence and social, generated from the brief.
  assets.push(await gen(ws, { assetType: 'ad_set', channel: 'meta', segmentId: 'seg_midmarket', goal: 'Grow qualified demo requests from mid-market controllers', messagingModelId: 'msg_midmarket', angles: ['problem', 'outcome', 'social_proof'] }, 45, { id: 'ast_ads_midmarket', name: 'Mid-market Meta ads' }))
  assets.push(await gen(ws, { assetType: 'email_sequence', channel: 'email', segmentId: 'seg_midmarket', goal: 'Convert captured leads to strategy calls', messagingModelId: 'msg_midmarket', sequenceKind: 'lead_nurture' }, 40, { id: 'ast_email_nurture', name: 'Mid-market lead nurture' }))
  assets.push(await gen(ws, { assetType: 'social_post', channel: 'linkedin', segmentId: 'seg_midmarket', goal: 'Build trust with mid-market controllers', messagingModelId: 'msg_midmarket', variationCount: 3 }, 20, { id: 'ast_social_linkedin', name: 'LinkedIn posts · September' }))

  ws = { ...ws, assets, experiments: [lpTest] }

  // 60 days of performance from the demo connector.
  const world = demoWorld(now)
  const performance = simulateRange(ws, world, addDays(now, -60), 60)
  ws = { ...ws, performance, simulation: { enabled: true, lastDay: addDays(now, -1), world } }
  const result = evaluateExperiment(ws, lpTest)
  ws = { ...ws, experiments: [{ ...lpTest, result: { ...result, decidedAt: addDays(now, -38) } }] }
  ws = { ...ws, learnings: computeLearnings(ws) }
  ws = {
    ...ws,
    experiments: ws.experiments.map((e) => (e.result ? { ...e, result: { ...e.result, learningIds: ws.learnings.filter((l) => l.evidence.experimentIds.includes(e.id) && l.direction !== 'neutral').map((l) => l.id) } } : e)),
    activity: [
      { id: 'act_seed_3', at: addDays(now, -38), kind: 'experiment_concluded', message: `Experiment “${lpTest.name}” concluded. ${result.summary}`, ref: { type: 'experiment', id: lpTest.id } },
      { id: 'act_seed_2', at: addDays(now, -52), kind: 'executed', message: 'Executed: Start experiment V1 vs V2 on the mid-market demo page.' },
      { id: 'act_seed_1', at: addDays(now, -60), kind: 'import', message: 'Imported existing live copy and customer sources.' },
    ],
  }

  if (opts.runAgent !== false) ws = (await runAgent(ws)).ws
  return ws
}
