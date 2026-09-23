/**
 * The domain model for the marketing operating system.
 *
 * Everything the system knows about a business lives in one `Workspace`:
 * the Brand Brain, raw customer sources and the language extracted from
 * them, the central messaging model, every asset (with its full version
 * history and the strategy chain that explains why it exists), performance
 * data, experiments, learned patterns, problems under investigation,
 * campaign plans, approvals and the agent's run log.
 *
 * Engines are pure functions over this model. That keeps every decision
 * inspectable and testable, and lets the same code run in the browser, in
 * the proxy server, and in a scheduled "every morning" agent job.
 */

export type ID = string
export type ISODate = string

// ---------------------------------------------------------------------------
// Evidence & customer language
// ---------------------------------------------------------------------------

export type SourceKind =
  | 'review'
  | 'sales_call'
  | 'support'
  | 'survey'
  | 'crm_note'
  | 'email'
  | 'chat'
  | 'testimonial'

export interface CustomerSource {
  id: ID
  kind: SourceKind
  title: string
  text: string
  date: ISODate
  segmentId?: ID
  customer?: string
  /** What happened with this customer/prospect, when known. */
  outcome?: 'won' | 'lost' | 'churned' | 'active' | 'open'
}

export type InsightKind =
  | 'pain'
  | 'desired_outcome'
  | 'objection'
  | 'buying_trigger'
  | 'emotion'
  | 'reason_chose'
  | 'reason_rejected'
  | 'competitor_mention'
  | 'product_request'

export interface Quote {
  sourceId: ID
  sourceKind: SourceKind
  text: string
  date: ISODate
  segmentId?: ID
}

/** A recurring theme customers express, backed by verbatim quotes. */
export interface Insight {
  id: ID
  kind: InsightKind
  theme: string
  summary: string
  quotes: Quote[]
  frequency: number
  segmentIds: ID[]
  competitors: string[]
  firstSeen: ISODate
  lastSeen: ISODate
  /** Mentions in the last 30 days vs. the 30 before; >1 means rising. */
  trend: number
}

export interface Phrase {
  text: string
  count: number
  kinds: InsightKind[]
}

export interface CustomerLanguageIndex {
  insights: Insight[]
  phrases: Phrase[]
  competitorMentions: Record<string, number>
  builtAt: ISODate
  sourceCount: number
}

// ---------------------------------------------------------------------------
// Brand Brain
// ---------------------------------------------------------------------------

/** Eugene Schwartz's five stages of customer awareness. */
export type Awareness =
  | 'unaware'
  | 'problem_aware'
  | 'solution_aware'
  | 'product_aware'
  | 'most_aware'

/** Market sophistication, 1 (first to market) to 5 (jaded by claims). */
export type Sophistication = 1 | 2 | 3 | 4 | 5

export interface Segment {
  id: ID
  name: string
  description: string
  awareness: Awareness
  sophistication: Sophistication
  industries: string[]
  jobTitles: string[]
  priority: 'primary' | 'secondary' | 'exploratory'
  /** Words that identify this segment in free text ("dentist", "clinic"). */
  keywords: string[]
}

export interface Persona {
  id: ID
  segmentId: ID
  name: string
  role: string
  goals: string[]
  fears: string[]
  quote: string
}

export interface Offer {
  id: ID
  name: string
  kind: 'product' | 'service' | 'trial' | 'demo' | 'lead_magnet' | 'bundle'
  description: string
  price?: { amount: number; currency: string; period?: 'month' | 'year' | 'once' }
  priceTier: 'low' | 'mid' | 'high' | 'enterprise'
  purchaseComplexity: 'simple' | 'considered' | 'complex'
  guarantee?: string
  cta: string
  outcomes: string[]
  features: { name: string; benefit: string }[]
}

export interface Claim {
  id: ID
  text: string
  status: 'approved' | 'needs_proof' | 'prohibited'
  proofIds: ID[]
}

export type ProofKind =
  | 'testimonial'
  | 'case_study'
  | 'metric'
  | 'logo'
  | 'award'
  | 'review_rating'
  | 'guarantee'

export interface Proof {
  id: ID
  kind: ProofKind
  title: string
  detail: string
  customer?: string
  metric?: { label: string; value: string }
  segmentIds: ID[]
  sourceId?: ID
}

export interface Competitor {
  id: ID
  name: string
  kind: 'direct' | 'indirect' | 'status_quo'
  /** Other ways customers refer to it ("excel", "by email"). */
  aliases?: string[]
  positioning: string
  strengths: string[]
  weaknesses: string[]
}

