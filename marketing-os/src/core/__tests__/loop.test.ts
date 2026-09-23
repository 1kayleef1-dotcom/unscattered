import { describe, expect, it } from 'vitest'
import { createAsset, propagateMessaging, regenerate, repurpose } from '../actions.ts'
import { advanceDays } from '../agent/agent.ts'
import { currentVersion, generate } from '../copy/pipeline.ts'
import { RemoteCopyModel } from '../copy/model.ts'
import { updateMessaging } from '../messaging/messaging.ts'
import { decide, execute, rollback } from '../ops.ts'
import { classifyGoal, createCampaignPlan } from '../planner/planner.ts'
import { createSeedWorkspace } from '../seed/workspace.ts'
import { baseWorkspace, NOW } from './helpers.ts'

describe('generation pipeline', () => {
  it('produces critiqued, evidence-linked copy with a full strategy chain', async () => {
    const res = await generate(baseWorkspace(), { assetType: 'landing_page', channel: 'web', segmentId: 'seg_midmarket', goal: 'Demo requests' })
    expect(res.version.critique!.overall).toBeGreaterThan(75)
    expect(res.version.chain.problem).toBeTruthy()
    expect(res.version.chain.measurement.primaryMetric).toBe('qualified_cvr')
    const evidence = res.version.content.sections.flatMap((s) => s.blocks.flatMap((b) => b.evidence ?? []))
    expect(evidence.some((e) => e.kind === 'proof')).toBe(true)
  })

  it('falls back to the offline composer when the Claude proxy is unreachable, and says so', async () => {
    const res = await generate(baseWorkspace(), { assetType: 'email_sequence', channel: 'email', segmentId: 'seg_midmarket', goal: 'x' }, new RemoteCopyModel('http://127.0.0.1:9', 2000))
    expect(res.version.generator).toMatch(/fallback/)
    expect(res.version.content.sections.length).toBeGreaterThan(2)
    expect(res.log.join(' ')).toMatch(/fell back/)
  })

  it('never overwrites: regenerate and rollback both append versions', async () => {
    let { ws, asset } = await createAsset(baseWorkspace(), { assetType: 'landing_page', channel: 'web', segmentId: 'seg_midmarket', goal: 'test' })
    ws = (await regenerate(ws, asset.id, { strategy: 'problem_led' }, 'Try problem-led')).ws
    const v2 = ws.assets.find((a) => a.id === asset.id)!
    expect(v2.versions).toHaveLength(2)
    expect(currentVersion(v2).tags?.strategy).toBe('problem_led')
    ws = rollback(ws, asset.id, v2.versions[0].id)
    const v3 = ws.assets.find((a) => a.id === asset.id)!
    expect(v3.versions).toHaveLength(3)
    expect(currentVersion(v3).content).toEqual(v2.versions[0].content)
    expect(currentVersion(v3).changeSummary).toMatch(/Rollback to V1/)
  })

  it('refuses to execute anything that has not been approved', async () => {
    const seeded = await createSeedWorkspace(NOW)
    const pending = seeded.approvals.find((a) => a.status === 'pending')!
    const after = await execute(seeded, pending.id)
    expect(after).toBe(seeded)
  })
})

describe('the autonomous loop on the demo business', () => {
  it('detects the drop, finds the economic-value cause, and prepares a gated fix', async () => {
    const ws = await createSeedWorkspace(NOW)
    const problem = ws.problems[0]
    expect(problem.title).toMatch(/Qualified conversion dropped/)
    const traffic = problem.investigation.find((s) => s.kind === 'traffic_mix')!
    expect(traffic.implicates).toBe(false)
    expect(problem.investigation.find((s) => s.kind === 'device_breakdown')!.implicates).toBe(true)
    expect(problem.hypotheses[0].statement).toMatch(/economic value/)
    expect(problem.status).toBe('assets_ready')
    expect(ws.approvals.filter((a) => a.status === 'pending').length).toBeGreaterThanOrEqual(3)
    expect(ws.experiments.find((e) => e.problemId === problem.id)!.status).toBe('awaiting_approval')
  })

  it('runs the experiment after approval, learns from it and resolves the problem', async () => {
    let ws = await createSeedWorkspace(NOW)
    for (const a of ws.approvals.filter((x) => x.status === 'pending')) {
      ws = decide(ws, a.id, true)
      ws = await execute(ws, a.id)
    }
    for (let i = 0; i < 3; i += 1) ws = (await advanceDays(ws, 7)).ws
    const problem = ws.problems.find((p) => p.kind === 'anomaly' && p.experimentId)!
    const exp = ws.experiments.find((e) => e.id === problem.experimentId)!
    expect(exp.status).toBe('concluded')
    expect(exp.result!.winner).toBe('B')
    expect(problem.status).toBe('resolved')
    expect(ws.approvals.some((a) => a.status === 'pending' && a.title.startsWith('Roll out winner'))).toBe(true)
    expect(ws.learnings.some((l) => l.segmentId === 'seg_midmarket' && l.dimension === 'strategy' && l.value === 'proof_led' && l.direction === 'strong')).toBe(true)
  }, 30_000)
})

