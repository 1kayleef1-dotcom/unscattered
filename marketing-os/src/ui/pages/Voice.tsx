import { useState } from 'react'
import { reindexLanguage } from '../../core/actions.ts'
import { INSIGHT_KIND_LABELS } from '../../core/language/customerLanguage.ts'
import type { InsightKind, SourceKind } from '../../core/types.ts'
import { newId } from '../../core/util/id.ts'
import { segmentName } from '../components/domain.tsx'
import { SOURCE_LABELS, fmtDate } from '../components/labels.ts'
import { Badge, Button, Card, Field, Input, PageHeader, Select, Tabs, Textarea } from '../components/ui.tsx'
import { useWorkspace } from '../state/WorkspaceContext.tsx'

type Tab = 'insights' | 'phrases' | 'sources'

export function VoicePage() {
  const { ws, run, toast } = useWorkspace()
  const [tab, setTab] = useState<Tab>('insights')
  const [kind, setKind] = useState<InsightKind | 'all'>('all')
  const [seg, setSeg] = useState('')
  const [form, setForm] = useState({ kind: 'sales_call' as SourceKind, title: '', text: '', segmentId: ws.brand.segments[0].id, customer: '' })
  const insights = ws.language.insights.filter((i) => (kind === 'all' || i.kind === kind) && (!seg || i.segmentIds.includes(seg)))
  const rising = ws.language.insights.filter((i) => i.trend >= 2 && i.frequency >= 3).slice(0, 4)

  const add = () =>
    run('Adding source and re-indexing customer language', async (w, m) => {
      const src = { id: newId('src'), kind: form.kind, title: form.title || `${SOURCE_LABELS[form.kind]} — ${form.customer || 'new'}`, text: form.text, date: w.now, segmentId: form.segmentId, customer: form.customer || undefined }
      const r = await reindexLanguage({ ...w, sources: [src, ...w.sources] }, m)
      toast(r.note)
      setForm({ ...form, title: '', text: '', customer: '' })
      return r.ws
    })

  return (
    <div>
      <PageHeader
        title="Customer language"
        subtitle={`What customers actually say, extracted from ${ws.sources.length} reviews, calls, tickets, surveys, CRM notes, emails, chats and testimonials. Copy prefers these words over invented marketing language.`}
        actions={<Button onClick={() => run('Re-indexing', async (w, m) => { const r = await reindexLanguage(w, m); toast(r.note); return r.ws })}>Re-index</Button>}
      />
      {rising.length > 0 && (
        <div className="mb-6 grid gap-3 md:grid-cols-4">
          {rising.map((i) => (
            <div key={i.id} className="rounded-lg border border-warn/30 bg-warn-soft p-3">
              <div className="text-[11px] font-semibold uppercase text-warn">Rising · {INSIGHT_KIND_LABELS[i.kind]}</div>
              <div className="mt-0.5 font-medium">{i.theme}</div>
              <div className="num text-xs text-warn">{i.frequency} mentions · ×{i.trend.toFixed(1)} vs prior 30 days</div>
            </div>
          ))}
        </div>
      )}
      <Tabs<Tab> value={tab} onChange={setTab} tabs={[{ id: 'insights', label: `Insights (${ws.language.insights.length})` }, { id: 'phrases', label: 'Phrases & competitors' }, { id: 'sources', label: `Sources (${ws.sources.length})` }]} />
      <div className="pt-5">
        {tab === 'insights' && (
          <>
            <div className="mb-4 flex flex-wrap gap-2">
              <Select className="w-56" value={kind} onChange={(e) => setKind(e.target.value as InsightKind | 'all')}>
                <option value="all">All kinds</option>
                {(Object.keys(INSIGHT_KIND_LABELS) as InsightKind[]).map((k) => <option key={k} value={k}>{INSIGHT_KIND_LABELS[k]}</option>)}
              </Select>
              <Select className="w-56" value={seg} onChange={(e) => setSeg(e.target.value)}>
                <option value="">All segments</option>
                {ws.brand.segments.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {insights.map((i) => (
                <Card key={i.id} title={<>{i.theme} <Badge tone={i.kind === 'objection' || i.kind === 'reason_rejected' ? 'warn' : i.kind === 'pain' ? 'bad' : i.kind === 'reason_chose' ? 'good' : 'accent'}>{INSIGHT_KIND_LABELS[i.kind]}</Badge></>} subtitle={`${i.frequency} source(s) · trend ×${i.trend.toFixed(1)} · ${i.segmentIds.map((s) => segmentName(ws, s)).join(', ')}`}>
                  <ul className="space-y-2">
                    {i.quotes.slice(0, 4).map((q, k) => (
                      <li key={k} className="border-l-2 border-line-2 pl-3"><div className="font-serif text-[15px]">“{q.text}”</div><div className="text-[11px] text-muted">{SOURCE_LABELS[q.sourceKind]} · {fmtDate(q.date)}</div></li>
                    ))}
                  </ul>
                </Card>
              ))}
            </div>
          </>
        )}
        {tab === 'phrases' && (
          <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
            <Card title="Recurring customer phrases" subtitle="Said by 2+ different customers.">
              <div className="flex flex-wrap gap-2">
                {ws.language.phrases.map((p) => <span key={p.text} className="rounded-md bg-accent-soft px-2 py-1 font-serif text-accent" style={{ fontSize: `${13 + Math.min(8, p.count * 2)}px` }}>{p.text} <span className="font-sans text-[10px] text-muted">×{p.count}</span></span>)}
              </div>
            </Card>
            <Card title="Competitors mentioned">
              <ul className="space-y-1.5 text-sm">{Object.entries(ws.language.competitorMentions).sort((a, b) => b[1] - a[1]).map(([n, c]) => <li key={n} className="flex justify-between"><span>{n}</span><span className="num font-semibold">{c}</span></li>)}</ul>
            </Card>
          </div>
        )}
        {tab === 'sources' && (
          <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
            <Card title="Add a source" subtitle="Paste a review, call transcript, ticket, survey answer or CRM note.">
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Type"><Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as SourceKind })}>{(Object.keys(SOURCE_LABELS) as SourceKind[]).map((k) => <option key={k} value={k}>{SOURCE_LABELS[k]}</option>)}</Select></Field>
                  <Field label="Segment"><Select value={form.segmentId} onChange={(e) => setForm({ ...form, segmentId: e.target.value })}>{ws.brand.segments.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
                </div>
                <Field label="Customer (optional)"><Input value={form.customer} onChange={(e) => setForm({ ...form, customer: e.target.value })} /></Field>
                <Field label="Text"><Textarea rows={6} value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} /></Field>
                <Button variant="primary" disabled={form.text.trim().length < 20} onClick={add}>Add & re-index</Button>
              </div>
            </Card>
            <Card title="Sources">
              <ul className="divide-y divide-line">
                {ws.sources.map((s) => (
                  <li key={s.id} className="py-2.5">
                    <div className="flex flex-wrap items-center gap-2"><Badge>{SOURCE_LABELS[s.kind]}</Badge><span className="text-sm font-medium">{s.title}</span>{s.outcome && <Badge tone={s.outcome === 'won' ? 'good' : s.outcome === 'lost' ? 'bad' : 'neutral'}>{s.outcome}</Badge>}<span className="text-xs text-muted">{fmtDate(s.date)} · {s.segmentId ? segmentName(ws, s.segmentId) : '—'}</span></div>
                    <div className="mt-1 font-serif text-[14px] text-ink-2">{s.text}</div>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
