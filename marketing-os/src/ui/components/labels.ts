import type { Channel, SourceKind } from '../../core/types.ts'

export const CHANNEL_LABELS: Record<Channel, string> = {
  web: 'Web',
  email: 'Email',
  meta: 'Meta',
  google: 'Google',
  linkedin: 'LinkedIn',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  x: 'X',
  instagram: 'Instagram',
  threads: 'Threads',
  sales: 'Sales',
}

export const SOURCE_LABELS: Record<SourceKind, string> = {
  review: 'Review',
  sales_call: 'Sales call',
  support: 'Support',
  survey: 'Survey',
  crm_note: 'CRM note',
  email: 'Email',
  chat: 'Chat',
  testimonial: 'Testimonial',
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export function relDays(iso: string, now: string): string {
  const d = Math.round((new Date(now).getTime() - new Date(iso).getTime()) / 86_400_000)
  if (d <= 0) return 'today'
  if (d === 1) return 'yesterday'
  return `${d}d ago`
}
