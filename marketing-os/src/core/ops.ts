/**
 * Workspace operations. Every function returns a new Workspace; nothing
 * mutates in place, and nothing that matters is ever overwritten.
 */
import { appendVersion, currentVersion } from './copy/pipeline.ts'
import { connectorFor, type Connector } from './execution/connectors.ts'
import { evaluateExperiment } from './experiments/experiments.ts'
import { computeLearnings } from './learning/learning.ts'
import type { ActionKind, ActivityEvent, ApprovalRequest, Asset, AssetContent, AssetVersion, ID, Workspace } from './types.ts'
import { newId } from './util/id.ts'

export function log(ws: Workspace, kind: string, message: string, ref?: ActivityEvent['ref']): Workspace {
  return { ...ws, activity: [{ id: newId('act'), at: ws.now, kind, message, ref }, ...ws.activity].slice(0, 400) }
}

export function upsertAsset(ws: Workspace, asset: Asset): Workspace {
  const exists = ws.assets.some((a) => a.id === asset.id)
  return { ...ws, assets: exists ? ws.assets.map((a) => (a.id === asset.id ? asset : a)) : [asset, ...ws.assets] }
}

export function getAsset(ws: Workspace, id: ID): Asset | undefined {
  return ws.assets.find((a) => a.id === id)
}

/** Save a user's edits as a new version. */
export function saveEdit(ws: Workspace, assetId: ID, content: AssetContent, reason: string, by = 'You'): Workspace {
  const asset = getAsset(ws, assetId)
  if (!asset) return ws
  const base = currentVersion(asset)
  const next = appendVersion(asset, {
    ...base,
    id: newId('ver'),
    content,
    status: 'draft',
    createdAt: ws.now,
    createdBy: 'user',
    generator: by,
    changeSummary: 'Edited by hand',
    changeReason: reason || 'Manual edit',
    critique: undefined,
    preRevisionCritique: undefined,
    approvedAt: undefined,
    approvedBy: undefined,
    publishedAt: undefined,
    externalRef: undefined,
    parentVersionId: base.id,
  })
  return log(upsertAsset(ws, next), 'edit', `${by} saved ${next.versions[next.versions.length - 1].label} of “${asset.name}”: ${reason || 'manual edit'}`, { type: 'asset', id: asset.id })
}

/** Roll back by creating a new version that copies an older one (history is preserved). */
export function rollback(ws: Workspace, assetId: ID, toVersionId: ID, by = 'You'): Workspace {
  const asset = getAsset(ws, assetId)
  const target = asset?.versions.find((v) => v.id === toVersionId)
  if (!asset || !target) return ws
  const next = appendVersion(asset, {
    ...target,
    id: newId('ver'),
    status: 'draft',
    createdAt: ws.now,
    createdBy: 'user',
    generator: by,
    changeSummary: `Rollback to ${target.label}`,
    changeReason: `Restored content of ${target.label}`,
    publishedAt: undefined,
    externalRef: undefined,
    parentVersionId: target.id,
  })
  return log(upsertAsset(ws, next), 'rollback', `${by} rolled “${asset.name}” back to ${target.label} as a new version.`, { type: 'asset', id: asset.id })
}

export function setCurrentVersion(ws: Workspace, assetId: ID, versionId: ID): Workspace {
  const asset = getAsset(ws, assetId)
  if (!asset) return ws
  return upsertAsset(ws, { ...asset, currentVersionId: versionId })
}

// ---------------------------------------------------------------------------
// Approvals
// ---------------------------------------------------------------------------

export function requestApproval(
  ws: Workspace,
  req: Omit<ApprovalRequest, 'id' | 'requestedAt' | 'status'>,
): Workspace {
  const dupe = ws.approvals.find((a) => a.status === 'pending' && a.action === req.action && JSON.stringify(a.payload) === JSON.stringify(req.payload))
  if (dupe) return ws
  const approval: ApprovalRequest = { ...req, id: newId('apr'), requestedAt: ws.now, status: 'pending' }
  return log({ ...ws, approvals: [approval, ...ws.approvals] }, 'approval_requested', `Approval requested: ${req.title}`)
}

export function decide(ws: Workspace, approvalId: ID, approved: boolean, by = 'You'): Workspace {
  const a = ws.approvals.find((x) => x.id === approvalId)
  if (!a || a.status !== 'pending') return ws
  const approvals = ws.approvals.map((x) => (x.id === approvalId ? { ...x, status: approved ? ('approved' as const) : ('rejected' as const), decidedBy: by, decidedAt: ws.now } : x))
  let next: Workspace = { ...ws, approvals }
  if (approved && a.payload.assetId && a.payload.versionId) {
    next = markVersion(next, a.payload.assetId, a.payload.versionId, { status: 'approved', approvedBy: by, approvedAt: ws.now })
  }
  if (a.payload.experimentId && !approved) {
    next = { ...next, experiments: next.experiments.map((e) => (e.id === a.payload.experimentId ? { ...e, status: 'draft' } : e)) }
  }
  return log(next, approved ? 'approved' : 'rejected', `${by} ${approved ? 'approved' : 'rejected'}: ${a.title}`)
}

function markVersion(ws: Workspace, assetId: ID, versionId: ID, patch: Partial<AssetVersion>): Workspace {
  const asset = getAsset(ws, assetId)
  if (!asset) return ws
  return upsertAsset(ws, { ...asset, versions: asset.versions.map((v) => (v.id === versionId ? { ...v, ...patch } : v)) })
}

