import { useState } from 'react'
import { Link } from 'react-router-dom'
import { REPURPOSE_TARGETS, repurpose } from '../../core/actions.ts'
import { assetTypeLabel, currentVersion } from '../../core/copy/pipeline.ts'
import { CHANNEL_LABELS } from '../components/labels.ts'
import { Badge, Button, Card, Empty, Field, PageHeader, Select } from '../components/ui.tsx'
import { useWorkspace } from '../state/WorkspaceContext.tsx'

export function RepurposePage() {
  const { ws, run, toast } = useWorkspace()
  const sources = ws.brand.proof.filter((p) => ['case_study', 'testimonial', 'metric'].includes(p.kind))
  const [proofId, setProofId] = useState(sources[0]?.id ?? '')
  const [segmentId, setSegmentId] = useState(ws.brand.segments[0].id)
  const [picked, setPicked] = useState<string[]>(REPURPOSE_TARGETS.map((t) => t.label))
  const proof = ws.brand.proof.find((p) => p.id === proofId)
  const derived = ws.assets.filter((a) => a.derivedFrom?.proofId)
  const bySource = new Map<string, typeof derived>()
  for (const a of derived) bySource.set(a.derivedFrom!.proofId!, [...(bySource.get(a.derivedFrom!.proofId!) ?? []), a])

  return (
    <div>
      <PageHeader title="Repurpose" subtitle="One strong source becomes a content ecosystem. The underlying message is preserved; format, length, hook and CTA adapt to each channel." />
      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <Card title="Source">
          <div className="space-y-4">
            <Field label="Proof to build from">
              <Select value={proofId} onChange={(e) => setProofId(e.target.value)}>
                {sources.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </Select>
            </Field>
            {proof && <div className="rounded-md bg-canvas p-3 font-serif text-[15px] text-ink-2">{proof.detail}{proof.metric && <div className="mt-1 font-sans text-xs font-semibold text-accent">{proof.metric.label}: {proof.metric.value}</div>}</div>}
            <Field label="Audience">
              <Select value={segmentId} onChange={(e) => setSegmentId(e.target.value)}>
                {ws.brand.segments.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
            <div>
              <div className="label mb-1.5">Outputs</div>
              <div className="grid grid-cols-2 gap-1.5">
                {REPURPOSE_TARGETS.map((t) => (
                  <label key={t.label} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={picked.includes(t.label)} onChange={() => setPicked((x) => (x.includes(t.label) ? x.filter((y) => y !== t.label) : [...x, t.label]))} />
                    {t.label} <span className="text-xs text-muted">{CHANNEL_LABELS[t.params.channel]}</span>
                  </label>
                ))}
              </div>
            </div>
            <Button variant="primary" disabled={!proofId || picked.length === 0} onClick={() => run(`Repurposing into ${picked.length} assets`, async (w, m) => { const r = await repurpose(w, proofId, segmentId, m, REPURPOSE_TARGETS.filter((t) => picked.includes(t.label))); toast(`${r.created.length} assets created from one source`); return r.ws })}>
              Build the ecosystem
            </Button>
          </div>
        </Card>
        <Card title="Ecosystems">
          {bySource.size === 0 ? (
            <Empty title="Nothing repurposed yet" />
          ) : (
            <div className="space-y-5">
              {[...bySource].map(([pid, assets]) => (
                <div key={pid}>
                  <div className="mb-2 font-medium">{ws.brand.proof.find((p) => p.id === pid)?.title}</div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {assets.map((a) => {
                      const v = currentVersion(a)
                      const lead = v.content.sections[0]?.blocks[0]?.text ?? ''
                      return (
                        <Link key={a.id} to={`/assets/${a.id}`} className="rounded-md border border-line p-3 hover:border-line-2">
                          <div className="flex items-center justify-between"><span className="text-xs font-semibold">{assetTypeLabel(a.type)} · {CHANNEL_LABELS[a.channel]}</span><Badge tone={v.critique?.verdict === 'publishable' ? 'good' : 'warn'}>{v.critique?.overall}</Badge></div>
                          <div className="mt-1 line-clamp-3 font-serif text-[14px] text-ink-2">{lead}</div>
                        </Link>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