export interface BrandVoice {
  traits: string[]
  tone: string
  wordsToUse: string[]
  wordsToAvoid: string[]
  /** Preferred replacements, e.g. { "leverage": "use" }. */
  substitutions: Record<string, string>
  targetReadingGrade: number
  /** 1 = casual, 5 = formal. */
  formality: 1 | 2 | 3 | 4 | 5
  rules: string[]
  exemplars: { text: string; note: string }[]
}

export interface MessagingPillar {
  id: ID
  name: string
  statement: string
  proofIds: ID[]
  segmentIds: ID[]
}

export interface Positioning {
  category: string
  forWho: string
  problem: string
  alternative: string
  differentiator: string
  statement: string
}

export interface BrandBrain {
  company: string
  oneLiner: string
  mission: string
  website?: string
  positioning: Positioning
  offers: Offer[]
  segments: Segment[]
  personas: Persona[]
  voice: BrandVoice
  claims: Claim[]
  proof: Proof[]
  competitors: Competitor[]
  pillars: MessagingPillar[]
  updatedAt: ISODate
}

// ---------------------------------------------------------------------------
// Messaging model — the single source of truth every asset derives from
// ---------------------------------------------------------------------------

export interface MessagingModel {
  id: ID
  name: string
  segmentId: ID
  offerId: ID
  version: number
  /** Segment-specific positioning; falls back to the Brand Brain's statement. */
  positioning?: string
  coreMessage: string
  supportingPoints: string[]
  proofIds: ID[]
  cta: string
  updatedAt: ISODate
  history: { version: number; coreMessage: string; supportingPoints: string[]; cta: string; changedAt: ISODate; reason: string }[]
}

// ---------------------------------------------------------------------------
// Strategy → brief → copy
// ---------------------------------------------------------------------------

export interface EvidenceRef {
  kind: 'insight' | 'proof' | 'learning' | 'performance' | 'source' | 'experiment'
  id: ID
  note: string
}

/** Why a piece of copy exists — stored with every asset version. */
export interface StrategyChain {
  businessGoal: string
  objective: string
  segmentId: ID
  problem: string
  insight: string
  positioning: string
  message: string
  creativeConcept: string
  cta: string
  measurement: { primaryMetric: MetricKey; secondary: MetricKey[]; target?: string }
  messagingModelId?: ID
}

export type Channel =
  | 'web'
  | 'email'
  | 'meta'
  | 'google'
  | 'linkedin'
  | 'tiktok'
  | 'youtube'
  | 'x'
  | 'instagram'
  | 'threads'
  | 'sales'

/** The Marketing Brief the copywriter builds before writing anything. */
export interface MarketingBrief {
  offer: { id: ID; name: string; summary: string }
  audience: { segmentId: ID; name: string; description: string; persona?: string }
  problem: string
  problemTheme?: string
  /** The single best customer quote describing the problem. */
  problemQuote?: string
  desiredOutcome: string
  awareness: Awareness
  sophistication: Sophistication
  objections: { theme: string; customerWords: string; response: string; evidence: EvidenceRef[] }[]
  alternatives: string[]
  competitors: { name: string; angle: string }[]
  proof: { proofId: ID; kind: ProofKind; text: string }[]
  positioning: string
  message: string
  cta: string
  channel: Channel
  trafficSource?: TrafficSource
  voice: { tone: string; traits: string[]; avoid: string[] }
  customerPhrases: string[]
  learnings: { statement: string; learningId: ID }[]
  evidence: EvidenceRef[]
  /** Things the brief could not ground in data — surfaced, never invented. */
  gaps: string[]
  confidence: number
}

export type TrafficSource =
  | 'paid_social'
  | 'paid_search'
  | 'organic_search'
  | 'email'
  | 'referral'
  | 'direct'
  | 'retargeting'
  | 'outbound'

// ---------------------------------------------------------------------------
// Assets & versions
// ---------------------------------------------------------------------------

export type AssetType =
  | 'landing_page'
  | 'email_sequence'
  | 'ad_set'
  | 'social_post'
  | 'video_script'
  | 'carousel'
  | 'thread'
  | 'sales_enablement'
  | 'creative_concept'

export type LandingStrategy =
  | 'problem_led'
  | 'outcome_led'
  | 'proof_led'
  | 'demo_led'
  | 'comparison_led'
  | 'education_led'
  | 'product_led'

