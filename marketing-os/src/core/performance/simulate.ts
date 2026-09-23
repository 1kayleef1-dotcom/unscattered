/**
 * Demo data connector.
 *
 * Stands in for ad platforms, the ESP and web analytics so the full loop
 * (execute → measure → learn) can run without external accounts. A
 * `WorldModel` holds ground truth the system is supposed to *discover*:
 * how each segment responds to strategies, angles, proof and offers, plus
 * market events. Swap this module for real connectors in production; the
 * rest of the system only sees `PerformanceRecord`s.
 */
import type { Asset, AssetTags, AssetVersion, Channel, ID, ISODate, PerformanceRecord, TrafficSource, Workspace } from '../types.ts'
import { addDays, toDay } from '../util/dates.ts'
import { tagsForRecord } from '../learning/learning.ts'

export interface WorldEvent {
  label: string
  from: ISODate
  to?: ISODate
  segmentId?: ID
  channel?: Channel
  device?: 'mobile' | 'desktop'
  multiplier: number
  /** Assets whose message theme matches are immune (they address the shift). */
  unlessTheme?: string
}

export interface WorldModel {
  preferences: Record<ID, Partial<Record<keyof AssetTags, Record<string, number>>>>
  events: WorldEvent[]
  dailyVisits: Record<ID, number>
  dailyImpressions: Record<ID, number>
  dailySends: number
}

export function demoWorld(now: ISODate): WorldModel {
  return {
    preferences: {
      seg_midmarket: {
        strategy: { product_led: 0.78, outcome_led: 1.12, proof_led: 1.22, problem_led: 1.05, demo_led: 1.05 },
        angle: { problem: 1.08, outcome: 1.18, proof: 1.12, social_proof: 0.88, objection: 1.25, contrarian: 1.0 },
        offerType: { discount: 0.92 },
      },
      seg_enterprise: {
        strategy: { proof_led: 1.3, demo_led: 1.2, product_led: 0.8 },
        angle: { proof: 1.42, outcome: 0.98, objection: 1.2, social_proof: 1.05, specificity: 1.2 },
        offerType: { discount: 0.66, guarantee: 1.1, value: 1.0 },
      },
    },
    events: [
      { label: 'Price sensitivity shock (mobile)', from: addDays(now, -7), segmentId: 'seg_midmarket', channel: 'web', device: 'mobile', multiplier: 0.58, unlessTheme: 'roi' },
      { label: 'Price sensitivity shock (desktop)', from: addDays(now, -7), segmentId: 'seg_midmarket', channel: 'web', device: 'desktop', multiplier: 0.9, unlessTheme: 'roi' },
    ],
    dailyVisits: { seg_midmarket: 1400, seg_enterprise: 320 },
    dailyImpressions: { seg_midmarket: 24000, seg_enterprise: 9000 },
    dailySends: 90,
  }
}

