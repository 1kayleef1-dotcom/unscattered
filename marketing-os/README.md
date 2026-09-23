# Marketing OS

An AI marketing operator, not an AI writer. It understands the business, notices what needs to improve, works out why, writes the fix from evidence, runs it behind human approval, measures the result, and remembers what worked for *this* business.

```text
UNDERSTAND BUSINESS → DETECT PROBLEM / OPPORTUNITY → INVESTIGATE → AUDIENCE + MOTIVATION
→ STRATEGY → COPY + CREATIVE → EXECUTE (approved) → MEASURE → LEARN → better next time
```

It lives in its own package inside this repo and doesn't touch the `unscattered` app at the root.

## Run it

```bash
cd marketing-os
npm install
npm run dev        # the workspace UI (http://localhost:5173)
npm test           # 26 engine + end-to-end loop tests
npm run build      # type-check + production build
```

On first load the app builds a demo workspace for **Tallyforge**, a fictional accounts-payable SaaS company. The history comes from running the real engines against 60 days of simulated traffic:

- The page got a legacy human-written V1. The generated V2 beat it in a concluded experiment.
- Ads, emails and social posts are generated from briefs and have performance history.
- The operator's first morning run has already happened. It found that qualified conversion **dropped 24%** on the mid-market demo page. It ruled out traffic mix, audience mix and version changes, and saw that mobile dropped disproportionately. In recent sales calls it found that "too expensive" co-occurs with ROI uncertainty 77% of the time. Its conclusion: *visitors don't understand the economic value*. It prepared an ROI-led challenger page, ad angles, a nurture sequence and retargeting creative. It designed a 50/50 experiment and queued everything for approval.

Approve the items on the command center, then press **Simulate 7 days** a couple of times. The experiment concludes, the problem resolves, and the learning shows up in Intelligence and in future briefs. Clicking **Settings → Reset demo** starts over.

### With Claude

The browser never holds an API key. Run the proxy, which does hold the key:

```bash
ANTHROPIC_API_KEY=sk-ant-... npm run server   # http://localhost:8787
```

Then go to **Settings → Proxy URL** and enter `http://localhost:8787`. Alternatively, build with `VITE_MOS_API` set. Writer, reviser, critic and customer-language extractor each use their own prompt (`server/claude.ts`). Every call uses structured outputs, adaptive thinking and server-side refusal fallbacks, and caches the Brand Brain as part of the prompt prefix. The default model is `claude-opus-5`; override it with `MOS_MODEL`. If any call fails, generation falls back to the offline composer and records that on the version.

### Every morning

```bash
ANTHROPIC_API_KEY=... npm run agent:daily -- workspace.json
```

This runs the 12-step loop against an exported workspace (Settings → Export) and writes the result back. It prepares assets and requests approvals. It only executes what a human has already approved. Schedule it with cron or any job runner.

## How the spec maps to the code

Everything is plain TypeScript over one `Workspace` model (`src/core/types.ts`). Engines are pure functions, so the browser, the proxy and the scheduled job all run the same logic.

