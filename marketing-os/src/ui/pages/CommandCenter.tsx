import { FastForward, Play } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { propagateMessaging, repurpose } from '../../core/actions.ts'
import { advanceDays, runAgent } from '../../core/agent/agent.ts'
import { METRIC_LABELS, formatMetric, primaryRateFor, summarize } from '../../core/performance/metrics.ts'
import type { Channel, Recommendation } from '../../core/types.ts'
import { inWindow } from '../../core/util/dates.ts'
import { AgentRunView, ApprovalCard, LearningRow, StatusDot, segmentName } from '../components/domain.tsx'
import { CHANNEL_LABELS, fmtDateTime } from '../components/labels.ts'
import { Badge, Button, Card, Empty, PageHeader, Sparkline, Stat } from '../components/ui.tsx'
import { dailySeries } from '../lib/perf.ts'
import { useWorkspace } from '../state/WorkspaceContext.tsx'

export function CommandCenter() {
  const { ws, run, toast, model } = useWorkspace()
  const nav = useNavigate()
  const lastRun = ws.agentRuns[0]
  const pending = ws.approvals.filter((a) => a.status === 'pending')
  const problems = ws.problems.filter((p) => !['dismissed'].includes(p.status)).slice(0, 4)
  const running = ws.experiments.filter((e) => e.status === 'running' || e.status === 'awaiting_approval')
  const channels = Array.from(new Set(ws.performance.map((r) => r.channel))) as Channel[]
  const recs = ws.recommendations.filter((r) => r.status === 'open').slice(0, 5)
  const learnings = ws.learnings.filter((l) => l.direction !== 'neutral' && l.confidence === 'high').slice(0, 5)

  const act = async (r: Recommendation) => {
    const done = (w: typeof ws) => ({ ...w, recommendations: w.recommendations.map((x) => (x.id === r.id ? { ...x, status: 'done' as const } : x)) })
    if (r.kind === 'repurpose' && r.ref?.proofId) {
      await run('Repurposing into 8 channel-native assets', async (w, m) => done((await repurpose(w, r.ref!.proofId!, r.ref!.segmentId ?? w.brand.segments[0].id, m)).ws))
      nav('/repurpose')
    } else if (r.kind === 'propagate' && r.ref?.messagingModelId) {
      await run('Updating assets to the new messaging', async (w, m) => done(await propagateMessaging(w, r.ref!.messagingModelId!, m)))
    } else if (r.kind === 'add_angle' && r.ref?.assetId) {
      nav(`/assets/${r.ref.assetId}`)
    } else if (r.kind === 'collect_proof') {
      nav('/brand')
    } else {
      run('Marking done', async (w) => done(w))
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow={`Morning briefing · ${fmtDateTime(ws.now)}`}
        title="Command center"
        subtitle="What the operator found, what it prepared, and what needs your decision."
        actions={
          <>
            <Button onClick={() => run('Agent running: inspect → detect → investigate → prepare', async (w, m) => { const r = await runAgent(w, { model: m }); toast(r.run.headline); return r.ws })}>
              <Play size={14} /> Run agent now
            </Button>
            {ws.simulation?.enabled && (
              <Button variant="primary" onClick={() => run('Simulating 7 days of live traffic', async (w, m) => { const r = await advanceDays(w, 7, { model: m }); toast(r.run.headline); return r.ws })}>
                <FastForward size={14} /> Simulate 7 days
              </Button>
            )}
          </>
        }
      />

      {lastRun && (
        <div className="mb-6 rounded-lg bg-ink p-5 text-white">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-teal-300">Operator summary</div>
          <div className="mt-1.5 max-w-4xl font-serif text-xl leading-snug">{lastRun.headline}</div>
          <div className="mt-2 text-xs text-white/50">Last run {fmtDateTime(lastRun.finishedAt)} · writer: {model.label}</div>
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {channels.map((ch) => {
          const recs = ws.performance.filter((r) => r.channel === ch)
          const metric = primaryRateFor(ch)
          const now = summarize(recs.filter((r) => inWindow(r.date, ws.now, 7)), metric).value
          const prev = summarize(recs.filter((r) => inWindow(r.date, ws.now, 14, 7)), metric).value
          const delta = now && prev ? now / prev - 1 : undefined
          return (
            <div key={ch} className="rounded-lg border border-line bg-panel p-4">
              <div className="flex items-start justify-between">
                <Stat label={`${CHANNEL_LABELS[ch]} · ${METRIC_LABELS[metric]}`} value={formatMetric(metric, now)} delta={delta} />
                <Sparkline values={dailySeries(ws, recs, metric, 35)} tone={delta !== undefined && delta < -0.1 ? 'bad' : 'accent'} />
              </div>
            </div>
          )
        })}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
        <div className="space-y-6">
          <Card title={`Needs your approval (${pending.length})`} subtitle="Nothing consequential happens without a yes. Approving executes immediately." action={pending.length > 3 ? <Link to="/approvals" className="text-xs font-medium text-accent">All approvals →</Link> : undefined}>
            {pending.length ? <div className="space-y-2.5">{pending.slice(0, 4).map((a) => <ApprovalCard key={a.id} a={a} compact />)}</div> : <Empty title="Nothing waiting">The agent will queue work here when it has something ready.</Empty>}
          </Card>

          <Card title="Problems & opportunities" action={<Link to="/problems" className="text-xs font-medium text-accent">Problem solver →</Link>}>
            {problems.length ? (
              <ul className="divide-y divide-line">
                {problems.map((p) => (
                  <li key={p.id}>
                    <Link to={`/problems/${p.id}`} className="flex items-start gap-3 py-2.5 hover:bg-canvas/60">
                      <span className="mt-1.5"><StatusDot status={p.status} /></span>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-ink">{p.title}</div>
                        <div className="text-xs text-muted">{p.hypotheses[0]?.statement} · {p.status.replace('_', ' ')}</div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty title="No open problems" />
            )}
          </Card>

          {lastRun && (
            <Card title="Today’s agent run" subtitle="The 12-step daily loop. Expand a step to see what it found.">
              <AgentRunView run={lastRun} />
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card title="Experiments" action={<Link to="/experiments" className="text-xs font-medium text-accent">All →</Link>}>
            {running.length ? (
              <ul className="space-y-3">
                {running.map((e) => (
                  <li key={e.id}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{e.name}</span>
                      <Badge tone={e.status === 'running' ? 'info' : 'warn'}>{e.status.replace('_', ' ')}</Badge>
                    </div>
                    <div className="text-xs text-muted">{e.result?.summary ?? e.hypothesis}</div>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty title="No active experiments" />
            )}
          </Card>

          <Card title="Recommendations">
            {recs.length ? (
              <ul className="space-y-3">
                {recs.map((r) => (
                  <li key={r.id} className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{r.title}</div>
                      <div className="text-xs text-muted">{r.detail}</div>
                    </div>
                    <Button size="sm" onClick={() => act(r)}>{r.kind === 'repurpose' ? 'Repurpose' : r.kind === 'propagate' ? 'Update' : r.kind === 'add_angle' ? 'Open' : r.kind === 'collect_proof' ? 'Brand brain' : 'Done'}</Button>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty title="No open recommendations" />
            )}
          </Card>

          <Card title="What we’ve learned" subtitle="High-confidence, business-specific patterns." action={<Link to="/intelligence" className="text-xs font-medium text-accent">Intelligence →</Link>}>
            {learnings.length ? <div className="divide-y divide-line">{learnings.map((l) => <LearningRow key={l.id} l={l} ws={ws} />)}</div> : <Empty title="Not enough data yet" />}
          </Card>

          <Card title="Activity">
            <ul className="space-y-2 text-xs">
              {ws.activity.slice(0, 10).map((a) => (
                <li key={a.id} className="flex gap-2"><span className="w-20 shrink-0 text-muted">{fmtDateTime(a.at)}</span><span className="text-ink-2">{a.message}</span></li>
              ))}
            </ul>
            <div className="mt-2 text-[11px] text-muted">Segments: {ws.brand.segments.map((s) => segmentName(ws, s.id)).join(' · ')}</div>
          </Card>
        </div>
      </div>
    </div>
  )
}