export type AdAngle =
  | 'problem'
  | 'outcome'
  | 'proof'
  | 'contrarian'
  | 'curiosity'
  | 'objection'
  | 'comparison'
  | 'specificity'
  | 'urgency'
  | 'social_proof'

export type SequenceKind =
  | 'welcome'
  | 'lead_nurture'
  | 'educational'
  | 'lead_magnet_followup'
  | 'sales'
  | 'launch'
  | 'offer'
  | 'cart_abandonment'
  | 'demo_followup'
  | 'trial_conversion'
  | 'onboarding'
  | 'activation'
  | 'engagement'
  | 'upsell'
  | 'cross_sell'
  | 'renewal'
  | 'win_back'
  | 'churn_prevention'
  | 'reactivation'

export interface CopyBlock {
  key: string
  label: string
  text: string
  /** Evidence this specific line is grounded in (quotes, proof). */
  evidence?: EvidenceRef[]
}

export interface AssetSection {
  id: string
  kind: string
  title: string
  blocks: CopyBlock[]
  rationale?: string
  meta?: Record<string, string | number>
}

export interface AssetContent {
  sections: AssetSection[]
}

export interface Rationale {
  summary: string
  decisions: { decision: string; why: string; evidence: EvidenceRef[] }[]
  alternativesConsidered?: { option: string; score: number; why: string }[]
}

export type CritiqueDimension = 'strategic' | 'persuasion' | 'brand' | 'quality'

export interface CritiqueCheck {
  id: string
  dimension: CritiqueDimension
  criterion: string
  score: number
  passed: boolean
  severity: 'blocker' | 'major' | 'minor'
  finding: string
  fix?: string
  location?: string
}

export interface Critique {
  reviewers: ('rules' | 'llm')[]
  checks: CritiqueCheck[]
  scores: Record<CritiqueDimension, number>
  overall: number
  verdict: 'publishable' | 'revise' | 'reject'
  createdAt: ISODate
}

export type VersionStatus = 'draft' | 'in_review' | 'approved' | 'published' | 'retired'

/** Everything needed to regenerate an asset the same way (or with overrides). */
export interface GenerationParams {
  assetType: AssetType
  channel: Channel
  segmentId: ID
  offerId?: ID
  goal: string
  objective?: string
  messagingModelId?: ID
  strategy?: LandingStrategy
  trafficSource?: TrafficSource
  sequenceKind?: SequenceKind
  angles?: AdAngle[]
  variationCount?: number
  focusTheme?: string
  instructions?: string
  platforms?: Channel[]
  /** Repurposing: build around this proof and keep its message intact. */
  sourceProofId?: ID
  /** Landing page: only these section kinds (e.g. a single case-study section). */
  sectionsOnly?: string[]
  /** Email: a single email with this job instead of a sequence. */
  singleEmailJob?: string
}

export interface AssetVersion {
  id: ID
  number: number
  label: string
  content: AssetContent
  brief: MarketingBrief
  chain: StrategyChain
  rationale: Rationale
  critique?: Critique
  /** Critique of the draft before the revision pass, for comparison. */
  preRevisionCritique?: Critique
  status: VersionStatus
  createdAt: ISODate
  createdBy: 'ai' | 'user'
  generator: string
  changeSummary: string
  changeReason: string
  parentVersionId?: ID
  /** Tags specific to this version (strategy can change between versions). */
  tags?: AssetTags
  params?: GenerationParams
  messagingVersion?: number
  approvedBy?: string
  approvedAt?: ISODate
  publishedAt?: ISODate
  externalRef?: { connector: string; externalId: string; url?: string }
}

/** Tags used to connect copy decisions to performance and learning. */
export interface AssetTags {
  strategy?: LandingStrategy
  angle?: AdAngle
  proofType?: ProofKind | 'none'
  ctaStyle?: 'demo' | 'trial' | 'call' | 'buy' | 'learn' | 'download'
  offerType?: 'discount' | 'value' | 'guarantee' | 'bonus' | 'none'
  sequenceKind?: SequenceKind
  theme?: string
}

export interface Asset {
  id: ID
  name: string
  type: AssetType
  channel: Channel
  segmentId: ID
  campaignId?: ID
  problemId?: ID
  tags: AssetTags
  versions: AssetVersion[]
  currentVersionId: ID
  publishedVersionId?: ID
  derivedFrom?: { assetId?: ID; proofId?: ID; note: string }
  stale?: { reason: string; since: ISODate; messagingVersion: number }
  createdAt: ISODate
}

