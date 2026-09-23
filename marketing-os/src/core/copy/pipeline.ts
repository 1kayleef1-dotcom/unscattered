/**
 * The strategy → copy pipeline.
 *
 *   brief (think) → plan (strategy) → write → critique (separate reviewer)
 *   → revise → re-critique → versioned asset with its full strategy chain.
 *
 * Nothing is overwritten: every generation, edit, revision and rollback
 * becomes a new `AssetVersion` that records what changed, why, and what
 * produced it.
 */
import { buildBrief, relevantLearnings, type BriefInput } from '../brief/brief.ts'
import { combineCritiques, reviseLocally, rulesCritic } from '../critic/critic.ts'
import type {
  Asset,
  AssetContent,
  AssetType,
  AssetVersion,
  Critique,
  GenerationParams,
  CritiqueCheck,
  MarketingBrief,
  StrategyChain,
  Workspace,
} from '../types.ts'
import { newId } from '../util/id.ts'
import { LocalCopyModel, type CopyModel } from './model.ts'
import { planAsset, type AssetPlan } from './plan.ts'

export interface GenerateInput extends GenerationParams {
  name?: string
}

export interface GenerateResult {
  version: AssetVersion
  plan: AssetPlan
  brief: MarketingBrief
  log: string[]
}

const local = new LocalCopyModel()

async function critiqueWith(model: CopyModel, content: AssetContent, brief: MarketingBrief, ws: Workspace, assetType: AssetType, plan: AssetPlan, log: string[]): Promise<Critique> {
  const rules = rulesCritic({ content, brief, brand: ws.brand, assetType, plan })
  let llm: CritiqueCheck[] | undefined
  if (model.critique) {
    try {
      llm = await model.critique({ assetType, content, brief, brand: ws.brand })
    } catch (err) {
      log.push(`LLM critic unavailable (${(err as Error).message}); rules critic only.`)
    }
  }
  return combineCritiques(rules, llm, ws.now)
}

export async function generate(ws: Workspace, input: GenerateInput, model: CopyModel = local): Promise<GenerateResult> {
  const log: string[] = []
  const briefInput: BriefInput = {
    segmentId: input.segmentId,
    offerId: input.offerId,
    channel: input.channel,
    goal: input.goal,
    trafficSource: input.trafficSource,
    messagingModelId: input.messagingModelId,
    focusTheme: input.focusTheme,
  }
  const brief = buildBrief(ws, briefInput)
  if (input.sourceProofId) {
    // Repurposing: the source proof leads the brief so every channel carries the same story.
    const src = ws.brand.proof.find((p) => p.id === input.sourceProofId)
    if (src) {
      brief.proof = [{ proofId: src.id, kind: src.kind, text: src.metric ? `${src.title} (${src.metric.label}: ${src.metric.value})` : src.title }, ...brief.proof.filter((p) => p.proofId !== src.id)]
      brief.evidence = [{ kind: 'proof', id: src.id, note: `Source: ${src.title}` }, ...brief.evidence]
    }
  }
  log.push(`Brief built: ${brief.evidence.length} evidence references, ${brief.gaps.length} gaps, confidence ${Math.round(brief.confidence * 100)}%.`)

  const plan = planAsset(input.assetType, input.channel, { brand: ws.brand, language: ws.language, learnings: relevantLearnings(ws, input.segmentId), brief, existingThemes: recentThemes(ws, input.assetType) }, input)
  log.push(`Plan: ${plan.strategyLabel} — ${plan.sections.length} sections.`)

  let generator = model.label
  let content: AssetContent
  try {
    content = await model.write({ assetType: input.assetType, channel: plan.channel, plan, brief, brand: ws.brand, instructions: input.instructions })
  } catch (err) {
    log.push(`${model.label} failed (${(err as Error).message}); fell back to the offline composer.`)
    generator = `${local.label} (fallback)`
    content = await local.write({ assetType: input.assetType, channel: plan.channel, plan, brief, brand: ws.brand })
  }

  let critique = await critiqueWith(model, content, brief, ws, input.assetType, plan, log)
  const first = critique
  const revisions: string[] = []
  for (let round = 0; round < 2 && critique.verdict !== 'publishable'; round += 1) {
    const failed = critique.checks.filter((c) => !c.passed)
    let revised: AssetContent | undefined
    if (model.revise) {
      try {
        revised = await model.revise({ assetType: input.assetType, channel: plan.channel, plan, brief, brand: ws.brand, content, failedChecks: failed })
        revisions.push(`Round ${round + 1}: ${model.label} revised ${failed.length} failed check(s).`)
      } catch (err) {
        log.push(`Model revision failed (${(err as Error).message}); applied rule-based fixes.`)
      }
    }
    if (!revised) {
      const r = reviseLocally({ content, brief, brand: ws.brand, assetType: input.assetType, plan }, critique)
      if (r.changes.length === 0) break
      revised = r.content
      revisions.push(`Round ${round + 1}: ${r.changes.join(' ')}`)
    }
    content = revised
    critique = await critiqueWith(model, content, brief, ws, input.assetType, plan, log)
  }
  log.push(`Critique: ${first.overall} → ${critique.overall} (${critique.verdict}).`, ...revisions)

  const chain: StrategyChain = {
    businessGoal: input.goal,
    objective: input.objective ?? plan.rationale.summary.split('.')[0],
    segmentId: input.segmentId,
    problem: brief.problem,
    insight: brief.objections[0] ? `${brief.objections[0].theme}: “${brief.objections[0].customerWords}”` : brief.problem,
    positioning: brief.positioning,
    message: brief.message,
    creativeConcept: plan.creativeConcept,
    cta: brief.cta,
    measurement: { primaryMetric: plan.primaryMetric, secondary: plan.secondaryMetrics },
    messagingModelId: input.messagingModelId ?? ws.messaging.find((m) => m.segmentId === input.segmentId)?.id,
  }
  const messaging = ws.messaging.find((m) => m.id === chain.messagingModelId)

  const version: AssetVersion = {
    id: newId('ver'),
    number: 1,
    label: 'V1',
    content,
    brief,
    chain,
    rationale: { ...plan.rationale, decisions: [...plan.rationale.decisions, ...(revisions.length ? [{ decision: 'Revised after critique', why: revisions.join(' '), evidence: [] }] : [])] },
    critique,
    preRevisionCritique: revisions.length ? first : undefined,
    status: critique.verdict === 'publishable' ? 'in_review' : 'draft',
    createdAt: ws.now,
    createdBy: 'ai',
    generator,
    changeSummary: 'Generated',
    changeReason: input.goal,
    messagingVersion: messaging?.version,
    tags: plan.tags,
    params: stripName(input),
  }
  return { version, plan, brief, log }
}