describe('campaign planner', () => {
  it('classifies goals', () => {
    expect(classifyGoal('We are launching our new product next month').kind).toBe('launch')
    expect(classifyGoal('I want to sell this product to dentists')).toMatchObject({ kind: 'new_segment', audience: 'dentists' })
    expect(classifyGoal('Churn is creeping up on renewals').kind).toBe('retention')
  })

  it('investigates a new segment from real evidence and states the gaps', () => {
    const { plan, ws } = createCampaignPlan(baseWorkspace(), 'I want to sell this product to dentists')
    expect(plan.kind).toBe('new_segment')
    expect(plan.proposedSegment).toBeDefined()
    const known = plan.investigation[0].finding
    expect(known).toMatch(/BrightSmile/)
    expect(known).toMatch(/Maple Ridge/)
    expect(plan.gaps.length).toBeGreaterThan(0)
    expect(ws.brand.proof.find((p) => p.id === 'prf_brightsmile')!.segmentIds).toContain(plan.segmentId)
    const types = plan.workstreams.flatMap((w) => w.assets.map((a) => a.type))
    for (const t of ['landing_page', 'ad_set', 'email_sequence', 'social_post', 'creative_concept', 'sales_enablement']) expect(types).toContain(t)
  })
})

describe('multi-channel consistency and repurposing', () => {
  it('flags every derived asset when the core message changes and regenerates them as new versions', async () => {
    const ws0 = baseWorkspace()
    ws0.messaging = [{ id: 'msg_1', name: 'Core', segmentId: 'seg_midmarket', offerId: 'off_platform', version: 1, coreMessage: 'Old message. Old detail.', supportingPoints: [], proofIds: [], cta: 'Book a strategy call', updatedAt: NOW, history: [] }]
    let ws = (await createAsset(ws0, { assetType: 'landing_page', channel: 'web', segmentId: 'seg_midmarket', goal: 'x', messagingModelId: 'msg_1' })).ws
    ws = (await createAsset(ws, { assetType: 'email_sequence', channel: 'email', segmentId: 'seg_midmarket', goal: 'x', messagingModelId: 'msg_1' })).ws
    ws = updateMessaging(ws, 'msg_1', { coreMessage: 'Pays for itself. Payback in under five months.' }, 'Reposition around ROI')
    expect(ws.assets.filter((a) => a.stale)).toHaveLength(2)
    ws = await propagateMessaging(ws, 'msg_1')
    expect(ws.assets.every((a) => !a.stale && a.versions.length === 2 && currentVersion(a).messagingVersion === 2)).toBe(true)
  })

  it('turns one case study into a channel-native ecosystem', async () => {
    const { ws, created } = await repurpose(baseWorkspace(), 'prf_harbor', 'seg_midmarket')
    expect(created).toHaveLength(8)
    expect(new Set(created.map((a) => a.channel)).size).toBeGreaterThanOrEqual(6)
    for (const a of created) {
      expect(a.derivedFrom?.proofId).toBe('prf_harbor')
      const text = currentVersion(a).content.sections.flatMap((s) => s.blocks.map((b) => b.text)).join(' ')
      expect(text, a.name).toMatch(/Harbor|4 days|9 days/)
    }
    expect(ws.assets).toHaveLength(8)
  })
})
