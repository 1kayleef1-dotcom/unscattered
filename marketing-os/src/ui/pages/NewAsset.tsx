import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createAsset } from '../../core/actions.ts'
import { assetTypeLabel } from '../../core/copy/pipeline.ts'
import { AD_ANGLE_LABELS } from '../../core/strategy/ads.ts'
import { SEQUENCE_BLUEPRINTS } from '../../core/strategy/email.ts'
import { LANDING_STRATEGY_LABELS } from '../../core/strategy/landing.ts'
import type { AdAngle, AssetType, Channel, GenerationParams, LandingStrategy, SequenceKind, TrafficSource } from '../../core/types.ts'
import { CHANNEL_LABELS } from '../components/labels.ts'
import { Button, Card, Field, Input, PageHeader, Select, Textarea } from '../components/ui.tsx'
import { useWorkspace } from '../state/WorkspaceContext.tsx'

const TYPES: AssetType[] = ['landing_page', 'email_sequence', 'ad_set', 'creative_concept', 'social_post', 'carousel', 'thread', 'video_script', 'sales_enablement']
const CHANNELS_FOR: Record<AssetType, Channel[]> = {
  landing_page: ['web'],
  email_sequence: ['email'],
  ad_set: ['meta', 'linkedin', 'google', 'tiktok', 'youtube'],
  creative_concept: ['meta', 'linkedin', 'tiktok', 'youtube'],
  social_post: ['linkedin', 'x', 'instagram', 'threads'],
  carousel: ['instagram', 'linkedin'],
  thread: ['x', 'threads'],
  video_script: ['tiktok', 'youtube', 'instagram'],
  sales_enablement: ['sales'],
}
const STAGES = ['acquisition', 'conversion', 'retention', 'recovery'] as const

export function NewAssetPage() {
  const { ws, run } = useWorkspace()
  const nav = useNavigate()
  const [type, setType] = useState<AssetType>('landing_page')
  const [channel, setChannel] = useState<Channel>('web')
  const [segmentId, setSegmentId] = useState(ws.brand.segments[0].id)
  const [goal, setGoal] = useState('Grow qualified demo requests')
  const [strategy, setStrategy] = useState<LandingStrategy | ''>('')
  const [traffic, setTraffic] = useState<TrafficSource>('paid_social')
  const [sequenceKind, setSequenceKind] = useState<SequenceKind>('lead_nurture')
  const [angles, setAngles] = useState<AdAngle[]>([])
  const [instructions, setInstructions] = useState('')

  const submit = async () => {
    let id = ''
    const params: GenerationParams = {
      assetType: type,
      channel,
      segmentId,
      goal,
      strategy: strategy || undefined,
      trafficSource: traffic,
      sequenceKind: type === 'email_sequence' ? sequenceKind : undefined,
      angles: angles.length ? angles : undefined,
      instructions: instructions || undefined,
      messagingModelId: ws.messaging.find((m) => m.segmentId === segmentId)?.id,
    }
    await run('Brief → strategy → copy → critique → revise', async (w, m) => {
      const r = await createAsset(w, params, m)
      id = r.asset.id
      return r.ws
    })
    if (id) nav(`/assets/${id}`)
  }

  return (
    <div className="max-w-3xl">
      <PageHeader title="New asset" subtitle="The copywriter builds a marketing brief from the Brand Brain, customer language and past performance, picks a strategy (and explains it), writes, then sends it to a separate critic before you see it." />
      <Card>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Asset">
            <Select value={type} onChange={(e) => { const t = e.target.value as AssetType; setType(t); setChannel(CHANNELS_FOR[t][0]) }}>
              {TYPES.map((t) => <option key={t} value={t}>{assetTypeLabel(t)}</option>)}
            </Select>
          </Field>
          <Field label="Channel">
            <Select value={channel} onChange={(e) => setChannel(e.target.value as Channel)}>
              {CHANNELS_FOR[type].map((c) => <option key={c} value={c}>{CHANNEL_LABELS[c]}</option>)}
            </Select>
          </Field>
          <Field label="Audience">
            <Select value={segmentId} onChange={(e) => setSegmentId(e.target.value)}>
              {ws.brand.segments.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label="Business goal">
            <Input value={goal} onChange={(e) => setGoal(e.target.value)} />
          </Field>
          {type === 'landing_page' && (
            <>
              <Field label="Strategy" hint="Leave on auto to let the engine choose and explain.">
                <Select value={strategy} onChange={(e) => setStrategy(e.target.value as LandingStrategy | '')}>
                  <option value="">Auto (recommended)</option>
                  {Object.entries(LANDING_STRATEGY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
              </Field>
              <Field label="Traffic source">
                <Select value={traffic} onChange={(e) => setTraffic(e.target.value as TrafficSource)}>
                  {(['paid_social', 'paid_search', 'organic_search', 'email', 'referral', 'direct', 'retargeting', 'outbound'] as TrafficSource[]).map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                </Select>
              </Field>
            </>
          )}
          {type === 'email_sequence' && (
            <Field label="Lifecycle sequence">
              <Select value={sequenceKind} onChange={(e) => setSequenceKind(e.target.value as SequenceKind)}>
                {STAGES.map((stage) => (
                  <optgroup key={stage} label={stage}>
                    {Object.values(SEQUENCE_BLUEPRINTS).filter((b) => b.stage === stage).map((b) => <option key={b.kind} value={b.kind}>{b.label}</option>)}
                  </optgroup>
                ))}
              </Select>
            </Field>
          )}
        </div>
        {(type === 'ad_set' || type === 'creative_concept' || type === 'video_script') && (
          <div className="mt-4">
            <div className="label mb-1.5">Angles to include (optional — otherwise ranked by evidence and past performance)</div>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(AD_ANGLE_LABELS) as AdAngle[]).map((a) => (
                <button key={a} onClick={() => setAngles((x) => (x.includes(a) ? x.filter((y) => y !== a) : [...x, a]))} className={`rounded-full border px-2.5 py-1 text-xs ${angles.includes(a) ? 'border-ink bg-ink text-white' : 'border-line-2 text-ink-2'}`}>
                  {AD_ANGLE_LABELS[a]}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="mt-4">
          <Field label="Direction (optional)" hint="Tone, emphasis or constraints. The offline composer applies simple tone changes; Claude follows any direction.">
            <Textarea rows={2} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="e.g. Shorter. Lead with implementation speed." />
          </Field>
        </div>
        <div className="mt-5"><Button variant="primary" onClick={submit}>Generate</Button></div>
      </Card>
    </div>
  )
}