// ---------------------------------------------------------------------------
// Performance, experiments, learning
// ---------------------------------------------------------------------------

export interface Metrics {
  impressions?: number
  clicks?: number
  visits?: number
  conversions?: number
  qualifiedConversions?: number
  revenue?: number
  spend?: number
  sends?: number
  opens?: number
  emailClicks?: number
  unsubscribes?: number
  engagements?: number
  pipeline?: number
}

export type MetricKey =
  | 'ctr'
  | 'cvr'
  | 'qualified_cvr'
  | 'cac'
  | 'roas'
  | 'open_rate'
  | 'click_rate'
  | 'unsubscribe_rate'
  | 'engagement_rate'
  | 'revenue'
  | 'pipeline'

export interface PerformanceRecord {
  id: ID
  assetId: ID
  versionId: ID
  /** A section of the asset (ad variation, email in a sequence). */
  variantKey?: string
  date: ISODate
  segmentId: ID
  channel: Channel
  device?: 'mobile' | 'desktop'
  source?: TrafficSource
  metrics: Metrics
}

export interface Experiment {
  id: ID
  name: string
  hypothesis: string
  primaryMetric: MetricKey
  segmentId: ID
  channel: Channel
  variants: { key: string; label: string; assetId: ID; versionId: ID; split: number }[]
  status: 'draft' | 'awaiting_approval' | 'running' | 'concluded' | 'stopped'
  minSamplePerVariant: number
  minimumDetectableEffect: number
  createdAt: ISODate
  startedAt?: ISODate
  endedAt?: ISODate
  problemId?: ID
  result?: ExperimentResult
}

export interface VariantStats {
  key: string
  n: number
  successes: number
  rate: number
  interval: [number, number]
}

export interface ExperimentResult {
  variants: VariantStats[]
  winner?: string
  lift: number
  pValue: number
  probabilityBest: Record<string, number>
  significant: boolean
  decidedAt: ISODate
  summary: string
  learningIds: ID[]
}

export type LearningDimension =
  | 'strategy'
  | 'angle'
  | 'proof_type'
  | 'cta'
  | 'offer_type'
  | 'sequence_kind'
  | 'theme'
  | 'channel'

export interface Learning {
  id: ID
  segmentId: ID
  channel?: Channel
  channelGroup: 'web' | 'email' | 'ads' | 'social'
  /** Other decisions that changed at the same time and cannot be separated. */
  confounded?: string[]
  dimension: LearningDimension
  value: string
  metric: MetricKey
  baselineRate: number
  posteriorRate: number
  interval: [number, number]
  /** Relative lift over the segment baseline, e.g. 0.34 = +34%. */
  effect: number
  probabilityBetter: number
  sampleSize: number
  confidence: 'low' | 'medium' | 'high'
  direction: 'strong' | 'weak' | 'neutral'
  source: 'experiment' | 'observational'
  evidence: { experimentIds: ID[]; assetIds: ID[] }
  statement: string
  updatedAt: ISODate
}

// ---------------------------------------------------------------------------
// Problem solving
// ---------------------------------------------------------------------------

export interface Anomaly {
  id: ID
  metric: MetricKey
  scope: { assetId?: ID; channel?: Channel; segmentId?: ID }
  scopeLabel: string
  baseline: number
  current: number
  change: number
  zScore: number
  direction: 'drop' | 'spike'
  severity: 'low' | 'medium' | 'high'
  detectedAt: ISODate
  window: { baselineDays: number; recentDays: number }
}

export interface InvestigationStep {
  kind:
    | 'traffic_mix'
    | 'audience_mix'
    | 'device_breakdown'
    | 'source_breakdown'
    | 'version_change'
    | 'customer_research'
    | 'competitor_signal'
    | 'learning_check'
  question: string
  finding: string
  implicates: boolean
  data?: Record<string, number | string>
  evidence: EvidenceRef[]
}

export interface Hypothesis {
  id: ID
  statement: string
  mechanism: string
  confidence: number
  support: string[]
  evidence: EvidenceRef[]
  recommendedStrategy?: LandingStrategy
  recommendedAngles?: AdAngle[]
  /** Customer theme the solution should be built around. */
  focusTheme?: string
  testMetric: MetricKey
}

