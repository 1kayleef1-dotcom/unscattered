import { describe, expect, it } from 'vitest'
import { buildBrief } from '../brief/brief.ts'
import { rulesCritic, reviseLocally, scoreCritique } from '../critic/critic.ts'
import { bestQuote, insightsFor } from '../language/customerLanguage.ts'
import { evaluateAngles } from '../strategy/ads.ts'
import { planSequence } from '../strategy/email.ts'
import { planLandingPage } from '../strategy/landing.ts'
import type { AssetContent } from '../types.ts'
import { normalCdf, sampleSizePerVariant, twoProportionTest } from '../util/stats.ts'
import { NOW, baseWorkspace } from './helpers.ts'

describe('statistics', () => {
  it('normal CDF matches known values', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 4)
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3)
    expect(normalCdf(-2.576)).toBeCloseTo(0.005, 3)
  })
  it('two-proportion test detects a real difference and ignores noise', () => {
    expect(twoProportionTest(300, 10000, 420, 10000).pValue).toBeLessThan(0.001)
    expect(twoProportionTest(300, 10000, 305, 10000).pValue).toBeGreaterThan(0.5)
  })
  it('sample size grows as the detectable effect shrinks', () => {
    expect(sampleSizePerVariant(0.03, 0.1)).toBeGreaterThan(sampleSizePerVariant(0.03, 0.3))
  })
})

describe('customer language engine', () => {
  const ws = baseWorkspace()
  it('finds the rising price/ROI objection in recent sales conversations', () => {
    const objections = insightsFor(ws.language, { kinds: ['objection'], segmentId: 'seg_midmarket' })
    const roi = objections.find((i) => i.theme === 'Unclear ROI')
    expect(roi).toBeDefined()
    expect(roi!.frequency).toBeGreaterThanOrEqual(5)
    expect(roi!.trend).toBeGreaterThan(2)
  })
  it('picks an on-theme verbatim quote', () => {
    const price = ws.language.insights.find((i) => i.kind === 'objection' && i.theme === 'Price')!
    expect(bestQuote(price)!.text).toMatch(/expensive|price|cost/i)
  })
  it('detects competitor mentions through aliases', () => {
    expect(ws.language.competitorMentions['Spreadsheets and email']).toBeGreaterThan(0)
    expect(ws.language.competitorMentions.Billnest).toBeGreaterThan(0)
  })
})

describe('brief builder', () => {
  it('grounds every section in evidence and merges objections with the same answer', () => {
    const brief = buildBrief(baseWorkspace(), { segmentId: 'seg_midmarket', channel: 'web', goal: 'test' })
    expect(brief.problemQuote).toBeTruthy()
    expect(brief.evidence.length).toBeGreaterThan(5)
    const themes = brief.objections.map((o) => o.theme)
    expect(themes.some((t) => t.includes('Unclear ROI') && t.includes('Price'))).toBe(true)
  })
  it('flags gaps instead of inventing proof', () => {
    const ws = baseWorkspace()
    ws.brand.proof = ws.brand.proof.filter((p) => !p.segmentIds.includes('seg_enterprise'))
    const brief = buildBrief(ws, { segmentId: 'seg_enterprise', channel: 'web', goal: 'test' })
    expect(brief.proof).toHaveLength(0)
    expect(brief.gaps.join(' ')).toMatch(/No proof/)
  })
})

