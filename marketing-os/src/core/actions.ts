/**
 * High-level actions that involve generation. Each returns a new Workspace
 * and never overwrites existing copy.
 */
import { buildIndex, indexSources } from './language/customerLanguage.ts'
import { LocalCopyModel, type CopyModel } from './copy/model.ts'
import { appendVersion, assetFromGeneration, currentVersion, generate, type GenerateInput } from './copy/pipeline.ts'
import { designExperiment } from './experiments/experiments.ts'
import { log, requestApproval, upsertAsset } from './ops.ts'
import type { Asset, AssetType, Channel, GenerationParams, ID, PlannedAsset, Workspace } from './types.ts'
import { assetsUsing } from './messaging/messaging.ts'
import { combineCritiques, rulesCritic } from './critic/critic.ts'

const local = new LocalCopyModel()

export async function createAsset(ws: Workspace, input: GenerateInput, model: CopyModel = local, extra: Partial<Asset> = {}): Promise<{ ws: Workspace; asset: Asset; log: string[] }> {
  const res = await generate(ws, input, model)
  const asset = assetFromGeneration(res, input, extra)
  const next = log(upsertAsset(ws, asset), 'generated', `Generated “${asset.name}” (${res.version.generator}, critique ${res.version.critique?.overall ?? '—'}).`, { type: 'asset', id: asset.id })
  return { ws: next, asset, log: res.log }
}

/** Regenerate an asset as a new version, optionally changing tone, audience, strategy, angles… */
export async function regenerate(ws: Workspace, assetId: ID, overrides: Partial<GenerationParams>, reason: string, model: CopyModel = local): Promise<{ ws: Workspace; log: string[] }> {
  const asset = ws.assets.find((a) => a.id === assetId)
  if (!asset) return { ws, log: ['Asset not found'] }
  const cur = currentVersion(asset)
  const params: GenerateInput = {
    ...(cur.params ?? { assetType: asset.type, channel: asset.channel, segmentId: asset.segmentId, goal: cur.chain.businessGoal }),
    ...overrides,
  }
  const res = await generate(ws, params, model)
  const next = appendVersion(asset, { ...res.version, parentVersionId: cur.id, changeSummary: reason, changeReason: reason })
  const updated = { ...next, segmentId: params.segmentId, tags: { ...asset.tags, ...res.plan.tags } }
  const label = updated.versions[updated.versions.length - 1].label
  return { ws: log(upsertAsset(ws, updated), 'regenerated', `“${asset.name}” ${label}: ${reason}`, { type: 'asset', id: asset.id }), log: res.log }
}

/** Create alternative concepts as sibling assets (Concept B, C…) with different angles/strategy. */
export async function createVariants(ws: Workspace, assetId: ID, model: CopyModel = local): Promise<{ ws: Workspace; created: Asset[] }> {
  const asset = ws.assets.find((a) => a.id === assetId)
  if (!asset) return { ws, created: [] }
  const cur = currentVersion(asset)
  const base: GenerateInput = { ...(cur.params ?? { assetType: asset.type, channel: asset.channel, segmentId: asset.segmentId, goal: cur.chain.businessGoal }) }
  const alternatives: Partial<GenerationParams>[] =
    asset.type === 'landing_page'
      ? (cur.rationale.alternativesConsidered ?? []).slice(0, 2).map((a) => ({ strategy: strategyFromLabel(a.option) })).filter((x) => x.strategy)
      : asset.type === 'ad_set' || asset.type === 'creative_concept' || asset.type === 'video_script'
        ? [{ angles: (cur.rationale.alternativesConsidered ?? []).filter((a) => a.score > 0).slice(0, 2).map((a) => a.option.toLowerCase().replace(' ', '_') as NonNullable<GenerationParams['angles']>[number]), variationCount: 2 }]
        : [{ instructions: 'Alternative take: different hook and structure, same brief.' }]
  let next = ws
  const created: Asset[] = []
  for (const [i, alt] of alternatives.entries()) {
    const letter = String.fromCharCode(66 + i + ws.assets.filter((a) => a.derivedFrom?.assetId === asset.id).length)
    const r = await createAsset(next, { ...base, ...alt, name: `${asset.name} — Concept ${letter}` }, model, { derivedFrom: { assetId: asset.id, note: `Alternative concept to “${asset.name}”` }, campaignId: asset.campaignId, problemId: asset.problemId })
    next = r.ws
    created.push(r.asset)
  }
  return { ws: next, created }
}

