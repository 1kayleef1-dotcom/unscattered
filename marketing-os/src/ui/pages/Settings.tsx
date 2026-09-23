import { useRef, useState } from 'react'
import type { Workspace } from '../../core/types.ts'
import { Badge, Button, Card, Field, Input, PageHeader } from '../components/ui.tsx'
import { useWorkspace } from '../state/WorkspaceContext.tsx'

export function SettingsPage() {
  const { ws, setWs, settings, updateSettings, reset, toast, model } = useWorkspace()
  const [endpoint, setEndpoint] = useState(settings.endpoint)
  const [status, setStatus] = useState<string>('')
  const file = useRef<HTMLInputElement>(null)

  const test = async () => {
    setStatus('Checking…')
    try {
      const res = await fetch(`${endpoint.replace(/\/$/, '')}/api/health`)
      const body = (await res.json()) as { ok?: boolean; model?: string }
      setStatus(res.ok && body.ok ? `Connected · ${body.model ?? 'Claude'}` : `Unexpected response (${res.status})`)
    } catch (err) {
      setStatus(`Could not reach it: ${(err as Error).message}`)
    }
  }

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(ws, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `marketing-os-${ws.brand.company.toLowerCase()}-${ws.now.slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const importJson = async (f: File) => {
    try {
      const parsed = JSON.parse(await f.text()) as Workspace
      if (parsed.schemaVersion !== 1 || !parsed.brand || !Array.isArray(parsed.assets)) throw new Error('Not a Marketing OS workspace file')
      setWs(parsed)
      toast('Workspace imported')
    } catch (err) {
      toast(`Import failed: ${(err as Error).message}`, 'error')
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Settings" />
      <Card title="Copywriter & critic" subtitle="The browser never holds an API key. Run the proxy in server/ (it holds ANTHROPIC_API_KEY) and point this at it.">
        <div className="mb-3 text-sm">Currently: <Badge tone={model.id === 'claude' ? 'good' : 'neutral'}>{model.label}</Badge></div>
        <Field label="Proxy URL" hint="Leave empty for the offline composer. In local dev with `npm run server`, use http://localhost:8787 (or leave /api proxied by Vite and enter the dev server origin).">
          <Input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="http://localhost:8787" />
        </Field>
        <div className="mt-3 flex items-center gap-2">
          <Button variant="primary" onClick={() => { updateSettings({ ...settings, endpoint: endpoint.trim() }); toast(endpoint.trim() ? 'Claude proxy configured' : 'Using the offline composer') }}>Save</Button>
          <Button onClick={test} disabled={!endpoint}>Test connection</Button>
          {status && <span className="text-xs text-muted">{status}</span>}
        </div>
        <ul className="mt-4 list-disc space-y-1 pl-5 text-xs text-muted">
          <li>Writer, reviser, critic and customer-language extractor use separate prompts. The critic never sees the writer’s reasoning.</li>
          <li>If a call fails, the system falls back to the offline composer and records that on the version.</li>
        </ul>
      </Card>
      <Card title="Data" subtitle="Everything is stored in this browser. Export to keep a copy or move it.">
        <div className="flex flex-wrap gap-2">
          <Button onClick={exportJson}>Export workspace (JSON)</Button>
          <Button onClick={() => file.current?.click()}>Import…</Button>
          <input ref={file} type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
        </div>
        <div className="mt-2 text-xs text-muted">The same file can be fed to <code>npm run agent:daily</code> to run the operator on a schedule.</div>
      </Card>
      <Card title="Demo data">
        <div className="text-sm text-ink-2">Performance comes from the demo connector — a simulator with hidden ground truth about how each segment responds — so the whole loop can be exercised without ad or email accounts.</div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="danger" onClick={() => { if (confirm('Discard this workspace and rebuild the demo?')) reset() }}>Reset demo workspace</Button>
          {ws.simulation && <Button onClick={() => setWs({ ...ws, simulation: { ...ws.simulation!, enabled: !ws.simulation!.enabled } })}>{ws.simulation.enabled ? 'Disable' : 'Enable'} demo connector</Button>}
        </div>
      </Card>
    </div>
  )
}
