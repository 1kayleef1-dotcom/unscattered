/**
 * Execution connectors. Consequential actions only ever run through an
 * approved `ApprovalRequest`; connectors are the boundary to the outside
 * world (CMS, ESP, ad platforms). The demo connector records the action
 * and lets the simulator generate performance for it.
 */
import type { Asset, AssetVersion, Channel } from '../types.ts'

export interface PublishResult {
  externalId: string
  url?: string
  note: string
}

export interface Connector {
  id: string
  label: string
  channels: Channel[]
  publish(asset: Asset, version: AssetVersion): Promise<PublishResult>
}

export class DemoConnector implements Connector {
  id = 'demo'
  label = 'Demo connector (simulated)'
  channels: Channel[] = ['web', 'email', 'meta', 'google', 'linkedin', 'tiktok', 'youtube', 'x', 'instagram', 'threads', 'sales']
  async publish(asset: Asset, version: AssetVersion): Promise<PublishResult> {
    const externalId = `${asset.channel}-${version.id}`
    const verb = asset.channel === 'web' ? 'Page published' : asset.channel === 'email' ? 'Sequence activated' : asset.channel === 'sales' ? 'Shared with sales' : 'Campaign launched'
    return { externalId, url: asset.channel === 'web' ? `https://demo.invalid/p/${version.id}` : undefined, note: `${verb} on the demo connector.` }
  }
}

export function connectorFor(_channel: Channel, connectors: Connector[] = [new DemoConnector()]): Connector {
  return connectors.find((c) => c.channels.includes(_channel)) ?? connectors[0]
}