function strategyFromLabel(label: string): GenerationParams['strategy'] {
  const s = label.toLowerCase().replace('-led', '_led')
  return (['problem_led', 'outcome_led', 'proof_led', 'demo_led', 'comparison_led', 'education_led', 'product_led'] as const).find((x) => x === s)
}

/** Regenerate every asset flagged stale by a messaging change. */
export async function propagateMessaging(ws: Workspace, modelId: ID, model: CopyModel = local): Promise<Workspace> {
  let next = ws
  const m = ws.messaging.find((x) => x.id === modelId)
  for (const asset of assetsUsing(ws, modelId).filter((a) => a.stale)) {
    const r = await regenerate(next, asset.id, { messagingModelId: modelId }, `Updated to messaging v${m?.version}: ${asset.stale!.reason}`, model)
    next = r.ws
  }
  return log(next, 'messaging', `Propagated messaging “${m?.name}” v${m?.version} to all derived assets.`)
}

/** One source → an ecosystem of channel-native assets that carry the same message. */
export const REPURPOSE_TARGETS: { label: string; params: Pick<GenerationParams, 'assetType' | 'channel'> & Partial<GenerationParams> }[] = [
  { label: 'Landing page section', params: { assetType: 'landing_page', channel: 'web', strategy: 'proof_led', sectionsOnly: ['case_study', 'results', 'final_cta'] } },
  { label: 'Email', params: { assetType: 'email_sequence', channel: 'email', singleEmailJob: 'story' } },
  { label: 'LinkedIn post', params: { assetType: 'social_post', channel: 'linkedin', variationCount: 1, platforms: ['linkedin'] } },
  { label: 'X thread', params: { assetType: 'thread', channel: 'x' } },
  { label: 'Instagram carousel', params: { assetType: 'carousel', channel: 'instagram' } },
  { label: 'Short video script', params: { assetType: 'video_script', channel: 'tiktok', angles: ['proof'], variationCount: 1 } },
  { label: 'Ad concept', params: { assetType: 'creative_concept', channel: 'meta', angles: ['proof', 'specificity'], variationCount: 2 } },
  { label: 'Sales enablement', params: { assetType: 'sales_enablement', channel: 'sales' } },
]

export async function repurpose(ws: Workspace, proofId: ID, segmentId: ID, model: CopyModel = local, targets = REPURPOSE_TARGETS): Promise<{ ws: Workspace; created: Asset[] }> {
  const proof = ws.brand.proof.find((p) => p.id === proofId)
  if (!proof) return { ws, created: [] }
  let next = ws
  const created: Asset[] = []
  for (const t of targets) {
    const r = await createAsset(
      next,
      { ...t.params, segmentId, goal: `Repurpose “${proof.title}”`, sourceProofId: proofId, name: `${t.label} · ${proof.customer ?? proof.title}` },
      model,
      { derivedFrom: { proofId, note: `Repurposed from “${proof.title}”` } },
    )
    next = r.ws
    created.push(r.asset)
  }
  return { ws: log(next, 'repurposed', `Repurposed “${proof.title}” into ${created.length} channel-native assets.`), created }
}

function planToInput(pa: PlannedAsset, segmentId: ID, goal: string, extra: Partial<GenerationParams>): GenerateInput {
  return {
    assetType: pa.type as AssetType,
    channel: pa.channel as Channel,
    segmentId,
    goal,
    objective: pa.purpose,
    strategy: pa.strategy,
    sequenceKind: pa.sequenceKind,
    angles: pa.angles,
    name: pa.purpose,
    ...extra,
  }
}

