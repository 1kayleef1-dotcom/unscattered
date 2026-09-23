import type { Channel, MetricKey, Metrics, PerformanceRecord } from '../types.ts'

export const METRIC_LABELS: Record<MetricKey, string> = {
  ctr: 'CTR',
  cvr: 'Conversion rate',
  qualified_cvr: 'Qualified conversion',
  cac: 'CAC',
  roas: 'ROAS',
  open_rate: 'Open rate',
  click_rate: 'Click rate',
  unsubscribe_rate: 'Unsubscribe rate',
  engagement_rate: 'Engagement rate',
  revenue: 'Revenue',
  pipeline: 'Pipeline',
}

/** Metrics where lower is better. */
export const LOWER_IS_BETTER = new Set<MetricKey>(['cac', 'unsubscribe_rate'])

/** Which rate metric (and its numerator/denominator) matters most per channel. */
export function primaryRateFor(channel: Channel): MetricKey {
  switch (channel) {
    case 'email':
      return 'click_rate'
    case 'web':
    case 'sales':
      return 'qualified_cvr'
    case 'linkedin':
    case 'x':
    case 'instagram':
    case 'threads':
      return 'engagement_rate'
    default:
      return 'ctr'
  }
}

export function sumMetrics(records: { metrics: Metrics }[]): Metrics {
  const out: Metrics = {}
  for (const r of records) {
    for (const [k, v] of Object.entries(r.metrics) as [keyof Metrics, number | undefined][]) {
      if (typeof v === 'number') out[k] = (out[k] ?? 0) + v
    }
  }
  return out
}

/** Numerator/denominator for a rate metric; null when the metric is not a rate. */
export function rateParts(m: Metrics, metric: MetricKey): { successes: number; trials: number } | null {
  switch (metric) {
    case 'ctr':
      return { successes: m.clicks ?? 0, trials: m.impressions ?? 0 }
    case 'cvr':
      return { successes: m.conversions ?? 0, trials: m.visits ?? m.clicks ?? 0 }
    case 'qualified_cvr':
      return { successes: m.qualifiedConversions ?? 0, trials: m.visits ?? m.clicks ?? 0 }
    case 'open_rate':
      return { successes: m.opens ?? 0, trials: m.sends ?? 0 }
    case 'click_rate':
      return { successes: m.emailClicks ?? 0, trials: m.sends ?? 0 }
    case 'unsubscribe_rate':
      return { successes: m.unsubscribes ?? 0, trials: m.sends ?? 0 }
    case 'engagement_rate':
      return { successes: m.engagements ?? 0, trials: m.impressions ?? 0 }
    default:
      return null
  }
}

export function metricValue(m: Metrics, metric: MetricKey): number | null {
  const parts = rateParts(m, metric)
  if (parts) return parts.trials > 0 ? parts.successes / parts.trials : null
  switch (metric) {
    case 'cac':
      return m.spend && m.conversions ? m.spend / m.conversions : null
    case 'roas':
      return m.spend && m.revenue !== undefined ? m.revenue / m.spend : null
    case 'revenue':
      return m.revenue ?? null
    case 'pipeline':
      return m.pipeline ?? null
    default:
      return null
  }
}

export function formatMetric(metric: MetricKey, value: number | null): string {
  if (value === null || Number.isNaN(value)) return '—'
  switch (metric) {
    case 'cac':
      return `$${value.toFixed(0)}`
    case 'roas':
      return `${value.toFixed(2)}x`
    case 'revenue':
    case 'pipeline':
      return value >= 1000 ? `$${(value / 1000).toFixed(1)}k` : `$${value.toFixed(0)}`
    default:
      return `${(value * 100).toFixed(value < 0.1 ? 2 : 1)}%`
  }
}

export function recordsFor(records: PerformanceRecord[], filter: Partial<Pick<PerformanceRecord, 'assetId' | 'versionId' | 'variantKey' | 'segmentId' | 'channel'>>): PerformanceRecord[] {
  return records.filter((r) =>
    (Object.entries(filter) as [keyof PerformanceRecord, unknown][]).every(([k, v]) => v === undefined || r[k] === v),
  )
}

export interface MetricSummary {
  metric: MetricKey
  value: number | null
  successes?: number
  trials?: number
}

export function summarize(records: PerformanceRecord[], metric: MetricKey): MetricSummary {
  const totals = sumMetrics(records)
  const parts = rateParts(totals, metric)
  return { metric, value: metricValue(totals, metric), successes: parts?.successes, trials: parts?.trials }
}
