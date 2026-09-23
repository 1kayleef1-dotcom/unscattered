import { concludeExperiment } from '../../core/ops.ts'
import { METRIC_LABELS } from '../../core/performance/metrics.ts'
import { evaluateExperiment } from '../../core/experiments/experiments.ts'
import { pct } from '../../core/util/stats.ts'
import { ApprovalCard, segmentName } from '../components/domain.tsx'
import { CHANNEL_LABELS, fmtDate } from '../components/labels.ts'
import { Badge, Button, Card, Empty, PageHeader } from '../components/ui.tsx'
import { useWorkspace } from '../state/WorkspaceContext.tsx'

export function ExperimentsPage() {
  const { ws, run } = useWorkspace()
  return (
    <div>
      <PageHeader title="Experiments" subtitle="Every test states its hypothesis, primary metric and planned sample size up front. Early stopping only on overwhelming evidence; results become learnings." />
      {ws.experiments.length === 0 ? (
        <Empty title="No experiments yet" />
      ) : (
        <div className="space-y-4">
          {ws.experiments.map((e) => {
            const result = e.result ?? (e.status === 'running' ? evaluateExperiment(ws, e) : undefined)
            const max = Math.max(0.0001, ...(result?.variants.map((v) => v.interval[1]) ?? [0]))
            const approval = ws.approvals.find((a) => a.payload.experimentId === e.id && a.status === 'pending')
            return (
              <Card
                key={e.id}
                title={e.name}
                subtitle={`${segmentName(ws, e.segmentId)} · ${CHANNEL_LABELS[e.channel]} · ${METRIC_LABELS[e.primaryMetric]} · ${e.minSamplePerVariant.toLocaleString()} per variant to detect ${Math.round(e.minimumDetectableEffect * 100)}%${e.startedAt ? ` · started ${fmtDate(e.startedAt)}` : ''}`}
                action={<>
                  <Badge tone={e.status === 'concluded' ? 'good' : e.status === 'running' ? 'info' : 'warn'}>{e.status.replace('_', ' ')}</Badge>
                  {e.status === 'running' && <Button size="sm" onClick={() => run('Concluding', async (w) => concludeExperiment(w, e.id))}>Conclude now</Button>}
                </>}
              >
                <div className="text-sm text-ink-2"><span className="font-medium text-ink">Hypothesis:</span> {e.hypothesis}</div>
                {result && (
                  <div className="mt-4 space-y-2.5">
                    {result.variants.map((v) => {
                      const label = e.variants.find((x) => x.key === v.key)?.label
                      const best = result.winner === v.key
                      return (
                        <div key={v.key} className="grid grid-cols-[180px_1fr_170px] items-center gap-3 text-sm">
                          <span className="truncate">{label} {best && <Badge tone="good">winner</Badge>}</span>
                          <div className="relative h-5 rounded bg-canvas">
                            <div className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded bg-line-2" style={{ left: `${(v.interval[0] / max) * 100}%`, width: `${((v.interval[1] - v.interval[0]) / max) * 100}%` }} />
                            <div className={`absolute top-0 h-5 w-0.5 ${best ? 'bg-good' : 'bg-ink'}`} style={{ left: `${(v.rate / max) * 100}%` }} />
                          </div>
                          <span className="num text-xs text-muted">{pct(v.rate, 2)} · n={v.n.toLocaleString()} · P(best) {Math.round((result.probabilityBest[v.key] ?? 0) * 100)}%</span>
                        </div>
                      )
                    })}
                    <div className="text-sm font-medium">{result.summary}</div>
                  </div>
                )}
                {approval && <div className="mt-4"><ApprovalCard a={approval} compact /></div>}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
