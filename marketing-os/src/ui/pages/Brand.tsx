import { useState } from 'react'
import { Link } from 'react-router-dom'
import { currentVersion } from '../../core/copy/pipeline.ts'
import { METRIC_LABELS, formatMetric, primaryRateFor, rateParts, sumMetrics, summarize } from '../../core/performance/metrics.ts'
import type { BrandBrain, Claim, MetricKey, Workspace } from '../../core/types.ts'
import { newId } from '../../core/util/id.ts'
import { signedPct } from '../../core/util/stats.ts'
import { segmentName } from '../components/domain.tsx'
import { Badge, Button, Card, Field, Input, PageHeader, Select, Tabs, Textarea } from '../components/ui.tsx'
import { useWorkspace } from '../state/WorkspaceContext.tsx'

type Tab = 'positioning' | 'offers' | 'audience' | 'voice' | 'proof' | 'competitors' | 'memory'

export function BrandPage() {
  const { ws, setWs } = useWorkspace()
  const [tab, setTab] = useState<Tab>('positioning')
  const b = ws.brand
  const save = (patch: Partial<BrandBrain>) => setWs({ ...ws, brand: { ...b, ...patch, updatedAt: ws.now } })
  return (
    <div>
      <PageHeader title="Brand brain" subtitle={`Everything ${b.company} knows about itself. Every brief, strategy decision and critique reads from here; performance memory writes back to it.`} />
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'positioning', label: 'Positioning' },
          { id: 'offers', label: `Offers (${b.offers.length})` },
          { id: 'audience', label: `Segments & personas (${b.segments.length})` },
          { id: 'voice', label: 'Voice' },
          { id: 'proof', label: `Proof & claims (${b.proof.length})` },
          { id: 'competitors', label: `Competitors (${b.competitors.length})` },
          { id: 'memory', label: 'Performance memory' },
        ]}
      />
      <div className="pt-6">
        {tab === 'positioning' && <Positioning b={b} save={save} />}
        {tab === 'offers' && (
          <div className="grid gap-4 md:grid-cols-2">
            {b.offers.map((o) => (
              <Card key={o.id} title={o.name} subtitle={`${o.kind.replace('_', ' ')} · ${o.priceTier} · ${o.purchaseComplexity} purchase`}>
                <div className="text-sm text-ink-2">{o.description}</div>
                {o.price && <div className="mt-2 text-sm">Price: <b>${o.price.amount.toLocaleString()}</b> / {o.price.period}</div>}
                {o.guarantee && <div className="mt-1 text-sm">Guarantee: {o.guarantee}</div>}
                <div className="mt-1 text-sm">CTA: <b>{o.cta}</b></div>
                {o.outcomes.length > 0 && <ul className="mt-2 list-disc pl-5 text-sm">{o.outcomes.map((x) => <li key={x}>{x}</li>)}</ul>}
                {o.features.length > 0 && <ul className="mt-2 space-y-1 text-xs text-muted">{o.features.map((f) => <li key={f.name}><b className="text-ink-2">{f.name}</b> → {f.benefit}</li>)}</ul>}
              </Card>
            ))}
          </div>
        )}
        {tab === 'audience' && (
          <div className="grid gap-4 md:grid-cols-2">
            {b.segments.map((s) => (
              <Card key={s.id} title={s.name} subtitle={`${s.priority} · awareness: ${s.awareness.replace('_', ' ')} · sophistication ${s.sophistication}/5`}>
                <div className="text-sm text-ink-2">{s.description}</div>
                <div className="mt-2 flex flex-wrap gap-1">{[...s.industries, ...s.jobTitles].map((x) => <Badge key={x}>{x}</Badge>)}</div>
                {b.personas.filter((p) => p.segmentId === s.id).map((p) => (
                  <div key={p.id} className="mt-3 rounded-md bg-canvas p-3 text-sm">
                    <div className="font-medium">{p.name} <span className="text-xs text-muted">· {p.role}</span></div>
                    <div className="mt-1 font-serif italic text-ink-2">“{p.quote}”</div>
                    <div className="mt-1 text-xs"><b>Goals:</b> {p.goals.join('; ')}</div>
                    <div className="text-xs"><b>Fears:</b> {p.fears.join('; ')}</div>
                  </div>
                ))}
              </Card>
            ))}
          </div>
        )}
        {tab === 'voice' && <Voice b={b} save={save} />}
        {tab === 'proof' && <ProofClaims b={b} save={save} />}
        {tab === 'competitors' && (
          <div className="grid gap-4 md:grid-cols-2">
            {b.competitors.map((c) => (
              <Card key={c.id} title={c.name} subtitle={`${c.kind.replace('_', ' ')} · mentioned ${ws.language.competitorMentions[c.name] ?? 0}× by customers`}>
                <div className="text-sm text-ink-2">{c.positioning}</div>
                <div className="mt-2 grid grid-cols-2 gap-3 text-xs">
                  <div><div className="label">Strengths</div><ul className="list-disc pl-4">{c.strengths.map((x) => <li key={x}>{x}</li>)}</ul></div>
                  <div><div className="label">Weaknesses</div><ul className="list-disc pl-4">{c.weaknesses.map((x) => <li key={x}>{x}</li>)}</ul></div>
                </div>
              </Card>
            ))}
          </div>
        )}
        {tab === 'memory' && <Memory />}
      </div>
    </div>
  )
}