function stripName(input: GenerateInput): GenerationParams {
  const { name: _name, ...params } = input
  return params
}

export function recentThemes(ws: Workspace, assetType: AssetType): string[] {
  return ws.assets
    .filter((a) => a.type === assetType)
    .flatMap((a) => a.versions[a.versions.length - 1].content.sections.map((s) => String(s.meta?.theme ?? '')))
    .filter(Boolean)
}

export function assetFromGeneration(result: GenerateResult, input: GenerateInput, extra: Partial<Asset> = {}): Asset {
  return {
    id: newId('ast'),
    name: input.name ?? defaultName(input, result.plan),
    type: input.assetType,
    channel: result.plan.channel,
    segmentId: input.segmentId,
    tags: result.plan.tags,
    versions: [result.version],
    currentVersionId: result.version.id,
    createdAt: result.version.createdAt,
    ...extra,
  }
}

const TYPE_LABELS: Record<AssetType, string> = {
  landing_page: 'Landing page',
  email_sequence: 'Email sequence',
  ad_set: 'Ad set',
  social_post: 'Social posts',
  video_script: 'Video scripts',
  carousel: 'Carousel',
  thread: 'Thread',
  sales_enablement: 'Sales enablement',
  creative_concept: 'Creative concepts',
}

export function assetTypeLabel(t: AssetType): string {
  return TYPE_LABELS[t]
}

function defaultName(input: GenerateInput, plan: AssetPlan): string {
  return `${TYPE_LABELS[input.assetType]} · ${plan.strategyLabel}`
}

/** Add a new version to an asset (never overwrites). */
export function appendVersion(asset: Asset, version: Omit<AssetVersion, 'number' | 'label'>, labelPrefix = 'V'): Asset {
  const number = asset.versions.length + 1
  const v: AssetVersion = { ...version, number, label: `${labelPrefix}${number}`, parentVersionId: version.parentVersionId ?? asset.currentVersionId }
  return { ...asset, versions: [...asset.versions, v], currentVersionId: v.id, stale: undefined }
}

export function currentVersion(asset: Asset): AssetVersion {
  return asset.versions.find((v) => v.id === asset.currentVersionId) ?? asset.versions[asset.versions.length - 1]
}
