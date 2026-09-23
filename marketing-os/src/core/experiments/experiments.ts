/**
 * Experimentation: design, evaluate, conclude, remember.
 */
import { LOWER_IS_BETTER, METRIC_LABELS, rateParts, sumMetrics } from '../performance/metrics.ts'
import type { Channel, Experiment, ExperimentResult, ID, MetricKey, VariantStats, Workspace } from '../types.ts'
import { newId } from '../util/id.ts'
import { betaPosterior, probabilityBBeatsA, sampleSizePerVariant, signedPct, twoProportionTest, wilson } from '../util/stats.ts'
import { summarize } from '../performance/metrics.ts'

export interface ExperimentDesign {
  name: string
  hypothesis: string
  metric: MetricKey
  segmentId: ID
  channel: Channel
  variants: { key: string; label: string; assetId: ID; versionId: ID }[]
  minimumDetectableEffect?: number
  problemId?: ID
}

export function baselineRate(ws: Workspace, segmentId: ID, channel: Channel, metric: MetricKey): number {
  const s = summarize(ws.performance.filter((r) => r.segmentId === segmentId && r.channel === channel), metric)
  return s.value ?? 0.03
}

export function designExperiment(ws: Workspace, d: ExperimentDesign): Experiment {
  const mde = d.minimumDetectableEffect ?? 0.2
  const base = baselineRate(ws, d.segmentId, d.channel, d.metric)
  const split = 1 / d.variants.length
  return {
    id: newId('exp'),
    name: d.name,
    hypothesis: d.hypothesis,
    primaryMetric: d.metric,
    segmentId: d.segmentId,
    channel: d.channel,
    variants: d.variants.map((v) => ({ ...v, split })),
    status: 'awaiting_approval',
    minSamplePerVariant: Math.min(200_000, sampleSizePerVariant(base, mde)),
    minimumDetectableEffect: mde,
    createdAt: ws.now,
    problemId: d.problemId,
  }
}

export function evaluateExperiment(ws: Workspace, exp: Experiment): ExperimentResult {
  const since = exp.startedAt ?? exp.createdAt
  const stats: VariantStats[] = exp.variants.map((v) => {
    const recs = ws.performance.filter((r) => r.assetId === v.assetId && r.versionId === v.versionId && r.date >= since && (!exp.endedAt || r.date <= exp.endedAt))
    const parts = rateParts(sumMetrics(recs), exp.primaryMetric) ?? { successes: 0, trials: 0 }
    return { key: v.key, n: parts.trials, successes: parts.successes, rate: parts.trials ? parts.successes / parts.trials : 0, interval: wilson(parts.successes, parts.trials) }
  })
  const control = stats[0]
  const lowerBetter = LOWER_IS_BETTER.has(exp.primaryMetric)
  const posteriors = stats.map((s) => betaPosterior(s.successes, s.n))
  const probabilityBest: Record<string, number> = {}
  stats.forEach((s, i) => {
    let p = 1
    posteriors.forEach((other, j) => {
      if (i !== j) p *= lowerBetter ? probabilityBBeatsA(posteriors[i], other) : probabilityBBeatsA(other, posteriors[i])
    })
    probabilityBest[s.key] = p
  })
  const challenger = [...stats.slice(1)].sort((a, b) => (lowerBetter ? a.rate - b.rate : b.rate - a.rate))[0] ?? control
  const test = twoProportionTest(control.successes, control.n, challenger.successes, challenger.n)
  const lift = control.rate ? challenger.rate / control.rate - 1 : 0
  const enough = stats.every((s) => s.n >= exp.minSamplePerVariant)
  const significant = test.pValue < 0.05
  const challengerWins = lowerBetter ? lift < 0 : lift > 0
  const winner = significant ? (challengerWins ? challenger.key : control.key) : undefined
  const label = (k: string) => exp.variants.find((v) => v.key === k)?.label ?? k
  const summary = winner
    ? `${label(winner)} wins: ${signedPct(winner === control.key ? -lift : lift)} ${METRIC_LABELS[exp.primaryMetric]} (p=${test.pValue.toFixed(3)}, P(best)=${Math.round(probabilityBest[winner] * 100)}%).`
    : enough
      ? `No meaningful difference at the planned sample size (lift ${signedPct(lift)}, p=${test.pValue.toFixed(2)}).`
      : `Running: ${Math.min(...stats.map((s) => s.n)).toLocaleString()} of ${exp.minSamplePerVariant.toLocaleString()} per variant. Current lift ${signedPct(lift)}.`
  return { variants: stats, winner, lift, pValue: test.pValue, probabilityBest, significant, decidedAt: ws.now, summary, learningIds: [] }
}

/**
 * Stopping rule: stop at the planned sample size, or earlier only when the
 * evidence is overwhelming (P(best) ≥ 99% and p < 0.01) after at least 30%
 * of the planned sample and 7 days — guarding against peeking at noise.
 */
export function readyToConclude(exp: Experiment, result: ExperimentResult, now?: string): boolean {
  const minN = Math.min(...result.variants.map((v) => v.n))
  if (minN >= exp.minSamplePerVariant) return true
  const days = exp.startedAt && now ? (new Date(now).getTime() - new Date(exp.startedAt).getTime()) / 86_400_000 : 0
  const best = Math.max(...Object.values(result.probabilityBest))
  return days >= 7 && minN >= exp.minSamplePerVariant * 0.3 && best >= 0.99 && result.pValue < 0.01
}