function approvalFor(ws: Workspace, asset: Asset, why: string): Workspace {
  const v = currentVersion(asset)
  const action = asset.channel === 'email' ? 'activate_sequence' : asset.type === 'ad_set' || asset.type === 'creative_concept' ? 'launch_ads' : 'publish_asset'
  return requestApproval(ws, {
    action,
    title: `${action === 'activate_sequence' ? 'Activate' : action === 'launch_ads' ? 'Launch' : 'Publish'} “${asset.name}”`,
    description: `${v.label} · critique ${v.critique?.overall ?? '—'} (${v.critique?.verdict ?? 'unreviewed'})`,
    why,
    payload: { assetId: asset.id, versionId: v.id },
    risk: action === 'launch_ads' ? 'medium' : 'low',
    requestedBy: 'agent',
  })
}

/** Generate the assets a problem's solution calls for, set up the experiment, and request approvals. */
export async function prepareProblemAssets(ws: Workspace, problemId: ID, model: CopyModel = local): Promise<Workspace> {
  const problem = ws.problems.find((p) => p.id === problemId)
  if (!problem?.solution) return ws
  const hyp = problem.hypotheses.find((h) => h.id === problem.selectedHypothesisId) ?? problem.hypotheses[0]
  let next = ws
  const planned: PlannedAsset[] = []
  const goal = `Fix: ${problem.title}`
  for (const pa of problem.solution.assets) {
    if (pa.assetId) {
      planned.push(pa)
      continue
    }
    const input = planToInput(pa, problem.segmentId, goal, { focusTheme: hyp?.focusTheme, trafficSource: 'paid_social' })
    const targetId = problem.anomaly?.scope.assetId
    if (pa.type === 'landing_page' && targetId && next.assets.some((a) => a.id === targetId)) {
      // The challenger is a new version of the same page — never a replacement.
      const r = await regenerate(next, targetId, { ...input, name: undefined } as Partial<GenerationParams>, `Challenger for “${problem.title}”: ${hyp?.statement ?? ''}`, model)
      next = r.ws
      const asset = next.assets.find((a) => a.id === targetId)!
      next = upsertAsset(next, { ...asset, problemId, currentVersionId: asset.currentVersionId })
      planned.push({ ...pa, assetId: targetId, status: 'generated' })
    } else {
      const r = await createAsset(next, input, model, { problemId })
      next = r.ws
      planned.push({ ...pa, assetId: r.asset.id, status: 'generated' })
    }
  }

  // Experiment: current published version vs. the new challenger.
  const targetId = problem.anomaly?.scope.assetId
  const target = targetId ? next.assets.find((a) => a.id === targetId) : undefined
  let experimentId: ID | undefined
  if (target && target.publishedVersionId && target.currentVersionId !== target.publishedVersionId && hyp) {
    const control = target.versions.find((v) => v.id === target.publishedVersionId)!
    const challenger = currentVersion(target)
    const exp = designExperiment(next, {
      name: `${control.label} vs ${challenger.label}: ${hyp.focusTheme ?? hyp.statement}`,
      hypothesis: `${hyp.statement} ${hyp.mechanism}`,
      metric: hyp.testMetric,
      segmentId: problem.segmentId,
      channel: target.channel,
      variants: [
        { key: 'A', label: `${control.label} (control)`, assetId: target.id, versionId: control.id },
        { key: 'B', label: `${challenger.label} (${hyp.focusTheme ?? 'challenger'})`, assetId: target.id, versionId: challenger.id },
      ],
      problemId,
    })
    experimentId = exp.id
    next = { ...next, experiments: [exp, ...next.experiments] }
    next = requestApproval(next, {
      action: 'launch_experiment',
      title: `Start experiment: ${exp.name}`,
      description: `50/50 split, ${exp.minSamplePerVariant.toLocaleString()} visits per variant to detect a ${Math.round(exp.minimumDetectableEffect * 100)}% lift.`,
      why: problem.solution.experimentDesign,
      payload: { experimentId: exp.id, problemId },
      risk: 'low',
      requestedBy: 'agent',
    })
  }
  for (const pa of planned) {
    const asset = next.assets.find((a) => a.id === pa.assetId)
    if (asset && pa.consequential && asset.id !== targetId) next = approvalFor(next, asset, `Part of the fix for “${problem.title}”: ${pa.purpose}.`)
  }
  next = {
    ...next,
    problems: next.problems.map((p) =>
      p.id === problemId
        ? { ...p, status: 'assets_ready', experimentId, solution: { ...p.solution!, assets: planned }, timeline: [...p.timeline, { at: next.now, event: `Prepared ${planned.length} assets${experimentId ? ' and an experiment' : ''}; approvals requested.` }] }
        : p,
    ),
  }
  return log(next, 'prepared', `Assets prepared for “${problem.title}”.`, { type: 'problem', id: problemId })
}

