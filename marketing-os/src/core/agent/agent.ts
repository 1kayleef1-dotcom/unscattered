/**
 * The autonomous marketing operator.
 *
 * Every morning (or on demand):
 *   1. Inspect performance        7. Create recommendations
 *   2. Detect anomalies           8. Prepare assets
 *   3. Find opportunities         9. Request approvals
 *   4. Review active experiments 10. Execute approved work
 *   5. Research relevant changes 11. Measure outcomes
 *   6. Identify problems         12. Update memory
 *
 * The agent prepares and proposes freely; anything consequential
 * (publishing, launching, sending, starting experiments) waits for a human
 * approval. Every run is logged step by step.
 */
import { prepareProblemAssets, reindexLanguage } from '../actions.ts'
import type { CopyModel } from '../copy/model.ts'
import { LocalCopyModel } from '../copy/model.ts'
import { currentVersion } from '../copy/pipeline.ts'
import type { Connector } from '../execution/connectors.ts'
import { evaluateExperiment, readyToConclude } from '../experiments/experiments.ts'
import { valueLabel } from '../learning/learning.ts'
import { METRIC_LABELS, formatMetric, primaryRateFor, summarize } from '../performance/metrics.ts'
import { simulateDay } from '../performance/simulate.ts'
import { concludeExperiment, execute, log, refreshLearnings } from '../ops.ts'
import { detectAnomalies, openProblem } from '../solver/solver.ts'
import type { AgentRun, AgentStep, Recommendation, Workspace } from '../types.ts'
import { addDays, inWindow, toDay } from '../util/dates.ts'
import { newId } from '../util/id.ts'
import { signedPct } from '../util/stats.ts'
import { AD_ANGLE_LABELS } from '../strategy/ads.ts'

export interface AgentOptions {
  model?: CopyModel
  connectors?: Connector[]
  /** Generate assets for the top new problem (default true). */
  prepare?: boolean
}

/** Pull performance up to yesterday from the demo connector. */
export function measure(ws: Workspace): { ws: Workspace; added: number } {
  if (!ws.simulation?.enabled) return { ws, added: 0 }
  const target = toDay(addDays(ws.now, -1))
  let day = addDays(`${toDay(ws.simulation.lastDay)}T12:00:00.000Z`, 1)
  const added = []
  while (toDay(day) <= target) {
    added.push(...simulateDay({ ...ws, performance: [] }, ws.simulation.world, day))
    day = addDays(day, 1)
  }
  const ids = new Set(ws.performance.map((r) => r.id))
  const fresh = added.filter((r) => !ids.has(r.id))
  return { ws: { ...ws, performance: [...ws.performance, ...fresh], simulation: { ...ws.simulation, lastDay: `${target}T12:00:00.000Z` } }, added: fresh.length }
}

function findOpportunities(ws: Workspace): Recommendation[] {
  const recs: Recommendation[] = []
  const open = new Set(ws.recommendations.filter((r) => r.status === 'open').map((r) => r.title))
  const add = (r: Omit<Recommendation, 'id' | 'createdAt' | 'status'>) => {
    if (!open.has(r.title)) recs.push({ ...r, id: newId('rec'), createdAt: ws.now, status: 'open' })
  }
  // Strong learned angles not used by a live ad in that segment.
  for (const l of ws.learnings.filter((x) => x.dimension === 'angle' && x.direction === 'strong' && x.confidence !== 'low')) {
    const live = ws.assets.filter((a) => a.segmentId === l.segmentId && a.type === 'ad_set' && a.publishedVersionId)
    const used = live.some((a) => a.versions.find((v) => v.id === a.publishedVersionId)?.content.sections.some((s) => s.meta?.angle === l.value))
    if (!used && live.length) {
      const seg = ws.brand.segments.find((s) => s.id === l.segmentId)?.name
      add({ kind: 'add_angle', title: `Add a ${AD_ANGLE_LABELS[l.value as keyof typeof AD_ANGLE_LABELS] ?? l.value} ad for ${seg}`, detail: `${l.statement} No live ad for ${seg} uses it.`, ref: { assetId: live[0].id, segmentId: l.segmentId } })
    }
  }
  // Proof that no asset uses yet.
  const used = new Set(ws.assets.flatMap((a) => a.versions.flatMap((v) => v.content.sections.flatMap((s) => s.blocks.flatMap((b) => (b.evidence ?? []).filter((e) => e.kind === 'proof').map((e) => e.id))))))
  for (const p of ws.brand.proof.filter((p) => (p.kind === 'case_study' || p.kind === 'testimonial') && !used.has(p.id)).slice(0, 2)) {
    add({ kind: 'repurpose', title: `Repurpose “${p.title}”`, detail: 'Strong proof that no live asset uses yet. Turn it into a page section, email, posts, a video script, ad concepts and a sales asset.', ref: { proofId: p.id, segmentId: p.segmentIds[0] } })
  }
  // Stale assets after a messaging change.
  for (const m of ws.messaging) {
    const stale = ws.assets.filter((a) => a.stale && currentVersion(a).chain.messagingModelId === m.id)
    if (stale.length) add({ kind: 'propagate', title: `Update ${stale.length} asset(s) to messaging v${m.version}`, detail: `“${m.name}” changed; ${stale.map((a) => a.name).join(', ')} still say the old thing.`, ref: { messagingModelId: m.id } })
  }
  // Rising product requests.
  for (const i of ws.language.insights.filter((i) => i.kind === 'product_request' && i.frequency >= 2)) {
    add({ kind: 'product_feedback', title: `Customers keep asking about ${i.theme.toLowerCase()}`, detail: `${i.frequency} requests: “${i.quotes[0]?.text}”. Share with product; answer it in content if it already exists.`, ref: {} })
  }
  // Segments with thin proof.
  for (const s of ws.brand.segments) {
    if (!ws.brand.proof.some((p) => p.segmentIds.includes(s.id) && (p.kind === 'case_study' || p.kind === 'testimonial'))) {
      add({ kind: 'collect_proof', title: `Collect proof for ${s.name}`, detail: 'No case study or testimonial for this segment; copy for it has to avoid specific claims.', ref: { segmentId: s.id } })
    }
  }
  return recs
}

