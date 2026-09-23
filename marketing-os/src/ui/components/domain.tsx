import { AlertTriangle, ArrowDown, CheckCircle2, ChevronDown, ChevronRight, CircleDashed, MinusCircle, XCircle } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { DIMENSION_LABELS } from '../../core/critic/critic.ts'
import { METRIC_LABELS } from '../../core/performance/metrics.ts'
import type { AgentRun, ApprovalRequest, AssetContent, Critique, EvidenceRef, Learning, MarketingBrief, StrategyChain, Workspace } from '../../core/types.ts'
import { signedPct } from '../../core/util/stats.ts'
import { useWorkspace } from '../state/WorkspaceContext.tsx'
import { decide, execute } from '../../core/ops.ts'
import { Badge, Button, ScoreBar, Textarea, cx } from './ui.tsx'
import { fmtDate, relDays } from './labels.ts'

export function segmentName(ws: Workspace, id: string): string {
  return ws.brand.segments.find((s) => s.id === id)?.name ?? id
}

// ---------------------------------------------------------------------------

export function ApprovalCard({ a, compact }: { a: ApprovalRequest; compact?: boolean }) {
  const { ws, run, toast } = useWorkspace()
  const asset = a.payload.assetId ? ws.assets.find((x) => x.id === a.payload.assetId) : undefined
  const exp = a.payload.experimentId ? ws.experiments.find((x) => x.id === a.payload.experimentId) : undefined
  const approve = () =>
    run(`Executing “${a.title}”`, async (w) => {
      const next = await execute(decide(w, a.id, true), a.id)
      toast(`Approved and executed: ${a.title}`)
      return next
    })
  const reject = () => run('Rejecting', async (w) => decide(w, a.id, false))
  return (
    <div className="rounded-lg border border-line bg-panel p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={a.risk === 'high' ? 'bad' : a.risk === 'medium' ? 'warn' : 'neutral'}>{a.risk} risk</Badge>
            <Badge tone="info">{a.action.replace('_', ' ')}</Badge>
            <span className="text-xs text-muted">requested by {a.requestedBy} · {relDays(a.requestedAt, ws.now)}</span>
          </div>
          <div className="mt-1.5 font-medium text-ink">{a.title}</div>
          {!compact && <div className="mt-0.5 text-sm text-ink-2">{a.description}</div>}
          <div className="mt-1 text-xs text-muted">Why: {a.why}</div>
          <div className="mt-1.5 flex gap-3 text-xs">
            {asset && <Link className="font-medium text-accent hover:underline" to={`/assets/${asset.id}`}>Review “{asset.name}” →</Link>}
            {exp && <Link className="font-medium text-accent hover:underline" to="/experiments">Experiment design →</Link>}
          </div>
        </div>
        {a.status === 'pending' ? (
          <div className="flex shrink-0 flex-col gap-1.5">
            <Button size="sm" variant="good" onClick={approve}>Approve</Button>
            <Button size="sm" variant="ghost" onClick={reject}>Reject</Button>
          </div>
        ) : (
          <Badge tone={a.status === 'executed' ? 'good' : a.status === 'rejected' ? 'neutral' : a.status === 'failed' ? 'bad' : 'accent'}>{a.status}</Badge>
        )}
      </div>
      {a.result && <div className="mt-2 border-t border-line pt-2 text-xs text-muted">{a.result}</div>}
    </div>
  )
}

// ---------------------------------------------------------------------------