/** Generate every planned asset in a campaign plan, in dependency order, then request approvals. */
export async function generatePlanAssets(ws: Workspace, planId: ID, model: CopyModel = local, onProgress?: (done: number, total: number, label: string) => void): Promise<Workspace> {
  const plan = ws.plans.find((p) => p.id === planId)
  if (!plan) return ws
  let next: Workspace = { ...ws, plans: ws.plans.map((p) => (p.id === planId ? { ...p, status: 'generating' } : p)) }
  const all = plan.workstreams.flatMap((w) => w.assets)
  const ordered = [...all.filter((a) => a.dependsOn.length === 0), ...all.filter((a) => a.dependsOn.length > 0)]
  const done = new Map<ID, ID>()
  let i = 0
  for (const pa of ordered) {
    onProgress?.(i, ordered.length, pa.purpose)
    if (!pa.assetId) {
      const r = await createAsset(next, planToInput(pa, plan.segmentId, plan.goal, { offerId: plan.offerId, messagingModelId: plan.messagingModelId }), model, { campaignId: plan.id })
      next = r.ws
      done.set(pa.id, r.asset.id)
      if (pa.consequential) next = approvalFor(next, r.asset, `Campaign “${plan.goal}”: ${pa.purpose}.`)
    }
    i += 1
  }
  onProgress?.(ordered.length, ordered.length, 'Done')
  next = {
    ...next,
    plans: next.plans.map((p) =>
      p.id === planId
        ? { ...p, status: 'ready_for_approval', workstreams: p.workstreams.map((w) => ({ ...w, assets: w.assets.map((a) => (done.has(a.id) ? { ...a, assetId: done.get(a.id), status: 'generated' as const } : a)) })) }
        : p,
    ),
  }
  return log(next, 'plan_generated', `Generated ${done.size} assets for “${plan.goal}”; consequential ones await approval.`, { type: 'plan', id: planId })
}

/** Rebuild the customer language index, using the model's tagger when available. */
export async function reindexLanguage(ws: Workspace, model: CopyModel = local): Promise<{ ws: Workspace; note: string }> {
  if (model.tagSources) {
    try {
      const tagged = await model.tagSources(ws.sources, ws.brand.competitors)
      return { ws: { ...ws, language: buildIndex(tagged, ws.sources, ws.now) }, note: `Re-indexed ${ws.sources.length} sources with ${model.label}.` }
    } catch (err) {
      const language = indexSources(ws.sources, ws.brand.competitors, ws.now)
      return { ws: { ...ws, language }, note: `${model.label} tagging failed (${(err as Error).message}); used the built-in tagger.` }
    }
  }
  return { ws: { ...ws, language: indexSources(ws.sources, ws.brand.competitors, ws.now) }, note: `Re-indexed ${ws.sources.length} sources with the built-in tagger.` }
}

/** Re-run the critic(s) on a version. Critique is metadata, so this updates in place. */
export async function recritique(ws: Workspace, assetId: ID, versionId: ID, model: CopyModel = local): Promise<Workspace> {
  const asset = ws.assets.find((a) => a.id === assetId)
  const v = asset?.versions.find((x) => x.id === versionId)
  if (!asset || !v) return ws
  const rules = rulesCritic({ content: v.content, brief: v.brief, brand: ws.brand, assetType: asset.type })
  let llm
  try {
    llm = model.critique ? await model.critique({ assetType: asset.type, content: v.content, brief: v.brief, brand: ws.brand }) : undefined
  } catch {
    llm = undefined
  }
  const critique = combineCritiques(rules, llm, ws.now)
  return log(upsertAsset(ws, { ...asset, versions: asset.versions.map((x) => (x.id === versionId ? { ...x, critique } : x)) }), 'critique', `Critiqued ${v.label} of “${asset.name}”: ${critique.overall} (${critique.verdict}).`, { type: 'asset', id: asset.id })
}