| Capability | Where | What it actually does |
|---|---|---|
| Brand Brain | `types.ts` (`BrandBrain`), `ui/pages/Brand.tsx` | Positioning, offers, segments, personas, voice (words to use/avoid, substitutions, reading level), claims (approved / needs proof / prohibited), proof, competitors, pillars. Performance memory lists high- and low-performing copy by measured lift, never by self-assessment. |
| Customer language | `core/language/customerLanguage.ts` | Tags each sentence of the reviews, calls, tickets, surveys, CRM notes, chats and testimonials. Tags cover pain, desired outcome, objection, trigger, emotion, reason chose/rejected, competitor and request. Themed insights keep the verbatim quotes, a 30-day trend, recurring phrases, competitor mentions via aliases, and theme co-occurrence. Claude can replace the tagger. |
| Think before writing | `core/brief/brief.ts` | Builds the Marketing Brief: offer, audience, problem (in the customer's words), desired outcome, awareness, sophistication, objections paired with proof-backed answers, alternatives, competitors, proof ranked by past results, positioning, message, CTA, learnings. Every field carries its evidence. Anything it can't ground goes in `gaps` instead of being made up. |
| Landing pages | `core/strategy/landing.ts` | Scores seven approaches (problem-, outcome-, proof-, demo-, comparison-, education-, product-led) on awareness, sophistication, traffic source, price, purchase complexity, evidence, objections and learned results. Sections are added or dropped per brief (ROI, implementation, FAQ, risk reversal…). Every choice is explained, including the alternatives it didn't pick. |
| Email lifecycle | `core/strategy/email.ts` | 19 sequences across acquisition, conversion, retention and recovery, each a narrative arc. Email count comes from open objections and awareness distance; timing comes from purchase complexity. Includes branch and exit rules and personalization. It won't invent urgency when there's no real deadline. |
| Ads | `core/strategy/ads.ts` | 10 strategic angles, each with evidence requirements, a hypothesis, a creative direction and a success metric. Angles without evidence are rejected with a reason. Platform specs cover Meta, Google, LinkedIn, TikTok and YouTube. |
| Social | `core/strategy/social.ts` | Posts come from real material: customer questions, stories, data, a point of view on the status quo, product insight, founder voice. Each is tied to an objective, and recently covered themes are down-ranked. |
| Repurposing | `core/actions.ts` (`repurpose`) | One proof becomes a page section, an email, a LinkedIn post, an X thread, an Instagram carousel, a video script, ad concepts and sales enablement. Each asset keeps the source message and is linked back to it. |
| Creative concepts | `copy/plan.ts`, `copy/localWriter.ts` | Ad concepts cover visual, hook, message, support, CTA, audience and hypothesis. Video scripts cover hook, scenes, pattern interrupt, proof and CTA. |
| Copy Critic | `core/critic/critic.ts` + `server/claude.ts` | A deterministic rules critic runs across 4 dimensions and 19 criteria, including unsupported numbers checked against the proof corpus, prohibited claims, banned words and field lengths. An independent Claude critic with its own prompt never sees the writer's reasoning. Results merge (stricter score wins), then revision runs and the critic re-checks. |
| Versioning | `core/ops.ts`, `copy/pipeline.ts` | Edits, rewrites, tone/audience/strategy changes, messaging updates and rollbacks all append versions. Each version records what changed, why, who approved it, and its performance. |
| Strategy → copy chain | `StrategyChain` on every version | Business goal → objective → audience → problem → insight → positioning → message → concept → CTA → measurement. |
| Consistency | `core/messaging/messaging.ts` | Assets record which messaging model and version they came from. Changing the core message flags every derived asset, and "update all" regenerates each one as a new version. |
| Campaign planner | `core/planner/planner.ts` | Handles "We're launching next month" and "Sell this to dentists". It classifies the goal, investigates existing customers, proof and objections for that audience, creates and grounds a proposed segment, and states the gaps. It builds positioning, an offer recommendation, a messaging model and dependency-ordered workstreams, and gates consequential steps. |
| Problem solver | `core/solver/solver.ts` | Detects anomalies with daily-rate tests (robust to overdispersion, must be consistent across days). Investigates traffic, audience, device, source, version changes, customer research, competitors and learnings. Ranks hypotheses by mechanism and evidence, then proposes a solution with an asset plan and an experiment. |
| Experiments | `core/experiments/experiments.ts` | Sample size is planned up front. Results report a two-proportion test, Wilson intervals and Bayesian P(best). Early stopping requires overwhelming evidence. Rolling out a winner needs approval. |
| Learning | `core/learning/learning.ts` | Joins performance to copy decisions (strategy, angle, proof type, CTA, offer, sequence, theme) and estimates Beta posteriors shrunk to the segment baseline. Learnings are marked experiment-backed or observational. Decisions that changed together are reported as confounded rather than claimed twice. |
| Autonomous agent | `core/agent/agent.ts` | Inspect → detect → opportunities → experiments → research → problems → recommendations → prepare → approvals → execute approved → measure → memory. Every run is logged step by step. |
| Workspace | `ui/pages/Asset.tsx` | Generate, edit, compare versions (word diff), create variants, change tone/audience/strategy, see reasoning, brief, evidence, critique and results, run experiments, publish, roll back. |

## What is real and what is simulated

- **Real:** every engine above. It runs on whatever data the workspace holds: your Brand Brain, your pasted customer sources, your performance records.
- **Offline composer** (`core/copy/localWriter.ts`): writes only from workspace evidence and never invents numbers. The drafts are safe and well-structured, but plainer than Claude's. For free-form tone direction and final-quality prose, connect Claude.
- **Demo connector** (`core/performance/simulate.ts`, `core/execution/connectors.ts`): publishing and performance are simulated from a world model with hidden ground truth. For example, enterprise buyers respond to proof and not to discounts, and a price-sensitivity shock hit mobile. The system has to discover this. Replace it with real connectors by implementing `Connector.publish` and feeding `PerformanceRecord`s. Nothing else changes.
- **Storage:** the UI keeps the workspace in `localStorage`. You can export and import it as JSON.

## Layout

```
src/core/     domain model and engines (no React, no network)
src/ui/       React workspace (Vite, Tailwind v4, React Router)
server/       Claude proxy (index.ts), Claude copy model (claude.ts), scheduled agent (dailyAgent.ts)
```
