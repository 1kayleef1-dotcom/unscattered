/**
 * Claude proxy for the Marketing OS.
 *
 * The browser app never holds an API key. It calls this server, which
 * holds ANTHROPIC_API_KEY and calls Claude with the writer, reviser,
 * critic and extractor prompts in ./claude.ts.
 *
 *   ANTHROPIC_API_KEY=... npm run server          # http://localhost:8787
 *
 * Env: PORT (8787), MOS_MODEL (claude-opus-5), MOS_ALLOWED_ORIGIN (*).
 */
import Anthropic from '@anthropic-ai/sdk'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { ClaudeCopyModel, MODEL } from './claude.ts'

const PORT = Number(process.env.PORT ?? 8787)
const ORIGIN = process.env.MOS_ALLOWED_ORIGIN ?? '*'
const MAX_BODY = 4 * 1024 * 1024
const model = new ClaudeCopyModel()

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    'content-type': 'application/json',
    'access-control-allow-origin': ORIGIN,
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type',
  })
  res.end(JSON.stringify(body))
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > MAX_BODY) throw Object.assign(new Error('Request too large'), { status: 413 })
    chunks.push(chunk as Buffer)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as Record<string, unknown>
}

/** Minimal shape checks so malformed requests get a 400, not a stack trace. */
function require(body: Record<string, unknown>, fields: string[]): void {
  const missing = fields.filter((f) => body[f] === undefined || body[f] === null)
  if (missing.length) throw Object.assign(new Error(`Missing field(s): ${missing.join(', ')}`), { status: 400 })
}

function statusFor(err: unknown): number {
  if (err instanceof Anthropic.RateLimitError) return 429
  if (err instanceof Anthropic.AuthenticationError) return 502
  if (err instanceof Anthropic.BadRequestError) return 502
  if (err instanceof Anthropic.APIError) return 502
  return (err as { status?: number }).status ?? 500
}

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {})
  const url = new URL(req.url ?? '/', 'http://localhost')
  try {
    if (req.method === 'GET' && url.pathname === '/api/health') return send(res, 200, { ok: Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN), model: MODEL })
    if (req.method !== 'POST') return send(res, 404, { error: 'Not found' })
    const body = await readJson(req)
    switch (url.pathname) {
      case '/api/write':
        require(body, ['assetType', 'channel', 'plan', 'brief', 'brand'])
        return send(res, 200, { content: await model.write(body as never) })
      case '/api/revise':
        require(body, ['assetType', 'channel', 'plan', 'brief', 'brand', 'content', 'failedChecks'])
        return send(res, 200, { content: await model.revise(body as never) })
      case '/api/critique':
        require(body, ['assetType', 'content', 'brief', 'brand'])
        return send(res, 200, { checks: await model.critique(body as never) })
      case '/api/extract':
        require(body, ['sources'])
        return send(res, 200, { tagged: await model.tagSources((body.sources ?? []) as never, (body.competitors ?? []) as never) })
      default:
        return send(res, 404, { error: 'Not found' })
    }
  } catch (err) {
    console.error(`[${url.pathname}]`, err)
    return send(res, statusFor(err), { error: (err as Error).message })
  }
})

server.listen(PORT, () => console.log(`Marketing OS Claude proxy on http://localhost:${PORT} (model ${MODEL})`))
