import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { generatePlanAssets } from '../../core/actions.ts'
import { assetTypeLabel, currentVersion } from '../../core/copy/pipeline.ts'
import { METRIC_LABELS } from '../../core/performance/metrics.ts'
import { GOAL_LABELS, createCampaignPlan } from '../../core/planner/planner.ts'
import { ApprovalCard, EvidenceList, segmentName } from '../components/domain.tsx'
import { CHANNEL_LABELS, fmtDate } from '../components/labels.ts'
import { Badge, Button, Card, Empty, PageHeader, Textarea } from '../components/ui.tsx'
import { useWorkspace } from '../state/WorkspaceContext.tsx'

const EXAMPLES = ['We are launching our new product next month.', 'I want to sell this product to dentists.', 'Get more qualified demos from enterprise finance teams.', 'Win back customers who churned last quarter.']

export function CampaignsPage() {
  const { ws, run } = useWorkspace()
  const [goal, setGoal] = useState('')
  const nav = useNavigate()
  const plan = async (g: string) => {
    let id = ''
    await run('Investigating the goal and planning the campaign', async (w) => {
      const r = createCampaignPlan(w, g)
      id = r.plan.id
      return r.ws
    })
    if (id) nav(`/campaigns/${id}`)
  }
  return (
    <div>
      <PageHeader title="Campaigns" subtitle="Give the operator a business goal. It investigates what the workspace knows, flags what it doesn’t, and plans the whole marketing system — then asks before anything goes live." />
      <Card className="mb-6">
        <div className="label mb-2">Create everything I need</div>
        <Textarea rows={2} value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Describe the goal in plain language…" className="copy-text" />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button variant="primary" disabled={!goal.trim()} onClick={() => plan(goal)}>Plan campaign</Button>
          <span className="text-xs text-muted">Try:</span>
          {EXAMPLES.map((e) => (
            <button key={e} onClick={() => setGoal(e)} className="rounded-full border border-line-2 px-2.5 py-1 text-xs text-ink-2 hover:bg-panel">{e}</button>
          ))}
        </div>
      </Card>
      {ws.plans.length === 0 ? (
        <Empty title="No campaigns yet" />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {ws.plans.map((p) => (
            <Link key={p.id} to={`/campaigns/${p.id}`} className="rounded-lg border border-line bg-panel p-4 hover:border-line-2">
              <div className="flex items-center gap-2"><Badge tone="info">{GOAL_LABELS[p.kind]}</Badge><Badge>{p.status.replaceAll('_', ' ')}</Badge></div>
              <div className="mt-2 font-serif text-lg">{p.goal}</div>
              <div className="text-xs text-muted">{segmentName(ws, p.segmentId)} · {p.workstreams.flatMap((w) => w.assets).length} assets · {fmtDate(p.createdAt)}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

export function CampaignPage() {
  const { id } = useParams()
  const { ws, run, setProgress, toast } = useWorkspace()
  const plan = ws.plans.find((p) => p.id === id)
  if (!plan) return <Empty title="Campaign not found" />
  const messaging = ws.messaging.find((m) => m.id === plan.messagingModelId)
  const all = plan.workstreams.flatMap((w) => w.assets)
  const generated = all.filter((a) => a.assetId).length
  const approvals = ws.approvals.filter((a) => a.payload.assetId && all.some((x) => x.assetId === a.payload.assetId))

  const generateAll = () =>
    run('Writing the campaign', async (w, m) => {
      const next = await generatePlanAssets(w, plan.id, m, (done, total, label) => setProgress(`${done}/${total} ${label}`))
      toast('Campaign assets generated. Review and approve what should go live.')
      return next
    })

  return (
    <div>
      <PageHeader
        eyebrow={<Link to="/campaigns" className="hover:underline">Campaigns · {GOAL_LABELS[plan.kind]}</Link>}
        title={plan.goal}
        subtitle={`${segmentName(ws, plan.segmentId)} · ${generated}/${all.length} assets generated`}
        actions={generated < all.length ? <Button variant="primary" onClick={generateAll}>Generate all {all.length - generated} assets</Button> : <Badge tone="good">All assets generated</Badge>}
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Card title="Investigation" subtitle="What the workspace actually knows about this goal.">
            <div className="space-y-4">
              {plan.investigation.map((q) => (
                <div key={q.question}>
                  <div className="text-sm font-medium">{q.question}</div>
                  <div className="text-sm text-ink-2">{q.finding}</div>
                  {q.evidence.length > 0 && <details className="mt-1"><summary className="cursor-pointer text-xs text-accent">Evidence ({q.evidence.length})</summary><div className="mt-2"><EvidenceList refs={q.evidence} ws={ws} /></div></details>}
                </div>
              ))}
            </div>
            {plan.gaps.length > 0 && (
              <div className="mt-4 rounded-md bg-warn-soft p-3 text-sm text-warn">
                <div className="font-semibold">Gaps & assumptions</div>
                <ul className="mt-1 list-disc pl-4">{plan.gaps.map((g) => <li key={g}>{g}</li>)}</ul>
              </div>
            )}
          </Card>

          <Card title="Strategy">
            <div className="space-y-3 text-sm">
              <div><div className="label">Positioning</div><div className="font-serif text-[16px]">{plan.positioning}</div></div>
              <div><div className="label">Offer recommendation</div><div>{plan.offerRecommendation}</div></div>
              {messaging && (
                <div>
                  <div className="label">Messaging model (v{messaging.version})</div>
                  <div className="font-serif text-[16px]">{messaging.coreMessage}</div>
                  <ul className="mt-1 list-disc pl-4 text-ink-2">{messaging.supportingPoints.map((s) => <li key={s}>{s}</li>)}</ul>
                  <div className="mt-1 text-xs text-muted">CTA: {messaging.cta} · <Link to="/messaging" className="text-accent">edit centrally →</Link></div>
                </div>
              )}
            </div>
          </Card>

          {plan.workstreams.filter((w) => w.assets.length).map((w) => (
            <Card key={w.name} title={w.name} subtitle={w.purpose}>
              <ul className="divide-y divide-line">
                {w.assets.map((a) => {
                  const asset = a.assetId ? ws.assets.find((x) => x.id === a.assetId) : undefined
                  const v = asset ? currentVersion(asset) : undefined
                  return (
                    <li key={a.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <div className="text-sm font-medium">{a.purpose}</div>
                        <div className="text-xs text-muted">{assetTypeLabel(a.type)} · {CHANNEL_LABELS[a.channel]}{a.sequenceKind ? ` · ${a.sequenceKind.replaceAll('_', ' ')}` : ''}{a.dependsOn.length ? ' · after the landing page' : ''}{a.consequential ? ' · needs approval to go live' : ''}</div>
                      </div>
                      {asset && v ? (
                        <Link to={`/assets/${asset.id}`} className="flex shrink-0 items-center gap-2 text-xs">
                          <Badge tone={v.critique?.verdict === 'publishable' ? 'good' : 'warn'}>critique {v.critique?.overall ?? '—'}</Badge>
                          <span className="font-medium text-accent">Open →</span>
                        </Link>
                      ) : (
                        <Badge>planned</Badge>
                      )}
                    </li>
                  )
                })}
              </ul>
            </Card>
          ))}
        </div>

        <div className="space-y-6">
          <Card title="Measurement plan">
            <div className="space-y-2 text-sm">
              <div><span className="label">Primary</span> <div>{METRIC_LABELS[plan.measurement.primary]}</div></div>
              <div><span className="label">Secondary</span> <div>{plan.measurement.secondary.map((m) => METRIC_LABELS[m]).join(', ')}</div></div>
              <div><span className="label">Targets</span><ul className="list-disc pl-4">{plan.measurement.targets.map((t) => <li key={t}>{t}</li>)}</ul></div>
              <div><span className="label">Cadence</span> <div>{plan.measurement.reviewCadence}</div></div>
            </div>
          </Card>
          <Card title={`Approvals (${approvals.filter((a) => a.status === 'pending').length} waiting)`}>
            {approvals.length ? <div className="space-y-2">{approvals.map((a) => <ApprovalCard key={a.id} a={a} compact />)}</div> : <Empty title="Generate assets first" />}
          </Card>
        </div>
      </div>
    </div>
  )
}