function Positioning({ b, save }: { b: BrandBrain; save: (p: Partial<BrandBrain>) => void }) {
  const [p, setP] = useState(b.positioning)
  const [mission, setMission] = useState(b.mission)
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      <Card title="Positioning">
        <div className="space-y-3">
          {(['category', 'forWho', 'problem', 'alternative', 'differentiator'] as const).map((k) => (
            <Field key={k} label={{ category: 'Category', forWho: 'For who', problem: 'Problem', alternative: 'Alternative', differentiator: 'Differentiator' }[k]}>
              <Input value={p[k]} onChange={(e) => setP({ ...p, [k]: e.target.value })} />
            </Field>
          ))}
          <Field label="Positioning statement"><Textarea rows={3} className="copy-text" value={p.statement} onChange={(e) => setP({ ...p, statement: e.target.value })} /></Field>
          <Field label="Mission"><Input value={mission} onChange={(e) => setMission(e.target.value)} /></Field>
          <Button variant="primary" onClick={() => save({ positioning: p, mission })}>Save</Button>
        </div>
      </Card>
      <Card title="Messaging pillars">
        <ul className="space-y-3">
          {b.pillars.map((x) => (
            <li key={x.id}><div className="font-medium">{x.name}</div><div className="text-sm text-ink-2">{x.statement}</div><div className="mt-1 text-xs text-muted">Proof: {x.proofIds.map((id) => b.proof.find((p) => p.id === id)?.title).join(' · ')}</div></li>
          ))}
        </ul>
      </Card>
    </div>
  )
}

function ListEditor({ label, items, onChange }: { label: string; items: string[]; onChange: (x: string[]) => void }) {
  const [v, setV] = useState('')
  return (
    <div>
      <div className="label mb-1">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((i) => <button key={i} onClick={() => onChange(items.filter((x) => x !== i))} className="rounded bg-canvas px-2 py-0.5 text-sm hover:line-through" title="Remove">{i}</button>)}
      </div>
      <div className="mt-2 flex gap-2"><Input value={v} onChange={(e) => setV(e.target.value)} placeholder="Add…" /><Button size="sm" onClick={() => { if (v.trim()) { onChange([...items, v.trim()]); setV('') } }}>Add</Button></div>
    </div>
  )
}

function Voice({ b, save }: { b: BrandBrain; save: (p: Partial<BrandBrain>) => void }) {
  const v = b.voice
  const set = (patch: Partial<BrandBrain['voice']>) => save({ voice: { ...v, ...patch } })
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card title="Voice & tone" subtitle="The critic enforces these on every asset.">
        <div className="space-y-4">
          <div className="text-sm"><span className="label">Tone</span><div>{v.tone}</div></div>
          <ListEditor label="Traits" items={v.traits} onChange={(traits) => set({ traits })} />
          <ListEditor label="Words to use" items={v.wordsToUse} onChange={(wordsToUse) => set({ wordsToUse })} />
          <ListEditor label="Words to avoid" items={v.wordsToAvoid} onChange={(wordsToAvoid) => set({ wordsToAvoid })} />
          <div className="text-sm"><span className="label">Target reading grade</span> {v.targetReadingGrade} · <span className="label">Formality</span> {v.formality}/5</div>
        </div>
      </Card>
      <Card title="Rules & exemplars">
        <ul className="list-disc space-y-1 pl-5 text-sm">{v.rules.map((r) => <li key={r}>{r}</li>)}</ul>
        <div className="mt-4 space-y-3">
          {v.exemplars.map((e) => <div key={e.text} className="rounded-md bg-canvas p-3"><div className="copy-text">{e.text}</div><div className="text-xs text-muted">{e.note}</div></div>)}
        </div>
      </Card>
    </div>
  )
}

