/**
 * Marketing Problem Solver — the layer that connects everything.
 *
 *   PROBLEM (anomaly or opportunity)
 *     → INVESTIGATE (traffic mix, audience/device/source breakdowns, version
 *       changes, customer research, competitor signals, prior learnings)
 *     → HYPOTHESES (ranked, each with its mechanism, evidence and test metric)
 *     → SOLUTION (positioning shift + the assets to create + experiment design)
 *     → EXECUTION (assets generated through the normal pipeline, approvals)
 *     → EXPERIMENT → RESULT → LEARNING → MEMORY
 *
 * Every step is stored on the `Problem`, so the reasoning can be audited.
 */
import { THEME_VOCAB } from '../brief/brief.ts'
import { coOccurrence, insightsFor, bestQuote } from '../language/customerLanguage.ts'
import { METRIC_LABELS, primaryRateFor, rateParts, sumMetrics } from '../performance/metrics.ts'
import type {
  Anomaly,
  Asset,
  EvidenceRef,
  Hypothesis,
  ID,
  InvestigationStep,
  MetricKey,
  PerformanceRecord,
  PlannedAsset,
  Problem,
  Workspace,
} from '../types.ts'
import { inWindow } from '../util/dates.ts'
import { newId } from '../util/id.ts'
import { mean, pct, signedPct, stdev } from '../util/stats.ts'
import { clause } from '../util/text.ts'

const RECENT = 7
const BASELINE = 28

function rate(records: PerformanceRecord[], metric: MetricKey) {
  const parts = rateParts(sumMetrics(records), metric) ?? { successes: 0, trials: 0 }
  return { ...parts, rate: parts.trials ? parts.successes / parts.trials : 0 }
}

function windows(records: PerformanceRecord[], now: string) {
  return {
    recent: records.filter((r) => inWindow(r.date, now, RECENT)),
    baseline: records.filter((r) => inWindow(r.date, now, RECENT + BASELINE, RECENT)),
  }
}