export async function runAgent(wsIn: Workspace, opts: AgentOptions = {}): Promise<{ ws: Workspace; run: AgentRun }> {
  const model = opts.model ?? new LocalCopyModel()
  const steps: AgentStep[] = []
  const step = (name: string, status: AgentStep['status'], summary: string, items: string[] = []) => steps.push({ n: steps.length + 1, name, status, summary, items })
  const startedAt = wsIn.now
  let ws = wsIn

  // 11 happens first in practice: pull yesterday's numbers before judging them.
  const m = measure(ws)
  ws = m.ws

  // 1. Inspect performance
  const byChannel = Array.from(new Set(ws.performance.map((r) => r.channel))).map((ch) => {
    const metric = primaryRateFor(ch)
    const recent = summarize(ws.performance.filter((r) => r.channel === ch && inWindow(r.date, ws.now, 7)), metric)
    const prior = summarize(ws.performance.filter((r) => r.channel === ch && inWindow(r.date, ws.now, 14, 7)), metric)
    const change = recent.value && prior.value ? recent.value / prior.value - 1 : 0
    return `${ch}: ${METRIC_LABELS[metric]} ${formatMetric(metric, recent.value)} (${signedPct(change)} w/w)`
  })
  step('Inspect performance', 'ok', `Reviewed ${ws.performance.filter((r) => inWindow(r.date, ws.now, 7)).length} performance records from the last 7 days.`, byChannel)

  // 2. Detect anomalies
  const anomalies = detectAnomalies(ws)
  step('Detect anomalies', anomalies.some((a) => a.direction === 'drop') ? 'attention' : 'ok', anomalies.length ? `${anomalies.length} anomaly(ies) detected.` : 'No anomalies.', anomalies.map((a) => `${a.direction === 'spike' ? '▲' : '▼'} ${a.scopeLabel}: ${METRIC_LABELS[a.metric]} ${formatMetric(a.metric, a.baseline)} → ${formatMetric(a.metric, a.current)} (${signedPct(a.change)}, z=${a.zScore.toFixed(1)})`))

  // 3. Find opportunities
  const opportunities = findOpportunities(ws)
  ws = { ...ws, recommendations: [...opportunities, ...ws.recommendations] }
  step('Find opportunities', opportunities.length ? 'attention' : 'ok', `${opportunities.length} new opportunity(ies).`, opportunities.map((o) => o.title))

  // 4. Review active experiments
  const expItems: string[] = []
  for (const exp of ws.experiments.filter((e) => e.status === 'running')) {
    const result = evaluateExperiment(ws, exp)
    if (readyToConclude(exp, result, ws.now)) {
      ws = concludeExperiment(ws, exp.id)
      expItems.push(`Concluded “${exp.name}”: ${result.summary}`)
    } else {
      ws = { ...ws, experiments: ws.experiments.map((e) => (e.id === exp.id ? { ...e, result } : e)) }
      expItems.push(`“${exp.name}”: ${result.summary}`)
    }
  }
  step('Review active experiments', 'ok', expItems.length ? `${expItems.length} experiment(s) reviewed.` : 'No running experiments.', expItems)

  // 5. Research relevant changes
  const re = await reindexLanguage(ws, model)
  ws = re.ws
  const rising = ws.language.insights.filter((i) => i.trend >= 2 && i.frequency >= 3 && ['objection', 'reason_rejected', 'pain'].includes(i.kind)).slice(0, 4)
  step('Research relevant changes', rising.length ? 'attention' : 'ok', `${re.note} ${rising.length} rising theme(s).`, rising.map((i) => `${i.theme} (${i.kind.replace('_', ' ')}): ${i.frequency} mentions, ×${i.trend.toFixed(1)} vs. prior 30 days`))

  // 6. Identify problems — drops only, and not ones our own experiments or releases explain.
  const explained = (assetId?: string) =>
    ws.experiments.some((e) => e.variants.some((v) => v.assetId === assetId) && (e.status === 'running' || (e.endedAt && inWindow(e.endedAt, ws.now, 10)))) ||
    ws.assets.some((a) => a.id === assetId && a.versions.some((v) => v.publishedAt && inWindow(v.publishedAt, ws.now, 9)))
  const newProblems = anomalies
    .filter((a) => a.direction === 'drop' && !explained(a.scope.assetId))
    .filter((a) => !ws.problems.some((p) => p.anomaly?.scope.assetId === a.scope.assetId && p.anomaly?.metric === a.metric && !['resolved', 'dismissed'].includes(p.status)))
    .map((a) => openProblem(ws, a))
  ws = { ...ws, problems: [...newProblems, ...ws.problems] }
  step('Identify problems', newProblems.length ? 'attention' : 'ok', newProblems.length ? `${newProblems.length} new problem(s) opened and investigated.` : 'No new problems.', newProblems.map((p) => `${p.title} → ${p.hypotheses[0]?.statement ?? 'no hypothesis'}`))

  // 7. Create recommendations
  const recItems = newProblems.filter((p) => p.solution).map((p) => `${p.solution!.summary} ${p.solution!.positioningShift}`)
  step('Create recommendations', 'ok', `${recItems.length + opportunities.length} recommendation(s).`, recItems)

  // 8. Prepare assets (top new problem, to keep human review manageable)
  const toPrepare = opts.prepare === false ? [] : newProblems.filter((p) => p.solution).slice(0, 1)
  for (const p of toPrepare) ws = await prepareProblemAssets(ws, p.id, model)
  step('Prepare assets', toPrepare.length ? 'attention' : 'skipped', toPrepare.length ? `Prepared assets for “${toPrepare[0].title}”.` : 'Nothing to prepare.', toPrepare.flatMap((p) => ws.problems.find((x) => x.id === p.id)?.solution?.assets.map((a) => `${a.type.replace('_', ' ')}: ${a.purpose}`) ?? []))

  // 9. Request approvals
  const pending = ws.approvals.filter((a) => a.status === 'pending')
  step('Request approvals', pending.length ? 'attention' : 'ok', `${pending.length} item(s) awaiting approval.`, pending.map((a) => a.title))

  // 10. Execute approved work
  const approved = ws.approvals.filter((a) => a.status === 'approved')
  for (const a of approved) ws = await execute(ws, a.id, opts.connectors)
  step('Execute approved work', 'ok', approved.length ? `Executed ${approved.length} approved item(s).` : 'Nothing approved to execute.', approved.map((a) => a.title))

  // 11. Measure outcomes
  step('Measure outcomes', 'ok', ws.simulation?.enabled ? `Pulled ${m.added} new record(s) from the demo connector.` : 'Connect data sources to pull live performance.', [])

  // 12. Update memory
  const before = new Set(ws.learnings.filter((l) => l.direction !== 'neutral' && l.confidence !== 'low').map((l) => `${l.id}:${l.direction}`))
  ws = refreshLearnings(ws)
  const changed = ws.learnings.filter((l) => l.direction !== 'neutral' && l.confidence !== 'low' && !before.has(`${l.id}:${l.direction}`))
  step('Update memory', 'ok', `${ws.learnings.filter((l) => l.direction !== 'neutral' && l.confidence !== 'low').length} active learnings; ${changed.length} new or changed.`, changed.slice(0, 6).map((l) => `${l.statement} [${valueLabel(l.dimension, l.value)}]`))

  const headline = newProblems.length
    ? `${newProblems[0].title}. Leading hypothesis: ${newProblems[0].hypotheses[0]?.statement ?? '—'} Assets prepared; ${pending.length} approval(s) waiting.`
    : pending.length
      ? `${pending.length} item(s) waiting for your approval.`
      : 'All quiet. Nothing needs you today.'
  const run: AgentRun = { id: newId('run'), startedAt, finishedAt: ws.now, steps, headline }
  ws = log({ ...ws, agentRuns: [run, ...ws.agentRuns].slice(0, 30) }, 'agent', `Agent run: ${headline}`)
  return { ws, run }
}

/** Demo only: move the clock forward, measuring and reviewing experiments each day, then run the agent once. */
export async function advanceDays(wsIn: Workspace, days: number, opts: AgentOptions = {}): Promise<{ ws: Workspace; run: AgentRun }> {
  let ws = wsIn
  for (let i = 0; i < days - 1; i += 1) {
    ws = { ...ws, now: addDays(ws.now, 1) }
    ws = measure(ws).ws
    for (const exp of ws.experiments.filter((e) => e.status === 'running')) {
      const result = evaluateExperiment(ws, exp)
      ws = readyToConclude(exp, result, ws.now) ? concludeExperiment(ws, exp.id) : { ...ws, experiments: ws.experiments.map((e) => (e.id === exp.id ? { ...e, result } : e)) }
    }
  }
  ws = { ...ws, now: addDays(ws.now, 1) }
  return runAgent(ws, opts)
}
