/**
 * Central messaging model and multi-channel consistency.
 *
 * Every asset's strategy chain points at the messaging model it was
 * written from, and records the model version. When the core message
 * changes, every derived asset — landing page, ads, emails, social,
 * retargeting, sales material — is flagged stale and can be regenerated
 * as a new version, so the campaign keeps saying one thing.
 */
import type { Asset, ID, MessagingModel, Workspace } from '../types.ts'
import { newId } from '../util/id.ts'
import { log } from '../ops.ts'

export function createMessagingModel(ws: Workspace, m: Omit<MessagingModel, 'id' | 'version' | 'updatedAt' | 'history'>): { ws: Workspace; model: MessagingModel } {
  const model: MessagingModel = { ...m, id: newId('msg'), version: 1, updatedAt: ws.now, history: [] }
  return { ws: log({ ...ws, messaging: [...ws.messaging, model] }, 'messaging', `Messaging model created: “${m.name}”.`), model }
}

export function assetsUsing(ws: Workspace, modelId: ID): Asset[] {
  return ws.assets.filter((a) => a.versions.some((v) => v.chain.messagingModelId === modelId))
}

export function updateMessaging(
  ws: Workspace,
  modelId: ID,
  patch: Partial<Pick<MessagingModel, 'coreMessage' | 'supportingPoints' | 'cta' | 'proofIds'>>,
  reason: string,
): Workspace {
  const model = ws.messaging.find((m) => m.id === modelId)
  if (!model) return ws
  const next: MessagingModel = {
    ...model,
    ...patch,
    version: model.version + 1,
    updatedAt: ws.now,
    history: [...model.history, { version: model.version, coreMessage: model.coreMessage, supportingPoints: model.supportingPoints, cta: model.cta, changedAt: model.updatedAt, reason }],
  }
  const staleIds = new Set<ID>()
  const assets = ws.assets.map((a) => {
    const current = a.versions.find((v) => v.id === a.currentVersionId)
    if (current?.chain.messagingModelId !== modelId) return a
    staleIds.add(a.id)
    return { ...a, stale: { reason: `Messaging v${next.version}: ${reason}`, since: ws.now, messagingVersion: next.version } }
  })
  return log({ ...ws, messaging: ws.messaging.map((m) => (m.id === modelId ? next : m)), assets }, 'messaging', `Messaging “${model.name}” → v${next.version} (${reason}). ${staleIds.size} asset(s) flagged for update.`)
}
