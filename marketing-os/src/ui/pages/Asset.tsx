import { AlertTriangle, Copy, FlaskConical, History, Pencil, RefreshCw, Send, ShieldCheck, Sparkles } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { createVariants, recritique, regenerate } from '../../core/actions.ts'
import { assetTypeLabel, currentVersion } from '../../core/copy/pipeline.ts'
import { LOCAL_TONES } from '../../core/copy/localWriter.ts'
import { designExperiment } from '../../core/experiments/experiments.ts'
import { METRIC_LABELS, formatMetric, primaryRateFor, rateParts, sumMetrics, summarize } from '../../core/performance/metrics.ts'
import { decide, execute, requestApproval, rollback, saveEdit } from '../../core/ops.ts'
import { AD_ANGLE_LABELS } from '../../core/strategy/ads.ts'
import { SEQUENCE_BLUEPRINTS } from '../../core/strategy/email.ts'
import { LANDING_STRATEGY_LABELS } from '../../core/strategy/landing.ts'
import type { AdAngle, AssetContent, LandingStrategy, SequenceKind } from '../../core/types.ts'
import { BriefView, ChainView, CopyView, CritiqueView, EvidenceList, segmentName } from '../components/domain.tsx'
import { CHANNEL_LABELS, fmtDateTime } from '../components/labels.ts'
import { Badge, Button, Diff, Empty, Field, Input, Modal, PageHeader, Select, Sparkline, Tabs, Textarea, cx } from '../components/ui.tsx'
import { dailySeries } from '../lib/perf.ts'
import { useWorkspace } from '../state/WorkspaceContext.tsx'

type Panel = 'why' | 'brief' | 'evidence' | 'critique' | 'performance' | 'versions'
type ModalKind = null | 'tone' | 'audience' | 'strategy' | 'experiment' | 'publish' | 'save'

