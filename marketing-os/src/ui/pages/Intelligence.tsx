import { useState } from 'react'
import { DIMENSION_LABELS, intelligenceModel, valueLabel } from '../../core/learning/learning.ts'
import { METRIC_LABELS } from '../../core/performance/metrics.ts'
import type { LearningDimension } from '../../core/types.ts'
import { signedPct } from '../../core/util/stats.ts'
import { LearningRow } from '../components/domain.tsx'
import { Badge, Card, Empty, PageHeader, Tabs, cx } from '../components/ui.tsx'
import { useWorkspace } from '../state/WorkspaceContext.tsx'

export function IntelligencePage() {
  const { ws } = useWorkspace()
  const [seg, setSeg] = useState(ws.brand.segments[0].id)
  const [showAll, setShowAll] = useState(false)
  const model = intelligenceModel(ws, seg)
  const all = ws.learnings.filter((l) => l.segmentId === seg && (showAll || l.confidence !== 'low'))
  const dims = Array.from(new Set(all.map((l) => l.dimension)))
  return (
    <div>
      <PageHeader title="Marketing intelligence" subtitle="What actually works for this business, learned from its own performance: message → audience → channel → creative → result. Generated copy is never assumed to be good; only outcomes move these numbers." />
      <Tabs value={seg} onChange={setSeg} tabs={ws.brand.segments.map((s) => ({ id: s.id, label: s.name }))} />
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Card title={`Segment: ${model.segmentName}`}>
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <div className="label mb-2 text-good">Strong</div>
              {model.strong.length ? <ul className="space-y-1.5 text-sm">{model.strong.slice(0, 6).map((l) => <li key={l.id}><span className="num font-semibold text-good">{signedPct(l.effect)}</span> {valueLabel(l.dimension, l.value)} <span className="text-xs text-muted">({METRIC_LABELS[l.metric]})</span></li>)}</ul> : <div className="text-sm text-muted">Nothing proven yet.</div>}
            </div>
            <div>
              <div className="label mb-2 text-bad">Weak</div>
              {model.weak.length ? <ul className="space-y-1.5 text-sm">{model.weak.slice(0, 6).map((l) => <li key={l.id}><span className="num font-semibold text-bad">{signedPct(l.effect)}</span> {valueLabel(l.dimension, l.value)} <span className="text-xs text-muted">({METRIC_LABELS[l.metric]})</span></li>)}</ul> : <div className="text-sm text-muted">Nothing proven yet.</div>}
            </div>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3">
            {(['strategy', 'angle', 'proof_type', 'cta', 'offer_type', 'theme'] as LearningDimension[]).map((d) => (
              <div key={d} className="rounded-md border border-line p-3">
                <div className="label">Best {DIMENSION_LABELS[d]}</div>
                <div className="mt-1 text-sm font-medium">{model.best[d] ? valueLabel(d, model.best[d]!.value) : <span className="text-muted">not yet known</span>}</div>
                {model.best[d] && <div className="num text-xs text-good">{signedPct(model.best[d]!.effect)} {METRIC_LABELS[model.best[d]!.metric]}</div>}
              </div>
            ))}
          </div>
        </Card>
        <Card title="How learnings are made" subtitle="So you can trust — or challenge — every number.">
          <ul className="space-y-2 text-sm text-ink-2">
            <li>Each performance record is joined to the copy decisions behind it: page strategy, ad angle, proof type, CTA, offer framing, sequence type and message theme.</li>
            <li>Rates are estimated with a Beta posterior shrunk toward the segment’s average, then compared with every other option on the same dimension.</li>
            <li>When two decisions changed together, the learning says so (“confounded”) instead of claiming both.</li>
            <li>Learnings backed by a concluded experiment are marked <Badge tone="info">experiment</Badge>; others are <Badge>observational</Badge>.</li>
            <li>Briefs, strategy selection and angle ranking read these learnings, so the next asset starts from what worked.</li>
          </ul>
        </Card>
      </div>
      <Card className="mt-6" title="All learnings" action={<button className="text-xs text-accent" onClick={() => setShowAll((x) => !x)}>{showAll ? 'Hide low-confidence' : 'Show low-confidence'}</button>}>
        {all.length === 0 ? <Empty title="No learnings for this segment yet" /> : dims.map((d) => (
          <div key={d} className="mb-4">
            <div className="label mb-1">{DIMENSION_LABELS[d]}</div>
            <div className={cx('divide-y divide-line')}>{all.filter((l) => l.dimension === d).map((l) => <LearningRow key={l.id} l={l} ws={ws} />)}</div>
          </div>
        ))}
      </Card>
    </div>
  )
}
