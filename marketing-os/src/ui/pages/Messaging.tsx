import { useState } from 'react'
import { Link } from 'react-router-dom'
import { propagateMessaging } from '../../core/actions.ts'
import { assetTypeLabel } from '../../core/copy/pipeline.ts'
import { assetsUsing, updateMessaging } from '../../core/messaging/messaging.ts'
import type { MessagingModel } from '../../core/types.ts'
import { segmentName } from '../components/domain.tsx'
import { CHANNEL_LABELS, fmtDate } from '../components/labels.ts'
import { Badge, Button, Card, Empty, Field, Input, PageHeader, Textarea } from '../components/ui.tsx'
import { useWorkspace } from '../state/WorkspaceContext.tsx'

function ModelCard({ m }: { m: MessagingModel }) {
  const { ws, run, toast } = useWorkspace()
  const [editing, setEditing] = useState(false)
  const [core, setCore] = useState(m.coreMessage)
  const [points, setPoints] = useState(m.supportingPoints.join('\n'))
  const [cta, setCta] = useState(m.cta)
  const [reason, setReason] = useState('')
  const assets = assetsUsing(ws, m.id)
  const stale = assets.filter((a) => a.stale)
  return (
    <Card
      title={<>{m.name} <Badge tone="dark">v{m.version}</Badge></>}
      subtitle={`${segmentName(ws, m.segmentId)} · updated ${fmtDate(m.updatedAt)} · ${assets.length} derived asset(s)`}
      action={!editing && <Button size="sm" onClick={() => setEditing(true)}>Edit</Button>}
    >
      {editing ? (
        <div className="space-y-3">
          <Field label="Core message"><Textarea rows={2} className="copy-text" value={core} onChange={(e) => setCore(e.target.value)} /></Field>
          <Field label="Supporting points (one per line)"><Textarea rows={3} value={points} onChange={(e) => setPoints(e.target.value)} /></Field>
          <Field label="CTA"><Input value={cta} onChange={(e) => setCta(e.target.value)} /></Field>
          <Field label="Why is it changing?"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. ROI-led messaging won the page test" /></Field>
          <div className="flex gap-2">
            <Button variant="primary" disabled={!reason} onClick={() => { run('Updating the messaging model', async (w) => updateMessaging(w, m.id, { coreMessage: core, supportingPoints: points.split('\n').filter(Boolean), cta }, reason)); setEditing(false) }}>Save v{m.version + 1}</Button>
            <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="copy-headline text-xl">{m.coreMessage}</div>
          <ul className="list-disc pl-5 text-sm text-ink-2">{m.supportingPoints.map((p) => <li key={p}>{p}</li>)}</ul>
          <div className="text-sm">CTA: <b>{m.cta}</b></div>
          {stale.length > 0 && (
            <div className="flex items-center justify-between gap-3 rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">
              <span>{stale.length} asset(s) still say the old thing.</span>
              <Button size="sm" onClick={() => run(`Updating ${stale.length} assets to v${m.version}`, async (w, model) => { const next = await propagateMessaging(w, m.id, model); toast('All derived assets updated as new versions'); return next })}>Update all consistently</Button>
            </div>
          )}
          <div>
            <div className="label mb-1">Derived assets</div>
            <ul className="space-y-1 text-sm">
              {assets.map((a) => (
                <li key={a.id} className="flex items-center justify-between"><Link to={`/assets/${a.id}`} className="hover:underline">{a.name} <span className="text-xs text-muted">{assetTypeLabel(a.type)} · {CHANNEL_LABELS[a.channel]}</span></Link>{a.stale ? <Badge tone="warn">stale</Badge> : <Badge tone="good">current</Badge>}</li>
              ))}
            </ul>
          </div>
          {m.history.length > 0 && (
            <details>
              <summary className="cursor-pointer text-xs text-accent">History ({m.history.length})</summary>
              <ul className="mt-2 space-y-2 text-sm">{[...m.history].reverse().map((h) => <li key={h.version}><Badge>v{h.version}</Badge> <span className="font-serif">{h.coreMessage}</span><div className="text-xs text-muted">Changed {fmtDate(h.changedAt)}: {h.reason}</div></li>)}</ul>
            </details>
          )}
        </div>
      )}
    </Card>
  )
}

export function MessagingPage() {
  const { ws } = useWorkspace()
  return (
    <div>
      <PageHeader title="Messaging" subtitle="The central messaging model. Every asset records which model and version it was written from, so when the message changes, the landing page, ads, emails, social, retargeting and sales material can all be updated together." />
      {ws.messaging.length === 0 ? <Empty title="No messaging models" /> : <div className="grid gap-6 lg:grid-cols-2">{ws.messaging.map((m) => <ModelCard key={m.id} m={m} />)}</div>}
    </div>
  )
}