export function AssetPage() {
  const { id } = useParams()
  const { ws, run, toast, model } = useWorkspace()
  const nav = useNavigate()
  const asset = ws.assets.find((a) => a.id === id)
  const [viewId, setViewId] = useState<string | null>(null)
  const [panel, setPanel] = useState<Panel>('why')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<AssetContent | null>(null)
  const [modal, setModal] = useState<ModalKind>(null)
  const [text, setText] = useState('')
  const [choice, setChoice] = useState('')
  const [angles, setAngles] = useState<AdAngle[]>([])
  const [compareId, setCompareId] = useState<string>('')

  const view = useMemo(() => (asset ? asset.versions.find((v) => v.id === viewId) ?? currentVersion(asset) : undefined), [asset, viewId])
  if (!asset || !view) return <Empty title="Asset not found" />
  const live = asset.versions.find((v) => v.id === asset.publishedVersionId)
  const metric = primaryRateFor(asset.channel)
  const records = ws.performance.filter((r) => r.assetId === asset.id)
  const allEvidence = [...view.content.sections.flatMap((s) => s.blocks.flatMap((b) => b.evidence ?? [])), ...view.brief.evidence]
  const strategyLabel = view.tags?.strategy ? LANDING_STRATEGY_LABELS[view.tags.strategy] : view.params?.sequenceKind ? SEQUENCE_BLUEPRINTS[view.params.sequenceKind].label : view.content.sections.map((s) => s.meta?.angle).filter(Boolean).map((a) => AD_ANGLE_LABELS[a as AdAngle] ?? a).join(' / ')
  const regen = (label: string, overrides: Parameters<typeof regenerate>[2], reason: string) =>
    run(label, async (w, m) => {
      const r = await regenerate(w, asset.id, overrides, reason, m)
      setViewId(null)
      toast(`${reason} → new version created`)
      return r.ws
    })

  const openModal = (k: ModalKind) => {
    setText('')
    setChoice('')
    setAngles([])
    setModal(k)
  }

  const startExperiment = () => {
    const control = live ?? asset.versions[0]
    run('Designing experiment', async (w) => {
      const exp = designExperiment(w, {
        name: `${control.label} vs ${view.label}: ${asset.name}`,
        hypothesis: text || `${view.label} (${strategyLabel}) will beat ${control.label} on ${METRIC_LABELS[metric]}.`,
        metric: view.chain.measurement.primaryMetric,
        segmentId: asset.segmentId,
        channel: asset.channel,
        variants: [
          { key: 'A', label: `${control.label} (control)`, assetId: asset.id, versionId: control.id },
          { key: 'B', label: `${view.label} (challenger)`, assetId: asset.id, versionId: view.id },
        ],
      })
      let next = { ...w, experiments: [exp, ...w.experiments] }
      next = requestApproval(next, { action: 'launch_experiment', title: `Start experiment: ${exp.name}`, description: `50/50 split, ${exp.minSamplePerVariant.toLocaleString()} per variant.`, why: exp.hypothesis, payload: { experimentId: exp.id }, risk: 'low', requestedBy: 'user' })
      toast('Experiment designed — approve it to start.')
      return next
    })
    setModal(null)
  }

  const publish = (now: boolean) => {
    run(now ? 'Publishing' : 'Requesting approval', async (w) => {
      let next = requestApproval(w, { action: asset.channel === 'email' ? 'activate_sequence' : asset.type === 'ad_set' ? 'launch_ads' : 'publish_asset', title: `Publish ${view.label} of “${asset.name}”`, description: `critique ${view.critique?.overall ?? '—'}`, why: text || view.changeReason, payload: { assetId: asset.id, versionId: view.id }, risk: 'low', requestedBy: 'user' })
      if (now) {
        const a = next.approvals[0]
        next = await execute(decide(next, a.id, true), a.id)
        toast(`${view.label} is live.`)
      } else toast('Approval requested.')
      return next
    })
    setModal(null)
  }

  const perVersion = asset.versions.map((v) => ({ v, s: summarize(records.filter((r) => r.versionId === v.id), metric) }))
  const variants = view.content.sections.filter((s) => records.some((r) => r.versionId === view.id && r.variantKey === s.id))

  return (
    <div>
      <PageHeader
        eyebrow={<Link to="/assets" className="hover:underline">Copy studio · {assetTypeLabel(asset.type)} · {CHANNEL_LABELS[asset.channel]}</Link>}
        title={asset.name}
        subtitle={<>Strategy: <b className="text-ink-2">{strategyLabel || '—'}</b> · Audience: <b className="text-ink-2">{segmentName(ws, asset.segmentId)}</b>{asset.derivedFrom ? ` · ${asset.derivedFrom.note}` : ''}</>}
        actions={
          <div className="flex flex-wrap items-center gap-1.5">
            {asset.versions.map((v) => (
              <button key={v.id} onClick={() => { setViewId(v.id); setEditing(false) }} className={cx('rounded-md border px-2 py-1 text-xs font-medium', v.id === view.id ? 'border-ink bg-ink text-white' : 'border-line-2 bg-panel text-ink-2')}>
                {v.label}{v.id === asset.publishedVersionId ? ' ●' : ''}
              </button>
            ))}
          </div>
        }
      />

      {asset.stale && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-md bg-warn-soft px-4 py-2.5 text-sm text-warn">
          <span><AlertTriangle size={14} className="mr-1 inline" /> Out of date: {asset.stale.reason}</span>
          <Button size="sm" onClick={() => regen('Updating to the latest messaging', { messagingModelId: view.chain.messagingModelId }, `Updated to messaging v${asset.stale!.messagingVersion}`)}>Update now</Button>
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-1.5 rounded-lg border border-line bg-panel p-2">
        <Button size="sm" onClick={() => regen('Rewriting from a fresh brief', {}, 'Rewrite')}><RefreshCw size={13} /> Rewrite</Button>
        <Button size="sm" onClick={() => run('Running the critic', (w, m) => recritique(w, asset.id, view.id, m))}><ShieldCheck size={13} /> Critique</Button>
        <Button size="sm" onClick={() => run('Creating alternative concepts', async (w, m) => { const r = await createVariants(w, asset.id, m); toast(`${r.created.length} alternative concept(s) created`); if (r.created[0]) nav(`/assets/${r.created[0].id}`); return r.ws })}><Sparkles size={13} /> Create variants</Button>
        <Button size="sm" onClick={() => openModal('tone')}>Change tone</Button>
        <Button size="sm" onClick={() => openModal('audience')}>Change audience</Button>
        <Button size="sm" onClick={() => openModal('strategy')}>Change strategy</Button>
        <span className="mx-1 w-px bg-line" />
        {editing ? (
          <>
            <Button size="sm" variant="primary" onClick={() => openModal('save')}>Save as new version</Button>
            <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setDraft(null) }}>Cancel</Button>
          </>
        ) : (
          <Button size="sm" onClick={() => { setDraft(view.content); setEditing(true) }}><Pencil size={13} /> Edit</Button>
        )}
        <span className="mx-1 w-px bg-line" />
        <Button size="sm" onClick={() => openModal('experiment')} disabled={!live || live.id === view.id}><FlaskConical size={13} /> Run experiment</Button>
        <Button size="sm" variant="primary" onClick={() => openModal('publish')} disabled={view.id === asset.publishedVersionId}><Send size={13} /> Publish</Button>
        {view.id !== asset.currentVersionId && <Button size="sm" onClick={() => run('Rolling back', async (w) => { const next = rollback(w, asset.id, view.id); setViewId(null); toast(`Restored ${view.label} as a new version`); return next })}><History size={13} /> Roll back to {view.label}</Button>}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_440px]">
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted">
            <Badge tone={view.status === 'published' ? 'good' : view.status === 'retired' ? 'neutral' : 'warn'}>{view.label} · {view.status}</Badge>
            <span>{view.changeSummary} · {view.createdBy === 'ai' ? view.generator : `by ${view.generator}`} · {fmtDateTime(view.createdAt)}</span>
            {view.approvedBy && <span>· approved by {view.approvedBy}</span>}
          </div>
          <div className="mb-4 rounded-lg border border-accent/30 bg-accent-soft/50 p-3.5">
            <div className="label text-accent">Why this approach?</div>
            <div className="mt-1 text-sm text-ink">{view.rationale.summary}</div>
            {view.brief.objections.length > 0 && <div className="mt-1 text-xs text-ink-2">Built around {view.brief.objections.length} recurring objection(s) and {view.brief.evidence.filter((e) => e.kind === 'proof').length} proof point(s) from the Brand Brain.</div>}
          </div>
          <CopyView content={editing && draft ? draft : view.content} editing={editing} onChange={setDraft} />
        </div>

        <div>
          <Tabs<Panel>
            value={panel}
            onChange={setPanel}
            tabs={[
              { id: 'why', label: 'Why' },
              { id: 'brief', label: 'Brief' },
              { id: 'evidence', label: 'Evidence' },
              { id: 'critique', label: `Critique${view.critique ? ` ${view.critique.overall}` : ''}` },
              { id: 'performance', label: 'Results' },
              { id: 'versions', label: `Versions ${asset.versions.length}` },
            ]}
          />
          <div className="pt-4">
            {panel === 'why' && (
              <div className="space-y-5">
                <div>
                  <div className="label mb-2">Decisions</div>
                  <ul className="space-y-2.5">
                    {view.rationale.decisions.map((d, i) => (
                      <li key={i} className="text-sm"><div className="font-medium">{d.decision}</div><div className="text-xs text-ink-2">{d.why}</div></li>
                    ))}
                  </ul>
                </div>
                {view.rationale.alternativesConsidered && view.rationale.alternativesConsidered.length > 0 && (
                  <div>
                    <div className="label mb-2">Alternatives considered</div>
                    <ul className="space-y-1.5 text-sm">
                      {view.rationale.alternativesConsidered.map((a) => <li key={a.option}><span className="font-medium">{a.option}</span> <span className="num text-xs text-muted">score {a.score}</span><div className="text-xs text-muted">{a.why}</div></li>)}
                    </ul>
                  </div>
                )}
                <div>
                  <div className="label mb-2">Strategy → copy chain</div>
                  <ChainView chain={view.chain} ws={ws} />
                </div>
              </div>
            )}
            {panel === 'brief' && <BriefView brief={view.brief} ws={ws} />}
            {panel === 'evidence' && <EvidenceList refs={allEvidence} ws={ws} />}
            {panel === 'critique' && (
              <div>
                <CritiqueView critique={view.critique} before={view.preRevisionCritique} />
                {model.id === 'local' && <div className="mt-3 text-xs text-muted">Connect Claude in Settings to add an independent LLM critic with its own prompt and context.</div>}
              </div>
            )}
            {panel === 'performance' && (
              <div className="space-y-4">
                {records.length === 0 ? (
                  <Empty title="No performance yet">Publish this asset to start collecting data.</Empty>
                ) : (
                  <>
                    <div>
                      <div className="label mb-1">{METRIC_LABELS[metric]} · 7-day rolling</div>
                      <Sparkline width={400} height={60} values={dailySeries(ws, records, metric, 55)} />
                    </div>
                    <table className="w-full text-sm">
                      <thead><tr className="label text-left"><th className="py-1">Version</th><th>{METRIC_LABELS[metric]}</th><th>Volume</th></tr></thead>
                      <tbody>
                        {perVersion.map(({ v, s }) => (
                          <tr key={v.id} className="border-t border-line"><td className="py-1.5">{v.label} {v.id === asset.publishedVersionId && <Badge tone="good">live</Badge>}</td><td className="num">{formatMetric(metric, s.value)}</td><td className="num text-muted">{s.trials?.toLocaleString() ?? '—'}</td></tr>
                        ))}
                      </tbody>
                    </table>
                    {variants.length > 0 && (
                      <div>
                        <div className="label mb-1">By variation ({view.label})</div>
                        <table className="w-full text-sm">
                          <tbody>
                            {variants.map((s) => {
                              const m = sumMetrics(records.filter((r) => r.versionId === view.id && r.variantKey === s.id))
                              const q = rateParts(m, 'qualified_cvr')
                              return <tr key={s.id} className="border-t border-line"><td className="py-1.5">{s.title}</td><td className="num">{formatMetric(metric, rateParts(m, metric) && rateParts(m, metric)!.trials ? rateParts(m, metric)!.successes / rateParts(m, metric)!.trials : null)}</td><td className="num text-xs text-muted">{q && q.trials ? `qual. ${formatMetric('qualified_cvr', q.successes / q.trials)}` : ''}</td></tr>
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
            {panel === 'versions' && (
              <div className="space-y-4">
                <ol className="space-y-3">
                  {[...asset.versions].reverse().map((v) => {
                    const s = summarize(records.filter((r) => r.versionId === v.id), metric)
                    return (
                      <li key={v.id} className={cx('rounded-md border p-3', v.id === view.id ? 'border-ink' : 'border-line')}>
                        <div className="flex items-center justify-between">
                          <button className="font-medium hover:underline" onClick={() => setViewId(v.id)}>{v.label} · {v.changeSummary}</button>
                          <Badge tone={v.status === 'published' ? 'good' : 'neutral'}>{v.status}</Badge>
                        </div>
                        <div className="mt-1 text-xs text-ink-2">Why: {v.changeReason}</div>
                        <div className="mt-0.5 text-xs text-muted">{v.createdBy === 'ai' ? v.generator : `Edited by ${v.generator}`} · {fmtDateTime(v.createdAt)}{v.approvedBy ? ` · approved by ${v.approvedBy}` : ''} · critique {v.critique?.overall ?? '—'}{s.value !== null ? ` · ${METRIC_LABELS[metric]} ${formatMetric(metric, s.value)}` : ''}</div>
                      </li>
                    )
                  })}
                </ol>
                <div>
                  <div className="label mb-1">Compare {view.label} with</div>
                  <Select value={compareId} onChange={(e) => setCompareId(e.target.value)}>
                    <option value="">Choose a version…</option>
                    {asset.versions.filter((v) => v.id !== view.id).map((v) => <option key={v.id} value={v.id}>{v.label} · {v.changeSummary}</option>)}
                  </Select>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <Modal open={Boolean(compareId)} onClose={() => setCompareId('')} title={`What changed: ${asset.versions.find((v) => v.id === compareId)?.label} → ${view.label}`} wide>
        {compareId && (() => {
          const other = asset.versions.find((v) => v.id === compareId)!
          const [a, b] = other.number < view.number ? [other, view] : [view, other]
          const keys = Array.from(new Set([...a.content.sections, ...b.content.sections].map((s) => s.kind)))
          return (
            <div className="space-y-4">
              <div className="text-xs text-muted">{b.label}: {b.changeReason}</div>
              {keys.map((k) => {
                const sa = a.content.sections.find((s) => s.kind === k)
                const sb = b.content.sections.find((s) => s.kind === k)
                const ta = sa?.blocks.map((x) => x.text).join('\n') ?? ''
                const tb = sb?.blocks.map((x) => x.text).join('\n') ?? ''
                return (
                  <div key={k} className="rounded-md border border-line p-3">
                    <div className="label mb-1">{sb?.title ?? sa?.title} {!sa ? '(added)' : !sb ? '(removed)' : ''}</div>
                    <div className="copy-text whitespace-pre-line text-[15px]"><Diff before={ta} after={tb} /></div>
                  </div>
                )
              })}
            </div>
          )
        })()}
      </Modal>

      <Modal open={modal === 'tone'} onClose={() => setModal(null)} title="Change tone">
        <div className="mb-3 flex flex-wrap gap-1.5">
          {LOCAL_TONES.map((t) => <button key={t} onClick={() => setText(t)} className={cx('rounded-full border px-2.5 py-1 text-xs', text === t ? 'border-ink bg-ink text-white' : 'border-line-2')}>{t}</button>)}
        </div>
        <Textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Or describe the tone you want" />
        <div className="mt-2 text-xs text-muted">{model.id === 'local' ? 'The offline composer applies the presets mechanically; connect Claude for free-form direction.' : 'Claude rewrites to this direction within the brand voice rules.'}</div>
        <Button className="mt-4" variant="primary" disabled={!text} onClick={() => { setModal(null); regen('Rewriting in a new tone', { instructions: text }, `Tone: ${text}`) }}>Create new version</Button>
      </Modal>

      <Modal open={modal === 'audience'} onClose={() => setModal(null)} title="Change audience">
        <Field label="Rewrite for"><Select value={choice} onChange={(e) => setChoice(e.target.value)}><option value="">Choose a segment…</option>{ws.brand.segments.filter((s) => s.id !== asset.segmentId).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
        <div className="mt-2 text-xs text-muted">A new brief is built from this segment’s own customer language, objections, proof and learnings.</div>
        <Button className="mt-4" variant="primary" disabled={!choice} onClick={() => { setModal(null); regen('Re-briefing for a new audience', { segmentId: choice, messagingModelId: ws.messaging.find((m) => m.segmentId === choice)?.id }, `Audience → ${segmentName(ws, choice)}`) }}>Create new version</Button>
      </Modal>

      <Modal open={modal === 'strategy'} onClose={() => setModal(null)} title="Change strategy">
        {asset.type === 'landing_page' && (
          <Field label="Page strategy"><Select value={choice} onChange={(e) => setChoice(e.target.value)}><option value="">Choose…</option>{Object.entries(LANDING_STRATEGY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        )}
        {asset.type === 'email_sequence' && (
          <Field label="Sequence"><Select value={choice} onChange={(e) => setChoice(e.target.value)}><option value="">Choose…</option>{Object.values(SEQUENCE_BLUEPRINTS).map((b) => <option key={b.kind} value={b.kind}>{b.label} ({b.stage})</option>)}</Select></Field>
        )}
        {['ad_set', 'creative_concept', 'video_script'].includes(asset.type) && (
          <div className="flex flex-wrap gap-1.5">{(Object.keys(AD_ANGLE_LABELS) as AdAngle[]).map((a) => <button key={a} onClick={() => setAngles((x) => (x.includes(a) ? x.filter((y) => y !== a) : [...x, a]))} className={cx('rounded-full border px-2.5 py-1 text-xs', angles.includes(a) ? 'border-ink bg-ink text-white' : 'border-line-2')}>{AD_ANGLE_LABELS[a]}</button>)}</div>
        )}
        {['social_post', 'carousel', 'thread', 'sales_enablement'].includes(asset.type) && <Field label="Direction"><Input value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. lead with customer stories" /></Field>}
        <Button
          className="mt-4"
          variant="primary"
          onClick={() => {
            setModal(null)
            if (asset.type === 'landing_page' && choice) regen('Rebuilding the page structure', { strategy: choice as LandingStrategy }, `Strategy → ${LANDING_STRATEGY_LABELS[choice as LandingStrategy]}`)
            else if (asset.type === 'email_sequence' && choice) regen('Replanning the sequence', { sequenceKind: choice as SequenceKind }, `Sequence → ${SEQUENCE_BLUEPRINTS[choice as SequenceKind].label}`)
            else if (angles.length) regen('Rewriting around new angles', { angles, variationCount: angles.length }, `Angles → ${angles.map((a) => AD_ANGLE_LABELS[a]).join(', ')}`)
            else if (text) regen('Rewriting', { instructions: text }, text)
          }}
        >
          Create new version
        </Button>
      </Modal>

      <Modal open={modal === 'experiment'} onClose={() => setModal(null)} title="Run experiment">
        <div className="text-sm">Test <b>{view.label}</b> against the live <b>{live?.label}</b> with a 50/50 split on {METRIC_LABELS[view.chain.measurement.primaryMetric]}.</div>
        <Field label="Hypothesis"><Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={`${view.label} (${strategyLabel}) will beat ${live?.label} because…`} /></Field>
        <Button className="mt-4" variant="primary" onClick={startExperiment}>Design experiment & request approval</Button>
      </Modal>

      <Modal open={modal === 'publish'} onClose={() => setModal(null)} title={`Publish ${view.label}`}>
        {view.critique && view.critique.verdict !== 'publishable' && <div className="mb-3 rounded-md bg-warn-soft p-2.5 text-sm text-warn">The critic’s verdict is “{view.critique.verdict}” ({view.critique.overall}). Review the critique before publishing.</div>}
        <Field label="Note (optional)"><Input value={text} onChange={(e) => setText(e.target.value)} /></Field>
        <div className="mt-4 flex gap-2">
          <Button variant="primary" onClick={() => publish(true)}>Approve & publish now</Button>
          <Button onClick={() => publish(false)}>Request approval</Button>
        </div>
        <div className="mt-2 text-xs text-muted">Publishing goes through the {ws.simulation?.enabled ? 'demo connector' : 'configured connector'}; the previous live version is retired, never deleted.</div>
      </Modal>

      <Modal open={modal === 'save'} onClose={() => setModal(null)} title="Save as new version">
        <Field label="What changed and why?"><Input value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Tightened the hero for mobile" /></Field>
        <Button className="mt-4" variant="primary" onClick={() => { setModal(null); run('Saving', async (w) => { const next = saveEdit(w, asset.id, draft ?? view.content, text); setEditing(false); setViewId(null); toast('Saved as a new version. Run the critic before publishing.'); return next }) }}><Copy size={13} /> Save</Button>
      </Modal>
    </div>
  )
}