export interface PlannedAsset {
  id: ID
  type: AssetType
  channel: Channel
  purpose: string
  strategy?: LandingStrategy
  angles?: AdAngle[]
  sequenceKind?: SequenceKind
  dependsOn: ID[]
  consequential: boolean
  assetId?: ID
  status: 'planned' | 'generated' | 'approved' | 'executed'
}

export type ProblemStatus =
  | 'detected'
  | 'investigated'
  | 'solution_proposed'
  | 'assets_ready'
  | 'experimenting'
  | 'resolved'
  | 'dismissed'

export interface Problem {
  id: ID
  title: string
  kind: 'anomaly' | 'opportunity'
  status: ProblemStatus
  segmentId: ID
  anomaly?: Anomaly
  opportunity?: string
  investigation: InvestigationStep[]
  hypotheses: Hypothesis[]
  selectedHypothesisId?: ID
  solution?: {
    summary: string
    positioningShift: string
    assets: PlannedAsset[]
    experimentDesign: string
  }
  experimentId?: ID
  learningIds: ID[]
  timeline: { at: ISODate; event: string }[]
  createdAt: ISODate
}

// ---------------------------------------------------------------------------
// Campaign planning, approvals, execution
// ---------------------------------------------------------------------------

export type GoalKind =
  | 'launch'
  | 'new_segment'
  | 'conversion'
  | 'retention'
  | 'reactivation'
  | 'pipeline'
  | 'awareness'

export interface CampaignPlan {
  id: ID
  goal: string
  kind: GoalKind
  segmentId: ID
  offerId: ID
  createdAt: ISODate
  status: 'draft' | 'generating' | 'ready_for_approval' | 'executing' | 'live'
  investigation: { question: string; finding: string; evidence: EvidenceRef[] }[]
  gaps: string[]
  positioning: string
  offerRecommendation: string
  messagingModelId: ID
  workstreams: { name: string; purpose: string; assets: PlannedAsset[] }[]
  measurement: { primary: MetricKey; secondary: MetricKey[]; targets: string[]; reviewCadence: string }
  proposedSegment?: Segment
}

export type ActionKind =
  | 'publish_asset'
  | 'launch_experiment'
  | 'activate_sequence'
  | 'launch_ads'
  | 'update_messaging'
  | 'rollback'

export interface ApprovalRequest {
  id: ID
  action: ActionKind
  title: string
  description: string
  why: string
  payload: { assetId?: ID; versionId?: ID; experimentId?: ID; planId?: ID; problemId?: ID; budget?: number }
  risk: 'low' | 'medium' | 'high'
  requestedAt: ISODate
  requestedBy: 'agent' | 'user'
  status: 'pending' | 'approved' | 'rejected' | 'executed' | 'failed'
  decidedBy?: string
  decidedAt?: ISODate
  result?: string
}

export interface AgentStep {
  n: number
  name: string
  status: 'ok' | 'attention' | 'skipped'
  summary: string
  items: string[]
}

export interface AgentRun {
  id: ID
  startedAt: ISODate
  finishedAt: ISODate
  steps: AgentStep[]
  headline: string
}

export interface Recommendation {
  id: ID
  title: string
  detail: string
  kind: 'repurpose' | 'propagate' | 'add_angle' | 'roll_out' | 'product_feedback' | 'collect_proof' | 'investigate'
  ref?: { assetId?: ID; proofId?: ID; messagingModelId?: ID; segmentId?: ID; problemId?: ID }
  createdAt: ISODate
  status: 'open' | 'done' | 'dismissed'
}

export interface ActivityEvent {
  id: ID
  at: ISODate
  kind: string
  message: string
  ref?: { type: 'asset' | 'problem' | 'plan' | 'experiment' | 'learning'; id: ID }
}

// ---------------------------------------------------------------------------
// Workspace
// ---------------------------------------------------------------------------

export interface Workspace {
  schemaVersion: 1
  brand: BrandBrain
  sources: CustomerSource[]
  language: CustomerLanguageIndex
  messaging: MessagingModel[]
  assets: Asset[]
  performance: PerformanceRecord[]
  experiments: Experiment[]
  learnings: Learning[]
  problems: Problem[]
  plans: CampaignPlan[]
  approvals: ApprovalRequest[]
  agentRuns: AgentRun[]
  recommendations: Recommendation[]
  activity: ActivityEvent[]
  /** "Today" for the engine; injectable so runs are reproducible. */
  now: ISODate
  /** Demo data connector state; absent when real connectors supply performance. */
  simulation?: { enabled: boolean; lastDay: ISODate; world: import('./performance/simulate.ts').WorldModel }
}
