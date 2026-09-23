/**
 * Run the autonomous operator once against a workspace file — the
 * "every morning" job. Schedule it with cron, a CI schedule, or any job
 * runner:
 *
 *   ANTHROPIC_API_KEY=... npm run agent:daily -- workspace.json
 *
 * Reads the exported workspace, runs the 12-step loop (prepares assets and
 * requests approvals; executes only what humans already approved), writes
 * the workspace back and prints the run. Without an API key it uses the
 * offline composer. With no file argument it runs on the demo workspace.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { runAgent } from '../src/core/agent/agent.ts'
import { LocalCopyModel } from '../src/core/copy/model.ts'
import { createSeedWorkspace } from '../src/core/seed/workspace.ts'
import type { Workspace } from '../src/core/types.ts'
import { ClaudeCopyModel } from './claude.ts'

const file = process.argv[2]
const ws: Workspace = file ? (JSON.parse(await readFile(file, 'utf8')) as Workspace) : await createSeedWorkspace(undefined, { runAgent: false })
const today = new Date()
today.setUTCHours(8, 0, 0, 0)
const now = file && today.toISOString() > ws.now ? today.toISOString() : ws.now
const model = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN ? new ClaudeCopyModel() : new LocalCopyModel()

const { ws: next, run } = await runAgent({ ...ws, now }, { model })
console.log(`\n${run.headline}\n`)
for (const s of run.steps) {
  console.log(`${String(s.n).padStart(2)}. ${s.status === 'attention' ? '!' : ' '} ${s.name}: ${s.summary}`)
  for (const i of s.items) console.log(`      - ${i}`)
}
if (file) {
  await writeFile(file, JSON.stringify(next))
  console.log(`\nWorkspace updated: ${file}`)
}
