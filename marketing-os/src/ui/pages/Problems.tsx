import { Link, useParams } from 'react-router-dom'
import { prepareProblemAssets } from '../../core/actions.ts'
import { assetTypeLabel } from '../../core/copy/pipeline.ts'
import { METRIC_LABELS, formatMetric } from '../../core/performance/metrics.ts'
import { proposeSolution } from '../../core/solver/solver.ts'
import type { Problem } from '../../core/types.ts'
import { pct, signedPct } from '../../core/util/stats.ts'
import { ApprovalCard, EvidenceList, LearningRow, StatusDot, segmentName } from '../components/domain.tsx'
import { CHANNEL_LABELS, fmtDateTime } from '../components/labels.ts'
import { Badge, Button, Card, Empty, PageHeader, ScoreBar, Sparkline, cx } from '../components/ui.tsx'
import { dailySeries } from '../lib/perf.ts'
import { useWorkspace } from '../state/WorkspaceContext.tsx'

export function ProblemsPage() {
  const { ws } = useWorkspace()
  return (
    <div>
      <PageHeader title="Problem solver" subtitle="Anomalies and opportunities the operator found, each taken through investigation, hypothesis, solution, experiment and learning." />
      {ws.problems.length === 0 ? (
        <Empty title="No problems detected">Run the agent from the command center; it checks every live asset daily.</Empty>
      ) : (
        <div className="space-y-3">
          {ws.problems.map((p) => (
            <Link key={p.id} to={`/problems/${p.id}`} className="block rounded-lg border border-line bg-panel p-4 hover:border-line-2">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2"><StatusDot status={p.status} /><span className="font-medium">{p.title}</span></div>
                  <div className="mt-1 text-sm text-muted">{p.hypotheses[0]?.statement} · {segmentName(ws, p.segmentId)}</div>
                </div>
                <Badge tone={p.status === 'resolved' ? 'good' : p.status === 'experimenting' ? 'info' : 'warn'}>{p.status.replace('_', ' ')}</Badge>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function Stage({ n, title, children, done = true }: { n: number; title: string; children: React.ReactNode; done?: boolean }) {
  return (
    <div className="relative flex gap-4">
      <div className="flex flex-col items-center">
        <div className={cx('num flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold', done ? 'bg-ink text-white' : 'border border-dashed border-line-2 text-muted')}>{n}</div>
        <div className="w-px flex-1 bg-line-2" />
      </div>
      <div className="min-w-0 flex-1 pb-8">
        <div className="label mb-2 pt-1.5">{title}</div>
        {children}
      </div>
    </div>
  )
}

export function ProblemPage() {
  const { id } = useParams()
  const { ws, run, toast } = useWorkspace()
  const p = ws.problems.find((x) => x.id === id)
  if (!p) return <Empty title="Problem not found" />
  const hyp = p.hypotheses.find((h) => h.id === p.selectedHypothesisId) ?? p.hypotheses[0]
  const asset = p.anomaly?.scope.assetId ? ws.assets.find((a) => a.id === p.anomaly!.scope.assetId) : undefined
  const exp = p.experimentId ? ws.experiments.find((e) => e.id === p.experimentId) : undefined
  const research = p.investigation.find((s) => s.kind === 'customer_research')
  const approvals = ws.approvals.filter((a) => a.payload.problemId === p.id || (a.payload.assetId && p.solution?.assets.some((x) => x.assetId === a.payload.assetId)))
  const learnings = ws.learnings.filter((l) => p.learningIds.includes(l.id))
  const update = (patch: Partial<Problem>) => run('Updating', async (w) => ({ ...w, problems: w.problems.map((x) => (x.id === p.id ? { ...x, ...patch } : x)) }))

  const selectHypothesis = (hid: string) => {
    const h = p.hypotheses.find((x) => x.id === hid)!
    run('Re-planning around the selected hypothesis', async (w) => ({
      ...w,
      problems: w.problems.map((x) => (x.id === p.id ? { ...x, selectedHypothesisId: hid, solution: proposeSolution(w, x, h), status: 'solution_proposed', timeline: [...x.timeline, { at: w.now, event: `Hypothesis changed to: ${h.statement}` }] } : x)),
    }))
  }

  return (
    <div>
      <PageHeader
        eyebrow={<Link to="/problems" className="hover:underline">Problem solver</Link>}
        title={p.title}
        subtitle={`${segmentName(ws, p.segmentId)} · opened ${fmtDateTime(p.createdAt)}`}
        actions={
          <>
            {p.status === 'solution_proposed' && (
              <Button variant="primary" onClick={() => run('Generating the fix: page, ads, emails, retargeting', async (w, m) => { const next = await prepareProblemAssets(w, p.id, m); toast('Assets prepared; approvals requested.'); return next })}>
                Prepare assets
              </Button>
            )}
            {!['resolved', 'dismissed'].includes(p.status) && <Button variant="ghost" onClick={() => update({ status: 'dismissed' })}>Dismiss</Button>}
          </>
        }
      />
      <div className="grid gap-8 xl:grid-cols-[1fr_340px]">
        <div>
          <Stage n={1} title="Problem">
            {p.anomaly ? (
              <div className="flex flex-wrap items-center gap-6 rounded-lg border border-line bg-panel p-4">
                <div>
                  <div className="text-xs text-muted">{METRIC_LABELS[p.anomaly.metric]} · {CHANNEL_LABELS[p.anomaly.scope.channel ?? 'web']}</div>
                  <div className="num text-2xl font-semibold">{formatMetric(p.anomaly.metric, p.anomaly.baseline)} → <span className={p.anomaly.change < 0 ? 'text-bad' : 'text-good'}>{formatMetric(p.anomaly.metric, p.anomaly.current)}</span></div>
                  <div className="text-xs text-muted">{signedPct(p.anomaly.change)} last {p.anomaly.window.recentDays} days vs prior {p.anomaly.window.baselineDays} · z={p.anomaly.zScore.toFixed(1)}</div>
                </div>
                {asset && <Sparkline width={220} height={48} tone="bad" values={dailySeries(ws, ws.performance.filter((r) => r.assetId === asset.id), p.anomaly.metric, 45)} />}
                {asset && <Link className="text-sm font-medium text-accent" to={`/assets/${asset.id}`}>{asset.name} →</Link>}
              </div>
            ) : (
              <div className="text-sm">{p.opportunity}</div>
            )}
          </Stage>

          <Stage n={2} title="Investigate">
            <ul className="space-y-2">
              {p.investigation.filter((s) => s.kind !== 'customer_research').map((s) => (
                <li key={s.kind} className="flex gap-3 rounded-md border border-line bg-panel p-3">
                  <Badge tone={s.implicates ? 'warn' : 'neutral'}>{s.implicates ? 'implicated' : 'ruled out'}</Badge>
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{s.question}</div>
                    <div className="text-sm text-ink-2">{s.finding}</div>
                  </div>
                </li>
              ))}
            </ul>
          </Stage>

          <Stage n={3} title="Customer research">
            {research ? (
              <div className="space-y-3">
                <div className="rounded-md border-l-4 border-accent bg-accent-soft/60 p-3 text-sm text-ink">{research.finding}</div>
                <EvidenceList refs={research.evidence} ws={ws} />
              </div>
            ) : (
              <Empty title="No research step" />
            )}
          </Stage>

          <Stage n={4} title="Hypotheses">
            <div className="space-y-2">
              {p.hypotheses.map((h) => (
                <button key={h.id} onClick={() => h.id !== hyp?.id && selectHypothesis(h.id)} className={cx('block w-full rounded-lg border p-3 text-left', h.id === hyp?.id ? 'border-ink bg-panel' : 'border-line bg-panel/60 hover:border-line-2')}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">{h.statement}</span>
                    <span className="flex w-36 items-center gap-2"><ScoreBar value={h.confidence * 100} /><span className="num text-xs">{Math.round(h.confidence * 100)}%</span></span>
                  </div>
                  <div className="mt-1 text-sm text-ink-2">{h.mechanism}</div>
                  <div className="mt-1 text-xs text-muted">Test metric: {METRIC_LABELS[h.testMetric]}{h.recommendedStrategy ? ` · page strategy: ${h.recommendedStrategy.replace('_', '-')}` : ''}{h.recommendedAngles ? ` · angles: ${h.recommendedAngles.join(', ')}` : ''}</div>
                  {h.id === hyp?.id && <Badge tone="dark" className="mt-2">selected</Badge>}
                </button>
              ))}
            </div>
          </Stage>

          <Stage n={5} title="Solution" done={Boolean(p.solution)}>
            {p.solution ? (
              <div className="space-y-3">
                <div className="text-sm text-ink">{p.solution.summary}</div>
                <div className="rounded-md bg-canvas p-3 text-sm"><span className="font-semibold">Positioning shift:</span> {p.solution.positioningShift}</div>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {p.solution.assets.map((a) => {
                    const made = a.assetId ? ws.assets.find((x) => x.id === a.assetId) : undefined
                    return (
                      <li key={a.id} className="rounded-md border border-line bg-panel p-3">
                        <div className="flex items-center justify-between gap-2"><span className="text-sm font-medium">{assetTypeLabel(a.type)} · {CHANNEL_LABELS[a.channel]}</span><Badge tone={a.status === 'planned' ? 'neutral' : 'good'}>{a.status}</Badge></div>
                        <div className="text-xs text-muted">{a.purpose}</div>
                        {made && <Link className="mt-1 inline-block text-xs font-medium text-accent" to={`/assets/${made.id}`}>Open in studio →</Link>}
                      </li>
                    )
                  })}
                </ul>
                <div className="text-xs text-muted">Experiment design: {p.solution.experimentDesign}</div>
              </div>
            ) : (
              <Empty title="No solution yet" />
            )}
          </Stage>

          <Stage n={6} title="Execution" done={approvals.some((a) => a.status === 'executed')}>
            {approvals.length ? <div className="space-y-2">{approvals.map((a) => <ApprovalCard key={a.id} a={a} compact />)}</div> : <div className="text-sm text-muted">Nothing prepared yet. “Prepare assets” generates the fix and queues approvals.</div>}
          </Stage>

          <Stage n={7} title="Experiment" done={Boolean(exp && exp.status !== 'awaiting_approval')}>
            {exp ? (
              <div className="rounded-lg border border-line bg-panel p-4">
                <div className="flex items-center justify-between"><span className="font-medium">{exp.name}</span><Badge tone={exp.status === 'concluded' ? 'good' : 'info'}>{exp.status.replace('_', ' ')}</Badge></div>
                <div className="mt-1 text-sm text-muted">{exp.hypothesis}</div>
                {exp.result && (
                  <div className="mt-3 space-y-1.5">
                    {exp.result.variants.map((v) => (
                      <div key={v.key} className="flex items-center gap-3 text-sm">
                        <span className="w-44 truncate">{exp.variants.find((x) => x.key === v.key)?.label}</span>
                        <span className="num w-16">{pct(v.rate, 2)}</span>
                        <span className="num text-xs text-muted">n={v.n.toLocaleString()} · 95% CI {pct(v.interval[0], 2)}–{pct(v.interval[1], 2)}</span>
                      </div>
                    ))}
                    <div className="text-sm font-medium">{exp.result.summary}</div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm text-muted">Not started.</div>
            )}
          </Stage>

          <Stage n={8} title="Result → learning → memory" done={learnings.length > 0}>
            {learnings.length ? <div className="divide-y divide-line rounded-lg border border-line bg-panel px-3">{learnings.map((l) => <LearningRow key={l.id} l={l} ws={ws} />)}</div> : <div className="text-sm text-muted">Learnings appear here when the experiment concludes. They update the Intelligence model and future briefs.</div>}
          </Stage>
        </div>

        <div>
          <Card title="Timeline">
            <ol className="space-y-3">
              {p.timeline.map((t, i) => (
                <li key={i} className="text-sm"><div className="text-[11px] text-muted">{fmtDateTime(t.at)}</div><div className="text-ink-2">{t.event}</div></li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </div>
  )
}