function ProofClaims({ b, save }: { b: BrandBrain; save: (p: Partial<BrandBrain>) => void }) {
  const [text, setText] = useState('')
  const [status, setStatus] = useState<Claim['status']>('needs_proof')
  return (
    <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
      <Card title="Proof" subtitle="The only source of numbers copy may use.">
        <ul className="space-y-3">
          {b.proof.map((p) => (
            <li key={p.id} className="rounded-md border border-line p-3">
              <div className="flex items-center gap-2"><Badge tone="good">{p.kind.replace('_', ' ')}</Badge><span className="font-medium">{p.title}</span></div>
              <div className="mt-1 text-sm text-ink-2">{p.detail}</div>
              <div className="mt-1 text-xs text-muted">{p.metric ? `${p.metric.label}: ${p.metric.value} · ` : ''}Segments: {p.segmentIds.join(', ')}</div>
            </li>
          ))}
        </ul>
      </Card>
      <Card title="Claims" subtitle="Prohibited claims block publishing; unproven ones are flagged.">
        <ul className="space-y-2">
          {b.claims.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
              <span>{c.text}</span>
              <Select className="w-36" value={c.status} onChange={(e) => save({ claims: b.claims.map((x) => (x.id === c.id ? { ...x, status: e.target.value as Claim['status'] } : x)) })}>
                <option value="approved">approved</option>
                <option value="needs_proof">needs proof</option>
                <option value="prohibited">prohibited</option>
              </Select>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex gap-2">
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="New claim…" />
          <Select className="w-36" value={status} onChange={(e) => setStatus(e.target.value as Claim['status'])}><option value="approved">approved</option><option value="needs_proof">needs proof</option><option value="prohibited">prohibited</option></Select>
          <Button onClick={() => { if (text.trim()) { save({ claims: [...b.claims, { id: newId('clm'), text: text.trim(), status, proofIds: [] }] }); setText('') } }}>Add</Button>
        </div>
      </Card>
    </div>
  )
}

/** Successful/failed campaigns and high/low-performing copy, derived from performance — never self-graded. */
function Memory() {
  const { ws } = useWorkspace()
  const rows = ws.assets.flatMap((a) => {
    const metric = primaryRateFor(a.channel)
    const segBase = summarize(ws.performance.filter((r) => r.segmentId === a.segmentId && r.channel === a.channel), metric).value
    return a.versions.flatMap((v) => {
      const sections = v.content.sections.filter((s) => ws.performance.some((r) => r.versionId === v.id && r.variantKey === s.id))
      const units = sections.length ? sections.map((s) => ({ key: s.id, label: `${a.name} ${v.label} · ${s.title}`, lead: s.blocks[0]?.text ?? '', recs: ws.performance.filter((r) => r.versionId === v.id && r.variantKey === s.id) })) : [{ key: v.id, label: `${a.name} ${v.label}`, lead: v.content.sections[0]?.blocks[0]?.text ?? '', recs: ws.performance.filter((r) => r.versionId === v.id) }]
      return units
        .map((u) => {
          const parts = rateParts(sumMetrics(u.recs), metric)
          const rate = parts && parts.trials > 500 ? parts.successes / parts.trials : null
          return { ...u, asset: a, metric, rate, lift: rate !== null && segBase ? rate / segBase - 1 : null }
        })
        .filter((u) => u.rate !== null)
    })
  })
  const top = [...rows].sort((x, y) => (y.lift ?? 0) - (x.lift ?? 0)).slice(0, 5)
  const bottom = [...rows].sort((x, y) => (x.lift ?? 0) - (y.lift ?? 0)).slice(0, 5)
  const concluded = ws.experiments.filter((e) => e.status === 'concluded' && e.result)
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card title="High-performing copy"><ul className="divide-y divide-line">{top.map((r) => <MemoryRow key={r.key} r={r} ws={ws} />)}</ul></Card>
      <Card title="Low-performing copy"><ul className="divide-y divide-line">{bottom.map((r) => <MemoryRow key={r.key} r={r} ws={ws} />)}</ul></Card>
      <Card title="Campaign outcomes" className="lg:col-span-2">
        <ul className="divide-y divide-line">
          {concluded.map((e) => <li key={e.id} className="py-2 text-sm"><Badge tone={e.result!.winner && e.result!.winner !== e.variants[0].key ? 'good' : 'neutral'}>{e.result!.winner ? 'won' : 'no difference'}</Badge> <b>{e.name}</b> — {e.result!.summary}</li>)}
          {ws.assets.filter((a) => a.publishedVersionId).map((a) => {
            const v = currentVersion(a)
            return v.critique && v.critique.overall < 60 ? <li key={a.id} className="py-2 text-sm"><Badge tone="bad">weak</Badge> <b>{a.name}</b> — critique {v.critique.overall}</li> : null
          })}
        </ul>
      </Card>
    </div>
  )
}

interface MemoryUnit {
  key: string
  label: string
  lead: string
  asset: { id: string; segmentId: string }
  metric: MetricKey
  rate: number | null
  lift: number | null
}

function MemoryRow({ r, ws }: { r: MemoryUnit; ws: Workspace }) {
  return (
    <li className="py-2">
      <div className="flex items-center justify-between gap-2"><Link to={`/assets/${r.asset.id}`} className="text-sm font-medium hover:underline">{r.label}</Link><span className={`num text-sm font-semibold ${(r.lift ?? 0) >= 0 ? 'text-good' : 'text-bad'}`}>{signedPct(r.lift ?? 0)}</span></div>
      <div className="line-clamp-2 font-serif text-[14px] text-ink-2">{r.lead}</div>
      <div className="text-xs text-muted">{METRIC_LABELS[r.metric]} {formatMetric(r.metric, r.rate)} vs segment average · {segmentName(ws, r.asset.segmentId)}</div>
    </li>
  )
}