// --- deterministic randomness -------------------------------------------------

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function rng(seed: string): () => number {
  let a = hash(seed)
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function binomial(n: number, p: number, rand: () => number): number {
  if (n <= 0) return 0
  const mean = n * p
  const sd = Math.sqrt(n * p * (1 - p))
  const u = Math.max(1e-9, rand())
  const v = rand()
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  return Math.max(0, Math.min(n, Math.round(mean + z * sd)))
}

// --- liveness ----------------------------------------------------------------------

/** Which version(s) of an asset receive traffic on a day, with their share. */
export function liveVersions(ws: Workspace, asset: Asset, day: ISODate): { version: AssetVersion; share: number }[] {
  const running = ws.experiments.find(
    (e) => e.startedAt && e.startedAt <= day && (!e.endedAt || e.endedAt >= day) && e.variants.every((v) => v.assetId === asset.id),
  )
  if (running) {
    return running.variants
      .map((v) => ({ version: asset.versions.find((x) => x.id === v.versionId)!, share: v.split }))
      .filter((x) => x.version)
  }
  const published = asset.versions.filter((v) => v.publishedAt && v.publishedAt <= day)
  const latest = published.sort((a, b) => (a.publishedAt! < b.publishedAt! ? 1 : -1))[0]
  if (!latest) return []
  // A version stops receiving traffic once a later version is published.
  return [{ version: latest, share: 1 }]
}

function multiplier(world: WorldModel, segmentId: ID, tags: AssetTags): number {
  const prefs = world.preferences[segmentId] ?? {}
  let m = 1
  for (const [key, table] of Object.entries(prefs) as [keyof AssetTags, Record<string, number>][]) {
    const v = tags[key]
    if (v && table[String(v)]) m *= table[String(v)]
  }
  return m
}

function eventMultiplier(world: WorldModel, day: ISODate, segmentId: ID, channel: Channel, device: string | undefined, tags: AssetTags): number {
  let m = 1
  for (const e of world.events) {
    if (e.from > day || (e.to && e.to < day)) continue
    if (e.segmentId && e.segmentId !== segmentId) continue
    if (e.channel && e.channel !== channel) continue
    if (e.device && e.device !== device) continue
    if (e.unlessTheme && new RegExp(e.unlessTheme, 'i').test(tags.theme ?? '')) continue
    m *= e.multiplier
  }
  return m
}

const WEB_SOURCES: { source: TrafficSource; share: number }[] = [
  { source: 'paid_social', share: 0.5 },
  { source: 'paid_search', share: 0.32 },
  { source: 'email', share: 0.18 },
]
const DEVICES: { device: 'mobile' | 'desktop'; share: number }[] = [
  { device: 'mobile', share: 0.46 },
  { device: 'desktop', share: 0.54 },
]
const BASE = {
  webQualified: 0.031,
  webQualifiedShareOfConversions: 0.62,
  ctr: { meta: 0.011, linkedin: 0.0058, google: 0.038, tiktok: 0.009, youtube: 0.006 } as Record<string, number>,
  adQualified: 0.045,
  open: 0.41,
  click: 0.048,
  unsub: 0.003,
}

/** Simulate one day of performance for every live asset. */
export function simulateDay(ws: Workspace, world: WorldModel, day: ISODate): PerformanceRecord[] {
  const out: PerformanceRecord[] = []
  const d = toDay(day)
  for (const asset of ws.assets) {
    for (const { version, share } of liveVersions(ws, asset, day)) {
      const rand = rng(`${version.id}|${d}`)
      const seg = asset.segmentId
      const rec = (partial: Omit<PerformanceRecord, 'id' | 'assetId' | 'versionId' | 'date' | 'segmentId'>): PerformanceRecord => ({
        id: `perf_${hash(`${version.id}|${d}|${partial.variantKey ?? ''}|${partial.device ?? ''}|${partial.source ?? ''}`).toString(36)}`,
        assetId: asset.id,
        versionId: version.id,
        date: `${d}T12:00:00.000Z`,
        segmentId: seg,
        ...partial,
      })
      if (asset.channel === 'web') {
        const tags = tagsForRecord(asset, version)
        const m = multiplier(world, seg, tags)
        for (const s of WEB_SOURCES) {
          for (const dv of DEVICES) {
            const visits = Math.round((world.dailyVisits[seg] ?? 100) * s.share * dv.share * share)
            const p = Math.min(0.5, BASE.webQualified * m * eventMultiplier(world, day, seg, 'web', dv.device, tags) * (s.source === 'paid_search' ? 1.25 : 1))
            const qualified = binomial(visits, p, rand)
            const conversions = qualified + binomial(visits, p * (1 / BASE.webQualifiedShareOfConversions - 1), rand)
            out.push(rec({ channel: 'web', device: dv.device, source: s.source, metrics: { visits, conversions, qualifiedConversions: qualified } }))
          }
        }
      } else if (asset.channel === 'email') {
        for (const section of version.content.sections) {
          const tags = tagsForRecord(asset, version, section.id)
          const m = multiplier(world, seg, tags)
          const sends = Math.round(world.dailySends * share)
          const opens = binomial(sends, BASE.open, rand)
          const clicks = binomial(sends, Math.min(0.3, BASE.click * m), rand)
          out.push(rec({ channel: 'email', variantKey: section.id, metrics: { sends, opens, emailClicks: clicks, unsubscribes: binomial(sends, BASE.unsub, rand), qualifiedConversions: binomial(clicks, 0.12 * m, rand) } }))
        }
      } else if (asset.type === 'ad_set') {
        const n = version.content.sections.length || 1
        for (const section of version.content.sections) {
          const tags = tagsForRecord(asset, version, section.id)
          const m = multiplier(world, seg, tags)
          const impressions = Math.round(((world.dailyImpressions[seg] ?? 5000) / n) * share)
          const clicks = binomial(impressions, (BASE.ctr[asset.channel] ?? 0.008) * Math.sqrt(m), rand)
          const qualified = binomial(clicks, Math.min(0.5, BASE.adQualified * m), rand)
          const spend = Math.round(impressions * (asset.channel === 'linkedin' ? 0.035 : 0.012))
          out.push(rec({ channel: asset.channel, variantKey: section.id, metrics: { impressions, clicks, visits: clicks, conversions: Math.round(qualified * 1.5), qualifiedConversions: qualified, spend, pipeline: qualified * 18000 } }))
        }
      } else if (['linkedin', 'x', 'instagram', 'threads'].includes(asset.channel)) {
        for (const section of version.content.sections) {
          const impressions = binomial(1800, 0.9, rand)
          out.push(rec({ channel: asset.channel, variantKey: section.id, metrics: { impressions, engagements: binomial(impressions, 0.032, rand), clicks: binomial(impressions, 0.006, rand) } }))
        }
      }
    }
  }
  return out
}

export function simulateRange(ws: Workspace, world: WorldModel, fromDay: ISODate, days: number): PerformanceRecord[] {
  const out: PerformanceRecord[] = []
  for (let i = 0; i < days; i += 1) out.push(...simulateDay(ws, world, addDays(fromDay, i)))
  return out
}
