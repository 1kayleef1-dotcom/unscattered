import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { modelFor, type CopyModel } from '../../core/copy/model.ts'
import { createSeedWorkspace } from '../../core/seed/workspace.ts'
import type { Workspace } from '../../core/types.ts'
import { clearWorkspace, loadSettings, loadWorkspace, saveSettings, saveWorkspace, type Settings } from './storage.ts'

interface Toast {
  id: number
  message: string
  tone: 'ok' | 'error' | 'info'
}

interface Ctx {
  ws: Workspace
  setWs: (ws: Workspace) => void
  /** Run an async workspace action with a busy indicator and error handling. */
  run: (label: string, fn: (ws: Workspace, model: CopyModel) => Promise<Workspace>) => Promise<Workspace | undefined>
  busy: string | null
  progress: string | null
  setProgress: (p: string | null) => void
  model: CopyModel
  settings: Settings
  updateSettings: (s: Settings) => void
  toast: (message: string, tone?: Toast['tone']) => void
  toasts: Toast[]
  reset: () => Promise<void>
  storageOk: boolean
}

const WorkspaceCtx = createContext<Ctx | null>(null)

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [ws, setWsState] = useState<Workspace | null>(() => loadWorkspace())
  const [busy, setBusy] = useState<string | null>(null)
  const [progress, setProgress] = useState<string | null>(null)
  const [settings, setSettings] = useState<Settings>(() => loadSettings())
  const [toasts, setToasts] = useState<Toast[]>([])
  const [storageOk, setStorageOk] = useState(true)
  const wsRef = useRef<Workspace | null>(ws)
  const saveTimer = useRef<number | undefined>(undefined)

  const toast = useCallback((message: string, tone: Toast['tone'] = 'ok') => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, message, tone }])
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500)
  }, [])

  const setWs = useCallback((next: Workspace) => {
    wsRef.current = next
    setWsState(next)
    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => setStorageOk(saveWorkspace(next)), 400)
  }, [])

  // First visit: build the demo workspace (async, so it runs after mount).
  useEffect(() => {
    if (!wsRef.current) createSeedWorkspace().then(setWs)
  }, [setWs])

  const model = useMemo(() => modelFor(settings.endpoint || undefined), [settings.endpoint])

  const run = useCallback<Ctx['run']>(
    async (label, fn) => {
      if (!wsRef.current) return undefined
      setBusy(label)
      try {
        const next = await fn(wsRef.current, model)
        setWs(next)
        return next
      } catch (err) {
        toast(`${label} failed: ${(err as Error).message}`, 'error')
        return undefined
      } finally {
        setBusy(null)
        setProgress(null)
      }
    },
    [model, setWs, toast],
  )

  const updateSettings = useCallback((s: Settings) => {
    setSettings(s)
    saveSettings(s)
  }, [])

  const reset = useCallback(async () => {
    clearWorkspace()
    setBusy('Rebuilding the demo workspace')
    const fresh = await createSeedWorkspace()
    setWs(fresh)
    setBusy(null)
  }, [setWs])

  if (!ws) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted">
        <div className="text-center">
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent" />
          Building the demo workspace: 60 days of history, experiments and learnings…
        </div>
      </div>
    )
  }

  return (
    <WorkspaceCtx.Provider value={{ ws, setWs, run, busy, progress, setProgress, model, settings, updateSettings, toast, toasts, reset, storageOk }}>
      {children}
    </WorkspaceCtx.Provider>
  )
}

export function useWorkspace(): Ctx {
  const ctx = useContext(WorkspaceCtx)
  if (!ctx) throw new Error('useWorkspace outside provider')
  return ctx
}
