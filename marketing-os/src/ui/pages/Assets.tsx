import { useState } from 'react'
import { Link } from 'react-router-dom'
import { assetTypeLabel, currentVersion } from '../../core/copy/pipeline.ts'
import { LANDING_STRATEGY_LABELS } from '../../core/strategy/landing.ts'
import type { AssetType } from '../../core/types.ts'
import { segmentName } from '../components/domain.tsx'
import { CHANNEL_LABELS, relDays } from '../components/labels.ts'
import { Badge, Button, Empty, PageHeader, Select } from '../components/ui.tsx'
import { useWorkspace } from '../state/WorkspaceContext.tsx'

export function AssetsPage() {
  const { ws } = useWorkspace()
  const [type, setType] = useState<AssetType | ''>('')
  const [seg, setSeg] = useState('')
  const types = Array.from(new Set(ws.assets.map((a) => a.type)))
  const list = ws.assets.filter((a) => (!type || a.type === type) && (!seg || a.segmentId === seg))
  return (
    <div>
      <PageHeader
        title="Copy studio"
        subtitle="Every asset keeps its strategy chain, brief, evidence, critique, versions and performance. Nothing is overwritten."
        actions={<Link to="/assets/new"><Button variant="primary">New asset</Button></Link>}
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <Select className="w-48" value={type} onChange={(e) => setType(e.target.value as AssetType | '')}>
          <option value="">All types</option>
          {types.map((t) => <option key={t} value={t}>{assetTypeLabel(t)}</option>)}
        </Select>
        <Select className="w-56" value={seg} onChange={(e) => setSeg(e.target.value)}>
          <option value="">All segments</option>
          {ws.brand.segments.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
      </div>
      {list.length === 0 ? (
        <Empty title="No assets" />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-panel">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left">
              <tr className="label">
                <th className="px-4 py-2.5 font-semibold">Asset</th>
                <th className="px-4 py-2.5 font-semibold">Audience</th>
                <th className="px-4 py-2.5 font-semibold">Strategy</th>
                <th className="px-4 py-2.5 font-semibold">Versions</th>
                <th className="px-4 py-2.5 font-semibold">Critique</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {list.map((a) => {
                const v = currentVersion(a)
                const live = a.versions.find((x) => x.id === a.publishedVersionId)
                return (
                  <tr key={a.id} className="hover:bg-canvas/60">
                    <td className="px-4 py-2.5">
                      <Link to={`/assets/${a.id}`} className="font-medium text-ink hover:underline">{a.name}</Link>
                      <div className="text-xs text-muted">{assetTypeLabel(a.type)} · {CHANNEL_LABELS[a.channel]} · {relDays(v.createdAt, ws.now)}</div>
                    </td>
                    <td className="px-4 py-2.5 text-ink-2">{segmentName(ws, a.segmentId)}</td>
                    <td className="px-4 py-2.5 text-ink-2">{v.tags?.strategy ? LANDING_STRATEGY_LABELS[v.tags.strategy] : v.params?.sequenceKind?.replaceAll('_', ' ') ?? v.content.sections.map((s) => s.meta?.angle).filter(Boolean).join(', ') ?? '—'}</td>
                    <td className="num px-4 py-2.5">{a.versions.map((x) => x.label).join(' · ')}</td>
                    <td className="px-4 py-2.5"><Badge tone={v.critique?.verdict === 'publishable' ? 'good' : v.critique?.verdict === 'reject' ? 'bad' : 'warn'}>{v.critique?.overall ?? '—'}</Badge></td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {live && <Badge tone="good">live {live.label}</Badge>}
                        {v.id !== a.publishedVersionId && <Badge>{v.label} {v.status}</Badge>}
                        {a.stale && <Badge tone="warn">stale</Badge>}
                        {a.derivedFrom && <Badge tone="info">derived</Badge>}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
