import type { ButtonHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes, InputHTMLAttributes } from 'react'
import { X } from 'lucide-react'

export function cx(...xs: (string | false | null | undefined)[]): string {
  return xs.filter(Boolean).join(' ')
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'good'

export function Button({ variant = 'secondary', size = 'md', className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' }) {
  const v: Record<Variant, string> = {
    primary: 'bg-ink text-white hover:bg-ink-2 border-ink',
    secondary: 'bg-panel text-ink border-line-2 hover:bg-canvas',
    ghost: 'bg-transparent border-transparent text-ink-2 hover:bg-line/60',
    danger: 'bg-panel text-bad border-bad/30 hover:bg-bad-soft',
    good: 'bg-good text-white border-good hover:opacity-90',
  }
  return (
    <button
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-md border font-medium transition disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-9 px-3.5 text-sm',
        v[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

type Tone = 'neutral' | 'accent' | 'warn' | 'bad' | 'good' | 'info' | 'dark'

export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  const t: Record<Tone, string> = {
    neutral: 'bg-line/70 text-ink-2',
    accent: 'bg-accent-soft text-accent',
    warn: 'bg-warn-soft text-warn',
    bad: 'bg-bad-soft text-bad',
    good: 'bg-good-soft text-good',
    info: 'bg-info-soft text-info',
    dark: 'bg-ink text-white',
  }
  return <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-semibold', t[tone], className)}>{children}</span>
}

export function Card({ children, className, title, action, subtitle }: { children: ReactNode; className?: string; title?: ReactNode; action?: ReactNode; subtitle?: ReactNode }) {
  return (
    <section className={cx('rounded-lg border border-line bg-panel', className)}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-ink">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
          {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  )
}

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="label mb-1">{eyebrow}</div>}
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 max-w-3xl text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Stat({ label, value, delta, hint, tone }: { label: string; value: ReactNode; delta?: number; hint?: ReactNode; tone?: 'good' | 'bad' }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className="num mt-1 text-xl font-semibold text-ink">{value}</div>
      {delta !== undefined && (
        <div className={cx('num text-xs font-medium', (tone ?? (delta >= 0 ? 'good' : 'bad')) === 'good' ? 'text-good' : 'text-bad')}>
          {delta >= 0 ? '▲' : '▼'} {Math.abs(delta * 100).toFixed(0)}% w/w
        </div>
      )}
      {hint && <div className="text-xs text-muted">{hint}</div>}
    </div>
  )
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line-2 px-6 py-10 text-center">
      <div className="font-medium text-ink-2">{title}</div>
      {children && <div className="mt-1 text-sm text-muted">{children}</div>}
    </div>
  )
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: ReactNode }[]; value: T; onChange: (id: T) => void }) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={cx('-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium', value === t.id ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink')}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

const fieldCls = 'w-full rounded-md border border-line-2 bg-panel px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-ink focus:outline-none'

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(fieldCls, 'h-9 py-0', className)} {...rest}>
      {children}
    </select>
  )
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(fieldCls, className)} {...rest} />
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(fieldCls, 'h-9', className)} {...rest} />
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="block">
      <span className="label mb-1 block">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  )
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 pt-16" onClick={onClose}>
      <div className={cx('w-full rounded-lg bg-panel shadow-xl', wide ? 'max-w-5xl' : 'max-w-lg')} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h3 className="font-semibold">{title}</h3>
          <button onClick={onClose} className="rounded p-1 text-muted hover:bg-line/60" aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

export function Sparkline({ values, width = 96, height = 28, tone = 'accent' }: { values: number[]; width?: number; height?: number; tone?: 'accent' | 'bad' | 'good' }) {
  if (values.length < 2) return <svg width={width} height={height} />
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * width},${height - 2 - ((v - min) / span) * (height - 4)}`).join(' ')
  const color = tone === 'bad' ? 'var(--color-bad)' : tone === 'good' ? 'var(--color-good)' : 'var(--color-accent)'
  return (
    <svg width={width} height={height} className="overflow-visible" aria-hidden>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

export function ScoreBar({ value, max = 100, tone }: { value: number; max?: number; tone?: 'good' | 'warn' | 'bad' }) {
  const pct = Math.max(0, Math.min(1, value / max))
  const t = tone ?? (pct >= 0.75 ? 'good' : pct >= 0.55 ? 'warn' : 'bad')
  const color = t === 'good' ? 'bg-good' : t === 'warn' ? 'bg-warn' : 'bg-bad'
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
      <div className={cx('h-full rounded-full', color)} style={{ width: `${pct * 100}%` }} />
    </div>
  )
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cx('inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent', className)} />
}

/** Word-level diff for comparing versions. */
export function Diff({ before, after }: { before: string; after: string }) {
  const a = before.split(/(\s+)/)
  const b = after.split(/(\s+)/)
  const m = a.length
  const n = b.length
  if (m * n > 250_000) return <span>{after}</span>
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0))
  for (let i = m - 1; i >= 0; i -= 1) for (let j = n - 1; j >= 0; j -= 1) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  const out: ReactNode[] = []
  let i = 0
  let j = 0
  let k = 0
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      out.push(<span key={k++}>{a[i]}</span>)
      i += 1
      j += 1
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push(<del key={k++} className="bg-bad-soft text-bad decoration-bad/60">{a[i]}</del>)
      i += 1
    } else {
      out.push(<ins key={k++} className="bg-good-soft text-good no-underline">{b[j]}</ins>)
      j += 1
    }
  }
  while (i < m) out.push(<del key={k++} className="bg-bad-soft text-bad">{a[i++]}</del>)
  while (j < n) out.push(<ins key={k++} className="bg-good-soft text-good no-underline">{b[j++]}</ins>)
  return <>{out}</>
}