function assetLabel(ws: Workspace, asset: Asset): string {
  const seg = ws.brand.segments.find((s) => s.id === asset.segmentId)?.name ?? asset.segmentId
  return `${asset.name} (${seg})`
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/** Per-day rates, so variance reflects real day-to-day swings rather than an idealised binomial. */
function dailyRates(records: PerformanceRecord[], metric: MetricKey): number[] {
  const days = new Map<string, PerformanceRecord[]>()
  for (const r of records) days.set(r.date.slice(0, 10), [...(days.get(r.date.slice(0, 10)) ?? []), r])
  return [...days.values()].map((rs) => rate(rs, metric)).filter((x) => x.trials > 0).map((x) => x.rate)
}

/**
 * Flags a metric whose last 7 days differ from the prior 28, using daily
 * rates (robust to overdispersion) and requiring the shift to be both
 * statistically clear and large enough to matter, and consistent across
 * most recent days — the agent runs this daily across every asset, so a
 * loose test would cry wolf.
 */
export function detectAnomalies(ws: Workspace): Anomaly[] {
  const out: Anomaly[] = []
  for (const asset of ws.assets) {
    const metric = primaryRateFor(asset.channel)
    const recs = ws.performance.filter((r) => r.assetId === asset.id)
    if (recs.length === 0) continue
    const { recent, baseline } = windows(recs, ws.now)
    const r = rate(recent, metric)
    const b = rate(baseline, metric)
    if (b.trials < 500 || r.trials < 200 || b.rate === 0) continue
    const rd = dailyRates(recent, metric)
    const bd = dailyRates(baseline, metric)
    if (rd.length < 4 || bd.length < 10) continue
    const sd = stdev(bd)
    const z = sd ? (mean(rd) - mean(bd)) / (sd * Math.sqrt(1 / rd.length + 1 / bd.length)) : 0
    const change = r.rate / b.rate - 1
    const consistent = rd.filter((x) => (change < 0 ? x < mean(bd) : x > mean(bd))).length / rd.length
    if (Math.abs(z) < 3 || Math.abs(change) < 0.1 || consistent < 0.7) continue
    out.push({
      id: newId('anm'),
      metric,
      scope: { assetId: asset.id, channel: asset.channel, segmentId: asset.segmentId },
      scopeLabel: assetLabel(ws, asset),
      baseline: b.rate,
      current: r.rate,
      change,
      zScore: z,
      direction: change < 0 ? 'drop' : 'spike',
      severity: Math.abs(change) > 0.2 ? 'high' : Math.abs(change) > 0.12 ? 'medium' : 'low',
      detectedAt: ws.now,
      window: { baselineDays: BASELINE, recentDays: RECENT },
    })
  }
  return out.sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
}

// ---------------------------------------------------------------------------
// Investigation
// ---------------------------------------------------------------------------

function mixShift(recent: PerformanceRecord[], baseline: PerformanceRecord[], key: 'source' | 'device', weight: (r: PerformanceRecord) => number) {
  const share = (rs: PerformanceRecord[]) => {
    const total = rs.reduce((s, r) => s + weight(r), 0) || 1
    const m = new Map<string, number>()
    for (const r of rs) m.set(String(r[key] ?? 'unknown'), (m.get(String(r[key] ?? 'unknown')) ?? 0) + weight(r) / total)
    return m
  }
  const a = share(baseline)
  const b = share(recent)
  const keys = new Set([...a.keys(), ...b.keys()])
  let tvd = 0
  const data: Record<string, string> = {}
  for (const k of keys) {
    tvd += Math.abs((a.get(k) ?? 0) - (b.get(k) ?? 0)) / 2
    data[k] = `${pct(a.get(k) ?? 0, 0)} → ${pct(b.get(k) ?? 0, 0)}`
  }
  return { tvd, data }
}

function breakdown(recent: PerformanceRecord[], baseline: PerformanceRecord[], key: 'source' | 'device', metric: MetricKey) {
  const values = Array.from(new Set([...recent, ...baseline].map((r) => String(r[key] ?? 'unknown'))))
  return values
    .map((v) => {
      const r = rate(recent.filter((x) => String(x[key]) === v), metric)
      const b = rate(baseline.filter((x) => String(x[key]) === v), metric)
      return { value: v, baseline: b.rate, recent: r.rate, change: b.rate ? r.rate / b.rate - 1 : 0, n: r.trials }
    })
    .sort((a, b) => a.change - b.change)
}

export function investigate(ws: Workspace, anomaly: Anomaly): InvestigationStep[] {
  const steps: InvestigationStep[] = []
  const asset = ws.assets.find((a) => a.id === anomaly.scope.assetId)
  const recs = ws.performance.filter((r) => (asset ? r.assetId === asset.id : r.channel === anomaly.scope.channel && r.segmentId === anomaly.scope.segmentId))
  const { recent, baseline } = windows(recs, ws.now)
  const metric = anomaly.metric
  const trials = (r: PerformanceRecord) => rateParts(r.metrics, metric)?.trials ?? 0

  // 1. Traffic mix
  if (recs.some((r) => r.source)) {
    const s = mixShift(recent, baseline, 'source', trials)
    steps.push({ kind: 'traffic_mix', question: 'Did the traffic source mix change?', finding: s.tvd > 0.08 ? `Traffic mix shifted (${pct(s.tvd, 0)} of traffic moved between sources).` : `Traffic source mix unchanged (${pct(s.tvd, 0)} shift).`, implicates: s.tvd > 0.08, data: s.data, evidence: [] })
  }
  // 2. Audience mix
  const segs = mixShift(
    ws.performance.filter((r) => r.channel === anomaly.scope.channel && inWindow(r.date, ws.now, RECENT)),
    ws.performance.filter((r) => r.channel === anomaly.scope.channel && inWindow(r.date, ws.now, RECENT + BASELINE, RECENT)),
    'device',
    trials,
  )
  steps.push({ kind: 'audience_mix', question: 'Did the audience or device mix change?', finding: segs.tvd > 0.08 ? `Device mix shifted (${pct(segs.tvd, 0)}).` : `Audience and device mix unchanged (${pct(segs.tvd, 0)} shift).`, implicates: segs.tvd > 0.08, data: segs.data, evidence: [] })
  // 3. Device breakdown
  let mobileSkew = false
  if (recs.some((r) => r.device)) {
    const d = breakdown(recent, baseline, 'device', metric)
    const worst = d[0]
    const best = d[d.length - 1]
    mobileSkew = Boolean(worst && best && worst.value === 'mobile' && worst.change < best.change * 1.8 && worst.change < -0.15)
    steps.push({
      kind: 'device_breakdown',
      question: 'Is the change concentrated on one device?',
      finding: d.map((x) => `${x.value}: ${pct(x.baseline)} → ${pct(x.recent)} (${signedPct(x.change)})`).join('; ') + (mobileSkew ? ' — mobile dropped disproportionately.' : '.'),
      implicates: mobileSkew,
      data: Object.fromEntries(d.map((x) => [x.value, signedPct(x.change)])),
      evidence: [],
    })
  }
  // 4. Source breakdown: which source accounts for most of the lost conversions?
  if (recs.some((r) => r.source)) {
    const d = breakdown(recent, baseline, 'source', metric)
    const lost = d.map((x) => ({ ...x, lost: Math.max(0, (x.baseline - x.recent) * x.n) }))
    const totalLost = lost.reduce((s, x) => s + x.lost, 0) || 1
    const top = [...lost].sort((a, b) => b.lost - a.lost)[0]
    const concentrated = Boolean(top && top.lost / totalLost > 0.6)
    steps.push({
      kind: 'source_breakdown',
      question: 'Is it one traffic source?',
      finding: `${d.map((x) => `${x.value.replace('_', ' ')} ${signedPct(x.change)}`).join(', ')}${concentrated ? ` — ${pct(top.lost / totalLost, 0)} of the lost conversions come from ${top.value.replace('_', ' ')}.` : ' — the drop is spread across sources, not one channel.'}`,
      implicates: concentrated,
      data: Object.fromEntries(d.map((x) => [x.value, signedPct(x.change)])),
      evidence: [],
    })
  }
  // 5. Version change
  if (asset) {
    const changed = asset.versions.filter((v) => v.publishedAt && inWindow(v.publishedAt, ws.now, RECENT + 2))
    steps.push({ kind: 'version_change', question: 'Did we change the asset recently?', finding: changed.length ? `${changed.map((v) => v.label).join(', ')} published in the last ${RECENT + 2} days.` : 'No new version published in the window — the copy did not change; the audience’s response to it did.', implicates: changed.length > 0, evidence: [] })
  }
  // 6. Customer research
  const seg = anomaly.scope.segmentId
  const rising = insightsFor(ws.language, { kinds: ['objection', 'reason_rejected'], segmentId: seg })
    .filter((i) => i.trend >= 1.5 && i.quotes.some((q) => inWindow(q.date, ws.now, 30)))
    .slice(0, 3)
  if (rising.length) {
    const top = rising[0]
    const link = rising.find((r) => r !== top && coOccurrence(ws.language, top.theme, r.theme) > 0.4)
    const quote = bestQuote(top)
    const mobileQuote = ws.language.insights.flatMap((i) => i.quotes).find((q) => /phone|mobile/i.test(q.text) && /pric|payback|expensive|cost/i.test(q.text))
    steps.push({
      kind: 'customer_research',
      question: 'What are customers and prospects saying right now?',
      finding:
        `“${top.theme}” is rising: ${top.frequency} mentions, ×${top.trend.toFixed(1)} vs. the prior 30 days${quote ? ` (“${clause(quote.text)}”)` : ''}.` +
        (link ? ` It co-occurs with “${link.theme}” in ${pct(coOccurrence(ws.language, top.theme, link.theme), 0)} of conversations — “too expensive” is mostly uncertainty about ROI.` : '') +
        (mobileQuote && mobileSkew ? ` A mobile visitor said: “${clause(mobileQuote.text)}.”` : ''),
      implicates: true,
      evidence: [...rising.map((i) => ({ kind: 'insight' as const, id: i.id, note: i.summary })), ...(mobileQuote ? [{ kind: 'source' as const, id: mobileQuote.sourceId, note: clause(mobileQuote.text) }] : [])],
    })
  } else {
    steps.push({ kind: 'customer_research', question: 'What are customers and prospects saying right now?', finding: 'No objection is rising in recent conversations.', implicates: false, evidence: [] })
  }
  // 7. Competitor signal
  const compRecent = ws.language.insights.filter((i) => i.kind === 'competitor_mention').map((i) => ({ name: i.theme, recent: i.quotes.filter((q) => inWindow(q.date, ws.now, 30)).length, prior: i.quotes.filter((q) => inWindow(q.date, ws.now, 60, 30)).length }))
  const surging = compRecent.filter((c) => c.recent >= 2 && c.recent > c.prior * 1.5)
  steps.push({ kind: 'competitor_signal', question: 'Are competitors showing up more?', finding: surging.length ? `${surging.map((c) => `${c.name} (${c.prior} → ${c.recent})`).join(', ')} mentioned more often.` : `No competitor surge (${compRecent.map((c) => `${c.name} ${c.prior}→${c.recent}`).join(', ') || 'no mentions'}).`, implicates: surging.length > 0, evidence: [] })
  // 8. Learnings
  const themeLearning = ws.learnings.find((l) => l.segmentId === seg && l.dimension === 'theme' && /roi/i.test(l.value) && l.direction === 'strong')
  const strat = ws.learnings.filter((l) => l.segmentId === seg && l.dimension === 'strategy' && l.direction === 'strong').slice(0, 1)
  steps.push({ kind: 'learning_check', question: 'What have we already learned about this segment?', finding: [themeLearning?.statement, ...strat.map((l) => l.statement)].filter(Boolean).join(' ') || 'No prior learnings for this segment.', implicates: Boolean(themeLearning || strat.length), evidence: [...(themeLearning ? [themeLearning] : []), ...strat].map((l) => ({ kind: 'learning' as const, id: l.id, note: l.statement })) })
  return steps
}

// ---------------------------------------------------------------------------
// Hypotheses & solution
// ---------------------------------------------------------------------------

export function hypothesize(ws: Workspace, anomaly: Anomaly, steps: InvestigationStep[]): Hypothesis[] {
  const hs: Hypothesis[] = []
  const get = (k: InvestigationStep['kind']) => steps.find((s) => s.kind === k)
  const research = get('customer_research')
  const device = get('device_breakdown')
  const version = get('version_change')
  const traffic = get('traffic_mix')
  const competitor = get('competitor_signal')
  const seg = anomaly.scope.segmentId!
  const rising = insightsFor(ws.language, { kinds: ['objection', 'reason_rejected'], segmentId: seg }).filter((i) => i.trend >= 1.5)
  const economic = rising.find((i) => /roi|price/i.test(i.theme))

  if (research?.implicates && economic) {
    const theme = rising.find((i) => /roi/i.test(i.theme))?.theme ?? economic.theme
    hs.push({
      id: newId('hyp'),
      statement: 'Visitors don’t understand the economic value.',
      mechanism: `Price sensitivity rose, and the page answers “what does it do” but not “will it pay for itself”. Prospects read the price as risk because the ROI is invisible — especially on mobile, where the proof sits far below the fold.`,
      confidence: Math.min(0.9, 0.55 + (device?.implicates ? 0.15 : 0) + (traffic?.implicates ? -0.15 : 0.05) + (version?.implicates ? -0.1 : 0.05)),
      support: [research.finding, ...(device?.implicates ? [device.finding] : []), ...(traffic && !traffic.implicates ? [traffic.finding] : []), ...(version && !version.implicates ? [version.finding] : [])],
      evidence: research.evidence,
      recommendedStrategy: 'proof_led',
      recommendedAngles: ['objection', 'proof', 'specificity'],
      focusTheme: theme,
      testMetric: 'qualified_cvr',
    })
  }
  if (device?.implicates) {
    hs.push({
      id: newId('hyp'),
      statement: 'The mobile experience hides what buyers need to decide.',
      mechanism: 'The drop is concentrated on mobile. If key decision information (price context, proof) is below the fold on small screens, mobile visitors leave before they see it.',
      confidence: economic ? 0.45 : 0.6,
      support: [device.finding],
      evidence: [],
      recommendedStrategy: 'proof_led',
      testMetric: 'qualified_cvr',
    })
  }
  if (version?.implicates) {
    hs.push({ id: newId('hyp'), statement: 'The latest version underperforms the previous one.', mechanism: 'A version was published inside the window; the change coincides with the drop.', confidence: 0.6, support: [version.finding], evidence: [], testMetric: anomaly.metric })
  }
  if (traffic?.implicates) {
    hs.push({ id: newId('hyp'), statement: 'Traffic quality changed.', mechanism: 'More visitors arrived from lower-intent sources, diluting the conversion rate without the page getting worse.', confidence: 0.55, support: [traffic.finding], evidence: [], testMetric: anomaly.metric })
  }
  if (competitor?.implicates) {
    hs.push({ id: newId('hyp'), statement: 'A competitor is pulling prospects away.', mechanism: 'Competitor mentions are rising in conversations; prospects are comparing and choosing elsewhere.', confidence: 0.4, support: [competitor.finding], evidence: [], recommendedStrategy: 'comparison_led', recommendedAngles: ['comparison'], testMetric: 'qualified_cvr' })
  }
  if (hs.length === 0) {
    hs.push({ id: newId('hyp'), statement: 'Cause unclear — collect more evidence.', mechanism: 'No investigated factor implicates a cause. Run a qualitative check (session recordings, 5 prospect calls) before changing copy.', confidence: 0.2, support: [], evidence: [], testMetric: anomaly.metric })
  }
  return hs.sort((a, b) => b.confidence - a.confidence)
}

export function proposeSolution(ws: Workspace, problem: Problem, hypothesis: Hypothesis): NonNullable<Problem['solution']> {
  const seg = ws.brand.segments.find((s) => s.id === problem.segmentId)
  const theme = hypothesis.focusTheme
  const pillar = theme ? ws.brand.pillars.find((p) => THEME_VOCAB[theme] && THEME_VOCAB[theme].split(' ').some((w) => p.statement.toLowerCase().includes(w) && w.length > 3)) : undefined
  const assetId = problem.anomaly?.scope.assetId
  const channel = problem.anomaly?.scope.channel ?? 'web'
  const assets: PlannedAsset[] = []
  const pa = (x: Omit<PlannedAsset, 'id' | 'status' | 'dependsOn'> & { dependsOn?: ID[] }): PlannedAsset => ({ id: newId('pa'), status: 'planned', dependsOn: [], ...x })
  const lp = pa({ type: 'landing_page', channel: 'web', purpose: `New ${theme ? `${theme}-led` : ''} version of the page as the challenger (tested against the current version)`, strategy: hypothesis.recommendedStrategy, consequential: true })
  if (channel === 'web') assets.push(lp)
  assets.push(
    pa({ type: 'ad_set', channel: 'linkedin', purpose: `Ad angles that answer “${theme ?? hypothesis.statement}” before the click`, angles: hypothesis.recommendedAngles, consequential: true, dependsOn: [lp.id] }),
    pa({ type: 'email_sequence', channel: 'email', purpose: `Nurture sequence built around ${theme ?? 'the hypothesis'} for leads who hesitated`, sequenceKind: 'lead_nurture', consequential: true }),
    pa({ type: 'creative_concept', channel: 'meta', purpose: 'Retargeting creative for visitors who left without converting', angles: ['objection', 'proof'], consequential: true, dependsOn: [lp.id] }),
  )
  const current = assetId ? ws.assets.find((a) => a.id === assetId) : undefined
  const pubLabel = current?.versions.find((v) => v.id === current.publishedVersionId)?.label ?? 'current'
  return {
    summary: `${hypothesis.statement} Reposition the ${seg?.name ?? 'segment'} journey around ${theme ? `“${theme}”` : 'the hypothesis'} and test it.`,
    positioningShift: theme
      ? `Lead with economic value: ${pillar ? `“${pillar.name}” — ${pillar.statement}` : 'make payback explicit'} Keep the core differentiator as supporting proof.`
      : 'Address the hypothesis directly in the first screen.',
    assets,
    experimentDesign: `50/50 split on ${current ? `“${current.name}”` : 'the page'}: ${pubLabel} (control) vs. the new version (challenger). Primary metric: ${METRIC_LABELS[hypothesis.testMetric]}. Stop at the planned sample size or earlier on a significant result.`,
  }
}

/** Build a full problem record from an anomaly: investigate, hypothesize, propose. */
export function openProblem(ws: Workspace, anomaly: Anomaly): Problem {
  const steps = investigate(ws, anomaly)
  const hypotheses = hypothesize(ws, anomaly, steps)
  const problem: Problem = {
    id: newId('prb'),
    title: `${METRIC_LABELS[anomaly.metric]} ${anomaly.direction === 'drop' ? 'dropped' : 'rose'} ${pct(Math.abs(anomaly.change), 0)} on ${anomaly.scopeLabel}`,
    kind: 'anomaly',
    status: 'solution_proposed',
    segmentId: anomaly.scope.segmentId ?? ws.brand.segments[0].id,
    anomaly,
    investigation: steps,
    hypotheses,
    selectedHypothesisId: hypotheses[0]?.id,
    learningIds: [],
    timeline: [
      { at: ws.now, event: `Detected: ${METRIC_LABELS[anomaly.metric]} ${pct(anomaly.baseline)} → ${pct(anomaly.current)} (z=${anomaly.zScore.toFixed(1)}).` },
      { at: ws.now, event: `Investigated ${steps.length} factors; ${steps.filter((s) => s.implicates).length} implicated.` },
      { at: ws.now, event: `Leading hypothesis: ${hypotheses[0]?.statement} (${Math.round((hypotheses[0]?.confidence ?? 0) * 100)}% confidence).` },
    ],
    createdAt: ws.now,
  }
  if (hypotheses[0]) {
    problem.solution = proposeSolution(ws, problem, hypotheses[0])
    problem.timeline.push({ at: ws.now, event: `Solution proposed: ${problem.solution.assets.length} assets + experiment.` })
  }
  return problem
}

export function evidenceSummary(e: EvidenceRef[]): string {
  return e.map((x) => x.note).join(' · ')
}