async function publishVersion(ws: Workspace, assetId: ID, versionId: ID, connectors?: Connector[]): Promise<{ ws: Workspace; note: string }> {
  const asset = getAsset(ws, assetId)
  const version = asset?.versions.find((v) => v.id === versionId)
  if (!asset || !version) return { ws, note: 'Asset not found.' }
  const connector = connectorFor(asset.channel, connectors)
  const res = await connector.publish(asset, version)
  const versions = asset.versions.map((v) =>
    v.id === versionId
      ? { ...v, status: 'published' as const, publishedAt: ws.now, externalRef: { connector: connector.id, externalId: res.externalId, url: res.url } }
      : v.status === 'published'
        ? { ...v, status: 'retired' as const }
        : v,
  )
  return { ws: upsertAsset(ws, { ...asset, versions, publishedVersionId: versionId, currentVersionId: versionId }), note: res.note }
}

/** Execute an approved request. Refuses anything that is not approved. */
export async function execute(ws: Workspace, approvalId: ID, connectors?: Connector[]): Promise<Workspace> {
  const a = ws.approvals.find((x) => x.id === approvalId)
  if (!a || a.status !== 'approved') return ws
  let next = ws
  let result = ''
  try {
    switch (a.action as ActionKind) {
      case 'publish_asset':
      case 'launch_ads':
      case 'activate_sequence':
      case 'rollback': {
        const r = await publishVersion(next, a.payload.assetId!, a.payload.versionId!, connectors)
        next = r.ws
        result = r.note
        break
      }
      case 'launch_experiment': {
        const exp = next.experiments.find((e) => e.id === a.payload.experimentId)
        if (!exp) throw new Error('Experiment not found')
        // Challengers get experiment traffic only; they are not "published" until a rollout is approved.
        for (const v of exp.variants) {
          const asset = getAsset(next, v.assetId)
          const version = asset?.versions.find((x) => x.id === v.versionId)
          if (asset && version && version.status !== 'published') next = markVersion(next, v.assetId, v.versionId, { status: 'approved', approvedAt: next.now })
        }
        next = { ...next, experiments: next.experiments.map((e) => (e.id === exp.id ? { ...e, status: 'running', startedAt: next.now } : e)) }
        if (exp.problemId) next = updateProblem(next, exp.problemId, 'experimenting', `Experiment “${exp.name}” started.`)
        result = `Experiment started with a ${exp.variants.map((v) => Math.round(v.split * 100)).join('/')} split.`
        break
      }
      case 'update_messaging':
        result = 'Messaging update applied.'
        break
    }
    next = { ...next, approvals: next.approvals.map((x) => (x.id === a.id ? { ...x, status: 'executed', result } : x)) }
    return log(next, 'executed', `Executed: ${a.title}. ${result}`)
  } catch (err) {
    next = { ...next, approvals: next.approvals.map((x) => (x.id === a.id ? { ...x, status: 'failed', result: (err as Error).message } : x)) }
    return log(next, 'failed', `Failed: ${a.title} — ${(err as Error).message}`)
  }
}

export function updateProblem(ws: Workspace, problemId: ID, status: Workspace['problems'][number]['status'], event: string): Workspace {
  return { ...ws, problems: ws.problems.map((p) => (p.id === problemId ? { ...p, status, timeline: [...p.timeline, { at: ws.now, event }] } : p)) }
}

// ---------------------------------------------------------------------------
// Experiments & learning
// ---------------------------------------------------------------------------

/** Conclude an experiment: record the result, refresh learnings, link them to the problem. */
export function concludeExperiment(ws: Workspace, experimentId: ID): Workspace {
  const exp = ws.experiments.find((e) => e.id === experimentId)
  if (!exp) return ws
  const ended = { ...exp, endedAt: ws.now }
  const result = evaluateExperiment(ws, ended)
  let next: Workspace = { ...ws, experiments: ws.experiments.map((e) => (e.id === exp.id ? { ...ended, status: 'concluded', result } : e)) }
  next = refreshLearnings(next)
  const related = next.learnings.filter((l) => l.evidence.experimentIds.includes(exp.id) && l.direction !== 'neutral').map((l) => l.id)
  next = { ...next, experiments: next.experiments.map((e) => (e.id === exp.id ? { ...e, result: { ...result, learningIds: related } } : e)) }
  if (exp.problemId) {
    next = { ...next, problems: next.problems.map((p) => (p.id === exp.problemId ? { ...p, learningIds: Array.from(new Set([...p.learningIds, ...related])) } : p)) }
    next = updateProblem(next, exp.problemId, result.winner && result.winner !== exp.variants[0].key ? 'resolved' : 'experimenting', `Result: ${result.summary}`)
  }
  // Promoting a winner is consequential: ask for approval rather than doing it.
  if (result.winner) {
    const v = exp.variants.find((x) => x.key === result.winner)!
    next = requestApproval(next, {
      action: 'publish_asset',
      title: `Roll out winner: ${v.label}`,
      description: `Send 100% of traffic to ${v.label}.`,
      why: result.summary,
      payload: { assetId: v.assetId, versionId: v.versionId, experimentId: exp.id },
      risk: 'low',
      requestedBy: 'agent',
    })
  }
  return log(next, 'experiment_concluded', `Experiment “${exp.name}” concluded. ${result.summary}`, { type: 'experiment', id: exp.id })
}

export function refreshLearnings(ws: Workspace): Workspace {
  return { ...ws, learnings: computeLearnings(ws) }
}