export function AgentRunView({ run }: { run: AgentRun }) {
  const [open, setOpen] = useState<number | null>(null)
  return (
    <ol className="divide-y divide-line">
      {run.steps.map((s) => (
        <li key={s.n}>
          <button className="flex w-full items-start gap-3 py-2 text-left" onClick={() => setOpen(open === s.n ? null : s.n)} disabled={s.items.length === 0}>
            <span className="num mt-0.5 w-5 shrink-0 text-right text-xs text-muted">{s.n}</span>
            <span className="mt-0.5 shrink-0">
              {s.status === 'attention' ? <AlertTriangle size={14} className="text-warn" /> : s.status === 'skipped' ? <MinusCircle size={14} className="text-muted" /> : <CheckCircle2 size={14} className="text-good" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="text-sm font-medium text-ink">{s.name}</span>
              <span className="ml-2 text-sm text-muted">{s.summary}</span>
            </span>
            {s.items.length > 0 && (open === s.n ? <ChevronDown size={14} className="mt-1 text-muted" /> : <ChevronRight size={14} className="mt-1 text-muted" />)}
          </button>
          {open === s.n && (
            <ul className="mb-2 ml-14 space-y-1 text-xs text-ink-2">
              {s.items.map((i, k) => (
                <li key={k} className="flex gap-2"><span className="text-muted">–</span><span>{i}</span></li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ol>
  )
}

// ---------------------------------------------------------------------------

export function CritiqueView({ critique, before }: { critique?: Critique; before?: Critique }) {
  if (!critique) return <div className="text-sm text-muted">Not critiqued yet. Run the critic before publishing.</div>
  const checks = [...critique.checks].sort((a, b) => Number(a.passed) - Number(b.passed) || (a.severity === 'blocker' ? -1 : 1))
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className={cx('num flex h-14 w-14 items-center justify-center rounded-full border-4 text-lg font-semibold', critique.overall >= 75 ? 'border-good text-good' : critique.overall >= 55 ? 'border-warn text-warn' : 'border-bad text-bad')}>{critique.overall}</div>
        <div>
          <Badge tone={critique.verdict === 'publishable' ? 'good' : critique.verdict === 'revise' ? 'warn' : 'bad'}>{critique.verdict}</Badge>
          <div className="mt-1 text-xs text-muted">Reviewed by {critique.reviewers.map((r) => (r === 'rules' ? 'rules critic' : 'independent LLM critic')).join(' + ')}</div>
          {before && <div className="text-xs text-muted">Before revision: {before.overall} → after: {critique.overall}</div>}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {(Object.keys(critique.scores) as (keyof typeof critique.scores)[]).map((d) => (
          <div key={d}>
            <div className="mb-1 flex justify-between text-xs"><span className="text-ink-2">{DIMENSION_LABELS[d]}</span><span className="num font-medium">{critique.scores[d]}</span></div>
            <ScoreBar value={critique.scores[d]} />
          </div>
        ))}
      </div>
      <ul className="space-y-2">
        {checks.map((c) => (
          <li key={c.id} className="flex gap-2 text-sm">
            {c.passed ? <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-good" /> : c.severity === 'blocker' ? <XCircle size={15} className="mt-0.5 shrink-0 text-bad" /> : <AlertTriangle size={15} className="mt-0.5 shrink-0 text-warn" />}
            <div className="min-w-0">
              <div className="font-medium text-ink">{c.criterion} <span className="num text-xs font-normal text-muted">{c.score}/5 · {c.dimension}</span></div>
              <div className="text-xs text-ink-2">{c.finding}</div>
              {!c.passed && c.fix && <div className="text-xs text-accent">Fix: {c.fix}</div>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ---------------------------------------------------------------------------

export function ChainView({ chain, ws }: { chain: StrategyChain; ws: Workspace }) {
  const rows: [string, ReactNode][] = [
    ['Business goal', chain.businessGoal],
    ['Marketing objective', chain.objective],
    ['Audience', segmentName(ws, chain.segmentId)],
    ['Problem', chain.problem],
    ['Insight', chain.insight],
    ['Positioning', chain.positioning],
    ['Message', chain.message],
    ['Creative concept', chain.creativeConcept],
    ['CTA', chain.cta],
    ['Measurement', `${METRIC_LABELS[chain.measurement.primaryMetric]}${chain.measurement.secondary.length ? ` (also ${chain.measurement.secondary.map((m) => METRIC_LABELS[m]).join(', ')})` : ''}`],
  ]
  return (
    <ol className="relative space-y-0">
      {rows.map(([k, v], i) => (
        <li key={k} className="relative flex gap-3 pb-3">
          <div className="flex flex-col items-center">
            <span className={cx('mt-1 h-2.5 w-2.5 rounded-full border-2', i === 0 ? 'border-ink bg-ink' : 'border-accent bg-panel')} />
            {i < rows.length - 1 && <span className="w-px flex-1 bg-line-2" />}
          </div>
          <div className="min-w-0 pb-1">
            <div className="label">{k}</div>
            <div className="text-sm text-ink">{v || <span className="text-muted">—</span>}</div>
          </div>
        </li>
      ))}
    </ol>
  )
}

// ---------------------------------------------------------------------------

export function EvidenceList({ refs, ws, empty = 'No evidence recorded.' }: { refs: EvidenceRef[]; ws: Workspace; empty?: string }) {
  const unique = refs.filter((r, i) => refs.findIndex((x) => x.id === r.id && x.kind === r.kind) === i)
  if (unique.length === 0) return <div className="text-sm text-muted">{empty}</div>
  return (
    <ul className="space-y-2">
      {unique.map((r) => {
        const insight = r.kind === 'insight' ? ws.language.insights.find((i) => i.id === r.id) : undefined
        const proof = r.kind === 'proof' ? ws.brand.proof.find((p) => p.id === r.id) : undefined
        const source = r.kind === 'source' ? ws.sources.find((s) => s.id === r.id) : undefined
        return (
          <li key={`${r.kind}:${r.id}`} className="rounded-md border border-line bg-canvas/60 p-2.5 text-sm">
            <div className="flex items-center gap-2">
              <Badge tone={r.kind === 'proof' ? 'good' : r.kind === 'insight' ? 'accent' : r.kind === 'learning' ? 'info' : 'neutral'}>{r.kind}</Badge>
              <span className="text-ink-2">{r.note}</span>
            </div>
            {insight && (
              <ul className="mt-1.5 space-y-1 border-l-2 border-accent/30 pl-2.5">
                {insight.quotes.slice(0, 3).map((q, i) => (
                  <li key={i} className="font-serif text-[13px] text-ink-2">“{q.text}” <span className="font-sans text-[11px] text-muted">— {q.sourceKind.replace('_', ' ')}, {fmtDate(q.date)}</span></li>
                ))}
              </ul>
            )}
            {proof && <div className="mt-1 text-xs text-muted">{proof.detail}</div>}
            {source && <div className="mt-1 font-serif text-[13px] text-ink-2">“{source.text}”</div>}
          </li>
        )
      })}
    </ul>
  )
}

// ---------------------------------------------------------------------------

function Row({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3 border-b border-line py-2 last:border-0">
      <div className="label pt-0.5">{k}</div>
      <div className="text-sm text-ink">{children}</div>
    </div>
  )
}

export function BriefView({ brief, ws }: { brief: MarketingBrief; ws: Workspace }) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-2 text-xs text-muted">
        <span>Brief confidence</span>
        <div className="w-24"><ScoreBar value={brief.confidence * 100} /></div>
        <span className="num">{Math.round(brief.confidence * 100)}%</span>
      </div>
      <Row k="Offer">{brief.offer.name} — {brief.offer.summary}</Row>
      <Row k="Audience">{brief.audience.name}{brief.audience.persona ? ` · ${brief.audience.persona}` : ''}<div className="text-xs text-muted">{brief.audience.description}</div></Row>
      <Row k="Problem">{brief.problem}</Row>
      <Row k="Desired outcome">{brief.desiredOutcome}</Row>
      <Row k="Awareness">{brief.awareness.replace('_', ' ')} · market sophistication {brief.sophistication}/5</Row>
      <Row k="Objections">
        <ul className="space-y-1.5">
          {brief.objections.map((o) => (
            <li key={o.theme}><span className="font-medium">{o.theme}</span> — <span className="font-serif">“{o.customerWords}”</span><div className="text-xs text-muted">Answer: {o.response || '— (gap)'}</div></li>
          ))}
        </ul>
      </Row>
      <Row k="Alternatives">{brief.alternatives.join(' · ') || '—'}</Row>
      <Row k="Competitors">{brief.competitors.map((c) => c.name).join(', ') || '—'}</Row>
      <Row k="Proof">{brief.proof.map((p) => p.text).join(' · ') || '—'}</Row>
      <Row k="Positioning">{brief.positioning}</Row>
      <Row k="Message">{brief.message}</Row>
      <Row k="CTA">{brief.cta}</Row>
      <Row k="Customer words">{brief.customerPhrases.slice(0, 6).map((p) => <span key={p} className="mr-1.5 mb-1 inline-block rounded bg-accent-soft px-1.5 py-0.5 font-serif text-[13px] text-accent">{p}</span>)}</Row>
      <Row k="Learnings">{brief.learnings.length ? <ul className="list-disc pl-4">{brief.learnings.map((l) => <li key={l.learningId}>{l.statement}</li>)}</ul> : 'None yet for this segment.'}</Row>
      {brief.gaps.length > 0 && (
        <div className="mt-3 rounded-md bg-warn-soft p-3 text-sm text-warn">
          <div className="font-semibold">Gaps — not invented, flagged</div>
          <ul className="mt-1 list-disc pl-4">{brief.gaps.map((g) => <li key={g}>{g}</li>)}</ul>
        </div>
      )}
      <div className="mt-2 text-xs text-muted">{ws.brand.company} voice: {brief.voice.tone}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------

export function CopyView({ content, editing, onChange }: { content: AssetContent; editing?: boolean; onChange?: (c: AssetContent) => void }) {
  const set = (si: number, bi: number, text: string) => {
    if (!onChange) return
    onChange({ sections: content.sections.map((s, i) => (i !== si ? s : { ...s, blocks: s.blocks.map((b, j) => (j !== bi ? b : { ...b, text })) })) })
  }
  return (
    <div className="space-y-5">
      {content.sections.map((s, si) => (
        <section key={s.id} className="rounded-lg border border-line bg-panel">
          <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-canvas/50 px-4 py-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-ink-2">{s.title}</span>
              {typeof s.meta?.day === 'number' && <Badge>Day {s.meta.day}</Badge>}
              {s.meta?.angle && <Badge tone="accent">{String(s.meta.angle).replace('_', ' ')}</Badge>}
              {s.meta?.platform && <Badge tone="info">{String(s.meta.platform)}</Badge>}
            </div>
            {s.meta?.metric && <span className="text-[11px] text-muted">judged on {METRIC_LABELS[s.meta.metric as keyof typeof METRIC_LABELS] ?? s.meta.metric}</span>}
          </header>
          <div className="space-y-3 px-4 py-3">
            {s.meta?.hypothesis && (
              <div className="rounded bg-info-soft px-2.5 py-1.5 text-xs text-info"><span className="font-semibold">Hypothesis:</span> {String(s.meta.hypothesis)}{s.meta.creative ? <><br /><span className="font-semibold">Creative:</span> {String(s.meta.creative)}</> : null}</div>
            )}
            {s.meta?.branch && <div className="text-xs text-muted">Branch: {String(s.meta.branch)}</div>}
            {s.blocks.map((b, bi) => (
              <div key={b.key}>
                <div className="label mb-0.5">{b.label}</div>
                {editing ? (
                  <Textarea className="copy-text min-h-[44px]" rows={Math.min(12, Math.max(1, Math.ceil(b.text.length / 80) + (b.text.match(/\n/g)?.length ?? 0)))} value={b.text} onChange={(e) => set(si, bi, e.target.value)} />
                ) : (
                  <div className={cx('whitespace-pre-line', /^(headline|subject|hook|visual)(_\d+)?$/.test(b.key) ? 'copy-headline text-[21px]' : 'copy-text', b.key.startsWith('cta') && 'inline-block rounded-md bg-ink px-3 py-1.5 font-sans text-sm font-medium text-white')}>
                    {b.text || <span className="text-muted italic">empty</span>}
                  </div>
                )}
                {!editing && b.evidence && b.evidence.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {b.evidence.slice(0, 3).map((e, i) => (
                      <span key={i} title={e.note} className="max-w-[260px] truncate rounded bg-canvas px-1.5 py-0.5 text-[10px] text-muted">↳ {e.kind}: {e.note}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {s.rationale && !editing && <div className="border-t border-line pt-2 text-xs text-muted">Why this section: {s.rationale}</div>}
          </div>
        </section>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------

export function LearningRow({ l, ws }: { l: Learning; ws: Workspace }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <span className={cx('num mt-0.5 w-14 shrink-0 text-right text-sm font-semibold', l.effect >= 0 ? 'text-good' : 'text-bad')}>{signedPct(l.effect)}</span>
      <div className="min-w-0 flex-1">
        <div className="text-sm text-ink">{l.statement}</div>
        <div className="mt-0.5 flex flex-wrap gap-1.5 text-[11px] text-muted">
          <Badge tone={l.confidence === 'high' ? 'good' : l.confidence === 'medium' ? 'warn' : 'neutral'}>{l.confidence} confidence</Badge>
          <Badge tone={l.source === 'experiment' ? 'info' : 'neutral'}>{l.source}</Badge>
          <span>{segmentName(ws, l.segmentId)} · {METRIC_LABELS[l.metric]} · P(better)={Math.round(l.probabilityBetter * 100)}%</span>
        </div>
      </div>
    </div>
  )
}

export function StatusDot({ status }: { status: string }) {
  const map: Record<string, string> = { resolved: 'bg-good', experimenting: 'bg-info', assets_ready: 'bg-warn', solution_proposed: 'bg-warn', investigated: 'bg-warn', detected: 'bg-bad', dismissed: 'bg-line-2' }
  return <span className={cx('inline-block h-2 w-2 rounded-full', map[status] ?? 'bg-line-2')} />
}

export function Arrow() {
  return <ArrowDown size={14} className="mx-auto my-1 text-line-2" />
}

export function Pending() {
  return <CircleDashed size={14} className="text-muted" />
}
