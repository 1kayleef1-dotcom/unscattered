import { Activity, BookOpen, Brain, CheckCircle2, FlaskConical, Gauge, Layers, MessageSquareQuote, PenLine, Radar, Recycle, Settings, Sparkles } from 'lucide-react'
import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { fmtDate } from './labels.ts'
import { cx, Spinner } from './ui.tsx'
import { useWorkspace } from '../state/WorkspaceContext.tsx'

const NAV: { to: string; label: string; icon: ReactNode; group: string }[] = [
  { to: '/', label: 'Command center', icon: <Gauge size={16} />, group: 'Operate' },
  { to: '/problems', label: 'Problem solver', icon: <Radar size={16} />, group: 'Operate' },
  { to: '/approvals', label: 'Approvals', icon: <CheckCircle2 size={16} />, group: 'Operate' },
  { to: '/campaigns', label: 'Campaigns', icon: <Sparkles size={16} />, group: 'Create' },
  { to: '/assets', label: 'Copy studio', icon: <PenLine size={16} />, group: 'Create' },
  { to: '/repurpose', label: 'Repurpose', icon: <Recycle size={16} />, group: 'Create' },
  { to: '/messaging', label: 'Messaging', icon: <Layers size={16} />, group: 'Create' },
  { to: '/experiments', label: 'Experiments', icon: <FlaskConical size={16} />, group: 'Learn' },
  { to: '/intelligence', label: 'Intelligence', icon: <Activity size={16} />, group: 'Learn' },
  { to: '/brand', label: 'Brand brain', icon: <Brain size={16} />, group: 'Know' },
  { to: '/voice', label: 'Customer language', icon: <MessageSquareQuote size={16} />, group: 'Know' },
  { to: '/settings', label: 'Settings', icon: <Settings size={16} />, group: 'System' },
]

export function Layout({ children }: { children: ReactNode }) {
  const { ws, busy, progress, model, toasts, storageOk } = useWorkspace()
  const pending = ws.approvals.filter((a) => a.status === 'pending').length
  const openProblems = ws.problems.filter((p) => !['resolved', 'dismissed'].includes(p.status)).length
  const groups = Array.from(new Set(NAV.map((n) => n.group)))
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-sidebar text-white/80 md:flex">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10">
            <BookOpen size={16} className="text-teal-300" />
          </div>
          <div>
            <div className="text-sm font-semibold text-white">Marketing OS</div>
            <div className="text-[11px] text-white/50">{ws.brand.company}</div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 pb-4">
          {groups.map((g) => (
            <div key={g} className="mb-4">
              <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-white/35">{g}</div>
              {NAV.filter((n) => n.group === g).map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end={n.to === '/'}
                  className={({ isActive }) => cx('flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px]', isActive ? 'bg-white/10 text-white' : 'hover:bg-white/5 hover:text-white')}
                >
                  {n.icon}
                  <span className="flex-1">{n.label}</span>
                  {n.to === '/approvals' && pending > 0 && <span className="rounded bg-amber-400 px-1.5 text-[10px] font-bold text-ink">{pending}</span>}
                  {n.to === '/problems' && openProblems > 0 && <span className="rounded bg-rose-400 px-1.5 text-[10px] font-bold text-ink">{openProblems}</span>}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="border-t border-white/10 px-5 py-3 text-[11px] text-white/50">
          <div>Today · {fmtDate(ws.now)}</div>
          <div className="mt-0.5 flex items-center gap-1.5">
            <span className={cx('h-1.5 w-1.5 rounded-full', model.id === 'claude' ? 'bg-teal-300' : 'bg-white/40')} />
            {model.label}
          </div>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <div className="sticky top-0 z-30 flex items-center gap-3 overflow-x-auto border-b border-line bg-canvas/90 px-4 py-2 backdrop-blur md:hidden">
          {NAV.slice(0, 8).map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => cx('whitespace-nowrap text-xs font-medium', isActive ? 'text-ink' : 'text-muted')}>
              {n.label}
            </NavLink>
          ))}
        </div>
        {!storageOk && <div className="bg-warn-soft px-6 py-2 text-xs text-warn">Your browser refused to save the workspace (storage full or private mode). Changes live in this tab only — export from Settings to keep them.</div>}
        <main className="mx-auto max-w-[1400px] px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
      {busy && (
        <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2.5 rounded-full bg-ink px-4 py-2 text-sm text-white shadow-lg">
          <Spinner /> {busy}
          {progress && <span className="text-white/60">· {progress}</span>}
        </div>
      )}
      <div className="fixed right-4 bottom-4 z-50 flex w-80 flex-col gap-2">
        {toasts.map((t) => (
          <div key={t.id} className={cx('rounded-md px-3 py-2 text-sm shadow-lg', t.tone === 'error' ? 'bg-bad text-white' : t.tone === 'info' ? 'bg-panel text-ink border border-line' : 'bg-ink text-white')}>
            {t.message}
          </div>
        ))}
      </div>
    </div>
  )
}