describe('strategy engines', () => {
  const ws = baseWorkspace()
  const offer = ws.brand.offers[0]
  it('chooses proof-led for a sophisticated, product-aware enterprise buyer and explains why', () => {
    const brief = buildBrief(ws, { segmentId: 'seg_enterprise', channel: 'web', goal: 'test' })
    const plan = planLandingPage({ brief, offer, trafficSource: 'outbound', learnings: [], competitorMentions: 3 })
    expect(plan.strategy).toBe('proof_led')
    expect(plan.explanation).toMatch(/Proof-led/)
    expect(plan.sections[0].kind).toBe('hero')
    expect(plan.sections.map((s) => s.kind)).not.toContain('pricing')
  })
  it('chooses a problem/education approach for an unaware audience on cold traffic', () => {
    const brief = { ...buildBrief(ws, { segmentId: 'seg_midmarket', channel: 'web', goal: 'test' }), awareness: 'unaware' as const, sophistication: 2 as const }
    const plan = planLandingPage({ brief, offer: { ...offer, priceTier: 'low', purchaseComplexity: 'simple' }, trafficSource: 'paid_social', learnings: [], competitorMentions: 0 })
    expect(['problem_led', 'education_led']).toContain(plan.strategy)
  })
  it('honours a user override but still reports the ranking', () => {
    const brief = buildBrief(ws, { segmentId: 'seg_midmarket', channel: 'web', goal: 'test' })
    const plan = planLandingPage({ brief, offer, trafficSource: 'paid_social', learnings: [], competitorMentions: 0, forced: 'comparison_led' })
    expect(plan.strategy).toBe('comparison_led')
    expect(plan.ranked.length).toBe(7)
  })
  it('builds sequences with a narrative, objection emails, and no invented urgency', () => {
    const brief = buildBrief(ws, { segmentId: 'seg_midmarket', channel: 'email', goal: 'test' })
    const seq = planSequence('sales', brief, { ...offer, guarantee: undefined })
    expect(seq.emails.some((e) => e.job === 'objection')).toBe(true)
    expect(seq.emails.some((e) => e.job === 'urgency')).toBe(false)
    expect(seq.emails.map((e) => e.day)).toEqual([...seq.emails.map((e) => e.day)].sort((a, b) => a - b))
    expect(seq.narrative).toMatch(/→/)
  })
  it('gives every ad angle a hypothesis and refuses angles without evidence', () => {
    const brief = buildBrief(ws, { segmentId: 'seg_midmarket', channel: 'meta', goal: 'test' })
    const angles = evaluateAngles(brief, [], { count: 3 })
    const selected = angles.filter((a) => a.selected)
    expect(selected).toHaveLength(3)
    for (const a of selected) expect(a.hypothesis.length).toBeGreaterThan(20)
    expect(angles.find((a) => a.angle === 'urgency')!.selected).toBe(false)
  })
})

describe('copy critic', () => {
  const ws = baseWorkspace()
  const brief = buildBrief(ws, { segmentId: 'seg_midmarket', channel: 'web', goal: 'test' })
  const hype: AssetContent = {
    sections: [
      { id: 's1', kind: 'hero', title: 'Hero', blocks: [
        { key: 'headline', label: 'Headline', text: 'The revolutionary platform that will revolutionize AP!' },
        { key: 'subheadline', label: 'Sub', text: 'A best-in-class, seamless, end-to-end solution trusted by 500+ companies. Save 10x time with fully autonomous AI accounts payable.' },
        { key: 'cta', label: 'CTA', text: 'Click here for more information about our product' },
      ] },
    ],
  }
  it('catches banned words, prohibited and unsupported claims, hype and weak CTAs', () => {
    const checks = rulesCritic({ content: hype, brief, brand: ws.brand, assetType: 'landing_page' })
    const failed = new Set(checks.filter((c) => !c.passed).map((c) => c.id))
    for (const id of ['banned_words', 'claims', 'unsupported_claims', 'believable', 'cta']) expect(failed.has(id), id).toBe(true)
    expect(scoreCritique(checks, ['rules'], NOW).verdict).toBe('reject')
  })
  it('revises mechanically without inventing anything', () => {
    const checks = rulesCritic({ content: hype, brief, brand: ws.brand, assetType: 'landing_page' })
    const { content, changes } = reviseLocally({ content: hype, brief, brand: ws.brand, assetType: 'landing_page' }, scoreCritique(checks, ['rules'], NOW))
    const text = content.sections.flatMap((s) => s.blocks.map((b) => b.text)).join(' ')
    expect(text).not.toMatch(/seamless|best-in-class|500\+|10x/i)
    expect(content.sections[0].blocks.find((b) => b.key === 'cta')!.text).toBe(brief.cta)
    expect(changes.length).toBeGreaterThan(2)
  })
  it('allows numbers that trace to approved proof', () => {
    const ok: AssetContent = { sections: [{ id: 's1', kind: 'hero', title: 'Hero', blocks: [{ key: 'headline', label: 'H', text: 'Close in 4 days instead of 9. 78% fewer late payments.' }] }] }
    const check = rulesCritic({ content: ok, brief, brand: ws.brand, assetType: 'landing_page' }).find((c) => c.id === 'unsupported_claims')!
    expect(check.passed).toBe(true)
  })
})
