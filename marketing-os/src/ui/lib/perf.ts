import { metricValue, primaryRateFor, sumMetrics } from '../../core/performance/metrics.ts'
import type { MetricKey, PerformanceRecord, Workspace } from '../../core/types.ts'
import { addDays, toDay } from '../../core/util/dates.ts'

/** Daily values of a metric over the last `days` days (7-day rolling to smooth noise). */
export function dailySeries(ws: Workspace, records: PerformanceRecord[], metric: MetricKey, days = 42, smooth = 7): number[] {
  const byDay = new Map<string, PerformanceRecord[]>()
  for (const r of records) byDay.set(toDay(r.date), [...(byDay.get(toDay(r.date)) ?? []), r])
  const out: number[] = []
  for (let i = days; i >= 1; i -= 1) {
    const window: PerformanceRecord[] = []
    for (let k = 0; k < smooth; k += 1) window.push(...(byDay.get(toDay(addDays(ws.now, -(i + k)))) ?? []))
    const v = metricValue(sumMetrics(window), metric)
    if (v !== null) out.push(v)
  }
  return out
}

export function assetMetric(ws: Workspace, assetId: string): MetricKey {
  const a = ws.assets.find((x) => x.id === assetId)
  return a ? primaryRateFor(a.channel) : 'cvr'
}
