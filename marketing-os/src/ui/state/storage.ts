import type { Workspace } from '../../core/types.ts'

const KEY = 'mos:workspace:v1'
const SETTINGS_KEY = 'mos:settings:v1'

export interface Settings {
  /** Base URL of the Claude proxy (server/). Empty = offline composer. */
  endpoint: string
}

export function loadWorkspace(): Workspace | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const ws = JSON.parse(raw) as Workspace
    return ws.schemaVersion === 1 ? ws : null
  } catch {
    return null
  }
}

/** Returns false when the browser refused to store it (quota, private mode). */
export function saveWorkspace(ws: Workspace): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(ws))
    return true
  } catch {
    return false
  }
}

export function clearWorkspace(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}

export function loadSettings(): Settings {
  const fallback: Settings = { endpoint: (import.meta.env.VITE_MOS_API as string | undefined) ?? '' }
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    return raw ? { ...fallback, ...(JSON.parse(raw) as Settings) } : fallback
  } catch {
    return fallback
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
  } catch {
    // ignore
  }
}
